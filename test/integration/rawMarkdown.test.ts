import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  openInWritingEditor,
  requestSnapshot,
  setCursor,
  simulateTyping,
  waitFor,
  waitForText,
} from './support';

// US-022: seeing the Chapter's raw markdown, in place.

const TOGGLE_COMMAND = 'texto.toggleRawMarkdown';

suite('US-022: raw markdown view', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('activating it shows the full markdown syntax: hashes, asterisks and dashes', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo con **negrita**.\n\n---\n\nOtro párrafo.');
    const panel = await openInWritingEditor(fileUri);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.length > 0 ? true : undefined), 'the Chapter to be composed first');

    await vscode.commands.executeCommand(TOGGLE_COMMAND);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.length === 0 ? s : undefined;
    }, 'all live-preview classes to disappear');
    // renderedText is DOM textContent across CodeMirror's per-line elements,
    // which never carries the newlines between them — comparing with those
    // stripped is what "nothing is hidden" actually means here.
    assert.strictEqual(snapshot.renderedText, snapshot.text.replace(/\n/g, ''), 'no marker should be hidden');
    assert.ok(snapshot.renderedText.includes('##'));
    assert.ok(snapshot.renderedText.includes('**'));
    assert.ok(snapshot.renderedText.includes('---'));
  });

  test('writing while the markdown is showing saves exactly like the composed view', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    await vscode.commands.executeCommand(TOGGLE_COMMAND);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.length === 0 ? true : undefined), 'the raw view to activate');

    await simulateTyping(panel, [{ from: 10, to: 10, insert: ' más' }]); // before the trailing period

    await waitForText(fileUri, 'Un párrafo más.');
  });

  test('with Focus mode on, no paragraph is dimmed while the markdown is showing', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 20);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'Focus mode to dim the other paragraph first');

    await vscode.commands.executeCommand(TOGGLE_COMMAND);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.length === 0 ? s : undefined;
    }, 'the raw view to activate');
    assert.deepStrictEqual(snapshot.dimmedText, []);
  });

  test('turning it off restores the composition and keeps the cursor in place', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo.');
    const panel = await openInWritingEditor(fileUri);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-heading-2') ? true : undefined), 'the heading to compose first');
    await setCursor(panel, 5);

    await vscode.commands.executeCommand(TOGGLE_COMMAND);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.length === 0 ? true : undefined), 'the raw view to activate');

    await vscode.commands.executeCommand(TOGGLE_COMMAND);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-2') ? s : undefined;
    }, 'the composition to come back');
    assert.strictEqual(snapshot.selectionHead, 5, 'the cursor should not have moved');
  });

  test('closing and reopening the Chapter opens it composed, not with the markdown showing', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo.');
    let panel = await openInWritingEditor(fileUri);
    await vscode.commands.executeCommand(TOGGLE_COMMAND);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.length === 0 ? true : undefined), 'the raw view to activate');

    await closeAllEditors();
    panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-2') ? s : undefined;
    }, 'the Chapter to reopen composed');
    assert.ok(snapshot.liveClasses.length > 0);
  });
});
