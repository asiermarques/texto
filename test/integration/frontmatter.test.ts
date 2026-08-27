import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  getExtensionApi,
  openInWritingEditor,
  requestSnapshot,
  scrollToEnd,
  simulateTyping,
  waitFor,
} from './support';
import type { TextoExtensionApi } from '../../src/extension';

// Frontmatter is folded out of the Writing surface, and the toolbar button
// is both the sign that a block is there and the only way to unfold it.
// `src/domain/frontmatter.ts` decides what counts as one (unit-tested there,
// Scene-break confusion included); this suite covers the half only a real
// VSCode can answer — what is actually drawn, what the button says, and
// whether the two stay in step.

const YAML_CHAPTER = '---\ntitle: Capítulo primero\nauthor: Asier\n---\n\nUn párrafo.';
const TOML_CHAPTER =
  "+++\ntitle = 'Caminos'\ndescription = 'Un micro sobre caminos'\ndate = 2025-08-01T18:06:07+02:00\ndraft = false\n+++\n\nUn párrafo.";

async function toolbarUp(api: TextoExtensionApi): Promise<void> {
  await waitFor(() => (api.getToolbarButtonState('size-value')?.visible ? true : undefined), 'the toolbar to appear');
}

async function buttonReads(api: TextoExtensionApi, icon: string, why: string): Promise<void> {
  await waitFor(() => {
    const state = api.getToolbarButtonState('frontmatter');
    return state?.visible && state.text.includes(icon) ? true : undefined;
  }, why);
}

suite('Frontmatter: folded away, and unfolded from the toolbar', () => {
  let fileUri: vscode.Uri;
  let otherFileUri: vscode.Uri | undefined;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
    if (otherFileUri) {
      await deleteScratchFile(otherFileUri);
      otherFileUri = undefined;
    }
  });

  test('a Chapter opens with its metadata folded away, and the prose first', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await toolbarUp(api);

    const snapshot = await requestSnapshot(panel);
    assert.ok(!snapshot.renderedText.includes('title:'), `the block is still drawn: "${snapshot.renderedText}"`);
    assert.ok(snapshot.renderedText.includes('Un párrafo.'), 'the prose should still be there');
    // Folded, never edited: the Chapter on disk is untouched.
    assert.ok(snapshot.text.startsWith('---\ntitle:'), 'the Chapter itself must keep its Frontmatter');
  });

  test('the button says it is folded, and clicking it shows the block', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to read as folded');

    await vscode.commands.executeCommand('texto.toggleFrontmatter');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? s : undefined;
    }, 'the block to appear in the Writing surface');
    assert.ok(snapshot.renderedText.includes('author:'));
    await buttonReads(api, '$(eye)', 'the button to read as shown');
  });

  test('clicking it again folds the block back away', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to read as folded');

    await vscode.commands.executeCommand('texto.toggleFrontmatter');
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? s : undefined;
    }, 'the block to appear');

    await vscode.commands.executeCommand('texto.toggleFrontmatter');

    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? undefined : s;
    }, 'the block to fold away again');
    await buttonReads(api, '$(eye-closed)', 'the button to read as folded again');
  });

  test('unfolding carries the Author up to the block, wherever they were reading', async () => {
    // Long enough that the top of the Chapter is well off screen once the
    // Author has scrolled down to the end.
    const prose = Array.from({ length: 200 }, (_, i) => `Párrafo número ${i} de un Capítulo largo.`).join('\n\n');
    fileUri = await createScratchFile(`${YAML_CHAPTER}\n\n${prose}`);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to read as folded');

    // CodeMirror only builds the lines near the viewport, so `renderedText`
    // is what says where the Author is looking — and it is the only thing
    // that says it: `scrollDOM.scrollTop` read back through the snapshot
    // channel reports 0 even while the view is demonstrably at the end,
    // because the measurement lands before the browser has applied the
    // scroll. What is drawn cannot lie the same way.
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('Párrafo número 0') ? s : undefined;
    }, 'the Chapter to finish composing');

    await scrollToEnd(panel);
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('Párrafo número 0') ? undefined : s;
    }, 'the top of the Chapter to scroll out of view');

    await vscode.commands.executeCommand('texto.toggleFrontmatter');

    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? s : undefined;
    }, 'the view to be carried back up to the unfolded block');
  });

  test('folds a TOML block the same way', async () => {
    fileUri = await createScratchFile(TOML_CHAPTER);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to appear for a TOML block');

    const folded = await requestSnapshot(panel);
    assert.ok(!folded.renderedText.includes('Caminos'), `the TOML block is still drawn: "${folded.renderedText}"`);

    await vscode.commands.executeCommand('texto.toggleFrontmatter');
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('Caminos') ? s : undefined;
    }, 'the TOML block to appear');
  });

  test('the Word count counts the prose only, not the metadata', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    // "Un párrafo." is two words; the four in the block are not prose.
    await waitFor(() => (api.getWordCountStatusBarState().text.startsWith('2 words') ? true : undefined), 'the count to exclude the block');
  });

  test('no button, and nothing folded, on a Chapter that opens with a Scene break', async () => {
    fileUri = await createScratchFile('---\n\nUna escena.\n\n---\n\nOtra escena.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await toolbarUp(api);

    assert.strictEqual(api.getToolbarButtonState('frontmatter')?.visible, false);
    const snapshot = await requestSnapshot(panel);
    assert.ok(snapshot.renderedText.includes('Una escena.'), 'an opening Scene must never be folded away');
  });

  test('Raw markdown shows the block even while the fold is on', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to read as folded');

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');

    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? s : undefined;
    }, 'the raw view to show the whole Chapter, block included');

    // And the Author's own choice survives the round trip.
    await vscode.commands.executeCommand('texto.toggleRawMarkdown');
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('title:') ? undefined : s;
    }, 'the block to be folded again on the way back');
  });

  test('the button appears as soon as the Author writes a block, and folds it', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await toolbarUp(api);
    assert.strictEqual(api.getToolbarButtonState('frontmatter')?.visible, false);

    await simulateTyping(panel, [{ from: 0, to: 0, insert: '---\ntitle: Algo\n---\n\n' }]);

    await buttonReads(api, '$(eye-closed)', 'the button to appear once the block is written');
    const snapshot = await requestSnapshot(panel);
    assert.ok(!snapshot.renderedText.includes('title:'), 'the freshly written block should fold itself away');
  });

  test('the fold follows the Chapter in view, not the last one that had a block', async () => {
    fileUri = await createScratchFile(YAML_CHAPTER);
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await buttonReads(api, '$(eye-closed)', 'the button to appear');

    otherFileUri = await createScratchFile('Un capítulo sin metadatos.');
    await openInWritingEditor(otherFileUri);

    await waitFor(() => (api.getToolbarButtonState('frontmatter')?.visible ? undefined : true), 'the button to go away for the second Chapter');
  });
});
