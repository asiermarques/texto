import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, simulateTyping, waitFor } from './support';

// The Frontmatter indicator: a status bar entry that says the open Chapter
// opens with a metadata block. `src/domain/frontmatter.ts` decides what
// counts as one (unit-tested there, Scene-break confusion included); this
// suite covers the half that only a real VSCode can answer — that the
// indicator is actually up, actually gone, and that it follows the Chapter
// as the Author edits it and moves between files.

const CHAPTER_WITH_BLOCK = '---\ntitle: Capítulo primero\nauthor: Asier\n---\n\nUn párrafo.';

suite('The Frontmatter indicator in the status bar', () => {
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

  test('appears, naming the block and counting its fields, when the Chapter has one', async () => {
    fileUri = await createScratchFile(CHAPTER_WITH_BLOCK);
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const indicator = await waitFor(() => {
      const state = api.getToolbarButtonState('frontmatter');
      return state?.visible ? state : undefined;
    }, 'the Frontmatter indicator to appear');
    assert.strictEqual(indicator.text, '$(tag) Frontmatter');
    assert.strictEqual(indicator.tooltip, 'Frontmatter: 2 metadata fields, not counted as prose');
  });

  test('appears for a TOML block too, the `+++` fence Hugo writes', async () => {
    fileUri = await createScratchFile(
      "+++\ntitle = 'Caminos'\ndescription = 'Un micro sobre caminos'\ndate = 2025-08-01T18:06:07+02:00\ndraft = false\n+++\n\nUn párrafo."
    );
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const indicator = await waitFor(() => {
      const state = api.getToolbarButtonState('frontmatter');
      return state?.visible ? state : undefined;
    }, 'the Frontmatter indicator to appear for a TOML block');
    assert.strictEqual(indicator.text, '$(tag) Frontmatter');
    assert.strictEqual(indicator.tooltip, 'Frontmatter: 4 metadata fields, not counted as prose');
  });

  test('reads in the singular for a block of one field', async () => {
    fileUri = await createScratchFile('---\ntitle: Solo uno\n---\n\nUn párrafo.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    await waitFor(
      () => (api.getToolbarButtonState('frontmatter')?.tooltip.includes('1 metadata field,') ? true : undefined),
      'the singular tooltip'
    );
  });

  test('stays hidden on a Chapter that opens with an ordinary Scene break', async () => {
    fileUri = await createScratchFile('---\n\nUna escena.\n\n---\n\nOtra escena.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    // The rest of the toolbar is up, so this is a real absence and not just
    // a toolbar that has not rendered yet.
    await waitFor(() => (api.getToolbarButtonState('size-value')?.visible ? true : undefined), 'the toolbar to appear');
    assert.strictEqual(api.getToolbarButtonState('frontmatter')?.visible, false);
  });

  test('appears once the Author finishes writing a block, without reopening the Chapter', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => (api.getToolbarButtonState('size-value')?.visible ? true : undefined), 'the toolbar to appear');
    assert.strictEqual(api.getToolbarButtonState('frontmatter')?.visible, false);

    await simulateTyping(panel, [{ from: 0, to: 0, insert: '---\ntitle: Algo\n---\n\n' }]);

    await waitFor(
      () => (api.getToolbarButtonState('frontmatter')?.visible ? true : undefined),
      'the indicator to appear as soon as the block is written'
    );
  });

  test('goes away when the Author deletes the block', async () => {
    fileUri = await createScratchFile(CHAPTER_WITH_BLOCK);
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('frontmatter')?.visible || undefined, 'the indicator to appear');

    // Everything up to and including the closing fence and its blank line.
    const blockLength = '---\ntitle: Capítulo primero\nauthor: Asier\n---\n\n'.length;
    await simulateTyping(panel, [{ from: 0, to: blockLength, insert: '' }]);

    await waitFor(() => (api.getToolbarButtonState('frontmatter')?.visible ? undefined : true), 'the indicator to go away');
  });

  test('follows the Chapter in view, not the last one that had a block', async () => {
    fileUri = await createScratchFile(CHAPTER_WITH_BLOCK);
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('frontmatter')?.visible || undefined, 'the indicator to appear');

    otherFileUri = await createScratchFile('Un capítulo sin metadatos.');
    await openInWritingEditor(otherFileUri);

    await waitFor(
      () => (api.getToolbarButtonState('frontmatter')?.visible ? undefined : true),
      'the indicator to go away for the second Chapter'
    );
  });
});
