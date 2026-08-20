import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  getExtensionApi,
  openInWritingEditor,
  requestSnapshot,
  setCursor,
  setSelection,
  simulateTyping,
  waitFor,
} from './support';

// US-020: word count of the Chapter and of the selection, in the status bar.
// US-006 (003): the phrase resolves through vscode.l10n.t — this test host
// has no Spanish language pack (RISK-002), so it reads the in-source
// English strings, same as any VSCode not running in Spanish.

suite('US-020: word count in the status bar', () => {
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

  test('shows the word count of the open Chapter', async () => {
    fileUri = await createScratchFile('Un párrafo con varias palabras.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.visible ? s : undefined;
    }, 'the word count to appear');
    assert.strictEqual(state.text, '5 words');
  });

  test('a Chapter with exactly one prose word reads in the singular', async () => {
    fileUri = await createScratchFile('Palabra.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.visible ? s : undefined;
    }, 'the word count to appear');
    assert.strictEqual(state.text, '1 word');
  });

  test('the count rises when the Author writes', async () => {
    fileUri = await createScratchFile('Una palabra.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');

    await simulateTyping(panel, [{ from: 12, to: 12, insert: ' más' }]);

    const after = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.text === '3 words' ? s : undefined;
    }, 'the count to rise');
    assert.strictEqual(after.text, '3 words');
  });

  test('a markdown-rich Chapter is counted as prose, matching the same text without its marks', async () => {
    // "Un título" (2) + "Un párrafo con negrita." (4) + "Un elemento" (2) = 8; the Scene break adds nothing.
    fileUri = await createScratchFile('## Un título\n\nUn párrafo con **negrita**.\n\n---\n\n- Un elemento');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.visible ? s : undefined;
    }, 'the word count to appear');
    assert.strictEqual(state.text, '8 words');
  });

  test('selecting text also shows the selected word count, and it goes away when the selection is cleared', async () => {
    fileUri = await createScratchFile('Primero segundo tercero cuarto.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');

    await setSelection(panel, 0, 15); // "Primero segundo"

    const withSelection = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.text.includes('selected') ? s : undefined;
    }, 'the selection count to appear');
    assert.strictEqual(withSelection.text, '4 words (2 selected)');

    await setCursor(panel, 5);

    const withoutSelection = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return !s.text.includes('selected') ? s : undefined;
    }, 'the selection count to disappear');
    assert.strictEqual(withoutSelection.text, '4 words');
  });

  test('US-006: a selection of exactly one word reads in the singular, for both the total and the selection', async () => {
    fileUri = await createScratchFile('Palabra.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');

    await setSelection(panel, 0, 7); // "Palabra"

    const withSelection = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.text.includes('selected') ? s : undefined;
    }, 'the selection count to appear');
    assert.strictEqual(withSelection.text, '1 word (1 selected)');
  });

  test('US-002 (008): a burst of keystrokes inside the debounce interval recomputes the total at most once', async () => {
    fileUri = await createScratchFile('Una palabra.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');
    const before = api.getWordCountRecomputeCount(fileUri);

    // Four keystrokes fired back-to-back — well inside one ~200ms debounce window.
    await simulateTyping(panel, [{ from: 12, to: 12, insert: ' a' }]);
    await simulateTyping(panel, [{ from: 14, to: 14, insert: 'b' }]);
    await simulateTyping(panel, [{ from: 15, to: 15, insert: 'c' }]);
    await simulateTyping(panel, [{ from: 16, to: 16, insert: 'd' }]);

    const after = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.text === '3 words' ? s : undefined; // "Una palabra. abcd"
    }, 'the count to settle on the text produced by the whole burst');

    assert.strictEqual(after.text, '3 words');
    assert.strictEqual(
      api.getWordCountRecomputeCount(fileUri),
      before + 1,
      'the whole burst should have recomputed the total exactly once, not once per keystroke'
    );
  });

  test('US-002 (008): a Chapter closed before the debounce interval elapses does not crash, and a later Chapter counts correctly', async () => {
    fileUri = await createScratchFile('Una palabra.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');

    await simulateTyping(panel, [{ from: 12, to: 12, insert: ' más' }]);
    await closeAllEditors(); // closes well before the ~200ms debounce interval elapses

    // Give the pending debounce time to fire (or not) before opening the next Chapter.
    await new Promise((resolve) => setTimeout(resolve, 300));

    otherFileUri = await createScratchFile('Otro párrafo con cinco palabras aquí.');
    await openInWritingEditor(otherFileUri);
    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.visible ? s : undefined;
    }, 'the next Chapter to show its own count');
    assert.strictEqual(state.text, '6 words', "the closed Chapter's pending recompute must not have written over the new one");
  });

  test('US-002 (008): a change from outside the Writing editor settles the total under the same debounce rule', async () => {
    fileUri = await createScratchFile('Una palabra.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');
    await requestSnapshot(panel); // ensure handshake is settled before mutating on disk

    await fs.promises.writeFile(fileUri.fsPath, 'Cuatro palabras en total.', 'utf8');
    await vscode.commands.executeCommand('workbench.action.files.revert');

    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.text === '4 words' ? s : undefined;
    }, 'the total to settle on the externally-changed text');
    assert.strictEqual(state.text, '4 words');
  });

  test('RISK-007: leaving the Writing editor hides the status bar, returning to it shows it again', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera con palabras.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(async () => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to appear');

    otherFileUri = await createScratchFile('plain text, not a Chapter');
    const otherDocument = await vscode.workspace.openTextDocument(otherFileUri);
    await vscode.window.showTextDocument(otherDocument);

    await waitFor(async () => (!api.getWordCountStatusBarState().visible ? true : undefined), 'the word count to disappear');

    await openInWritingEditor(fileUri); // same as the Author clicking back on its tab

    const state = await waitFor(async () => {
      const s = api.getWordCountStatusBarState();
      return s.visible ? s : undefined;
    }, 'the word count to reappear');
    assert.strictEqual(state.text, '5 words');
  });
});
