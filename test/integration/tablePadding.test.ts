import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  openInWritingEditor,
  requestSnapshot,
  setCursor,
  simulateTyping,
  undoCommandsCanRun,
  waitFor,
  waitForText,
} from './support';

/**
 * US-003 of 009: the padded source, through the real bridge. The unit suite
 * (`test/unit/tablePadding.test.ts`) proves what the padding IS; this
 * proves it reaches the `TextDocument` at all, and — RISK-002, the reason
 * the whole story is risky — that it reaches it inside the same undo step
 * as the keystroke that caused it.
 */

const SLOPPY = ['Antes.', '', '| Nombre | Rol |', '|-|-|', '| Ana | Protagonista |', '', 'Después.'].join('\n');
const PADDED = [
  'Antes.',
  '',
  '| Nombre | Rol          |',
  '|--------|--------------|',
  '| Ana    | Protagonista |',
  '',
  'Después.',
].join('\n');

suite('US-003 (009): a Table s source padded while the Author types', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('typing inside a Cell pads every Row and the Delimiter row in the file', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);

    // A character at the end of "Ana", where a real keystroke would land.
    const at = SLOPPY.indexOf('Ana') + 'Ana'.length;
    await setCursor(panel, at);
    await simulateTyping(panel, [{ from: at, to: at, insert: 's' }]);

    await waitForText(fileUri, PADDED.replace('| Ana    |', '| Anas   |'));
  });

  // BR-001, asserted where it is actually decided rather than through the
  // undo command: the keystroke and the padding it caused reach the Chapter
  // as ONE change — one event, several ranges, one version — and one version
  // is one undo step. This is what the `transactionFilter` in
  // `tablePaddingPlugin.ts` exists to guarantee; a padding edit dispatched
  // separately would show up here as a second event, and only afterwards as
  // the half-padded Table a single undo would leave behind.
  test('the keystroke and the padding it caused reach the Chapter as one change — one undo step', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);
    const document = await vscode.workspace.openTextDocument(fileUri);
    const versionBefore = document.version;
    const collected: vscode.TextDocumentContentChangeEvent[][] = [];
    const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
      // Only events that actually changed something: VSCode also fires this
      // with an empty `contentChanges` when a document's dirty state moves,
      // and `WritingEditorProvider` ignores those for the same reason.
      if (event.document.uri.toString() === fileUri.toString() && event.contentChanges.length > 0) {
        collected.push([...event.contentChanges]);
      }
    });

    const at = SLOPPY.indexOf('Ana') + 'Ana'.length;
    try {
      await setCursor(panel, at);
      await simulateTyping(panel, [{ from: at, to: at, insert: 's' }]);
      await waitForText(fileUri, PADDED.replace('| Ana    |', '| Anas   |'));
    } finally {
      subscription.dispose();
    }

    assert.strictEqual(collected.length, 1, `the keystroke and its padding should be one document change, not ${collected.length}`);
    assert.strictEqual(document.version - versionBefore, 1, 'one document change should be one version, which is one undo step');
    assert.ok(
      collected[0].length > 1,
      `that one change should carry the padding as well as the keystroke: ${JSON.stringify(collected[0].map((change) => change.text))}`
    );
  });

  test('one undo reverts the keystroke and the padding it caused together', async function () {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);

    const at = SLOPPY.indexOf('Ana') + 'Ana'.length;
    await setCursor(panel, at);
    await simulateTyping(panel, [{ from: at, to: at, insert: 's' }]);
    await waitForText(fileUri, PADDED.replace('| Ana    |', '| Anas   |'));

    // The undo step itself is asserted by the test above, which needs no
    // focus; this is the round trip through VSCode's own command, and it only
    // reaches a Chapter through a really-focused editor.
    if (!(await undoCommandsCanRun(panel))) {
      console.log("    (skipped: VSCode's window is not frontmost, so undo cannot be routed to the Chapter — see undoCommandsCanRun)");
      this.skip();
    }

    await vscode.commands.executeCommand('undo');

    await waitForText(fileUri, SLOPPY);
  });

  test('opening a Chapter with an unpadded Table and writing nothing leaves the file alone', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);
    await setCursor(panel, SLOPPY.indexOf('Ana'));
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(document.getText(), SLOPPY, 'the Table was padded without the Author writing anything');
    assert.strictEqual(document.isDirty, false, 'opening a Chapter marked it as modified');
    assert.strictEqual(await fs.promises.readFile(fileUri.fsPath, 'utf8'), SLOPPY);
  });

  test('typing in a Paragraph outside any Table produces no padding edit', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 'Antes.'.length);
    await simulateTyping(panel, [{ from: 'Antes.'.length, to: 'Antes.'.length, insert: ' Más.' }]);

    await waitForText(fileUri, SLOPPY.replace('Antes.', 'Antes. Más.'));
  });

  test('a change made outside the editor is not answered with a padding edit', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);
    // The cursor inside the Table is the state EDGE-005 is about: an
    // external change arriving while the Author is sitting in it.
    await setCursor(panel, SLOPPY.indexOf('Ana'));
    await requestSnapshot(panel);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(fileUri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 6)), 'Antes!');
    assert.ok(await vscode.workspace.applyEdit(edit), 'the test external edit could not be applied');

    const expected = SLOPPY.replace('Antes.', 'Antes!');
    await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.text === expected ? true : undefined;
    }, 'the webview to reflect the external change');

    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(document.getText(), expected, 'the external change was answered with a padding edit');
  });

  test('a half-written Table is left exactly as it was typed', async () => {
    const half = 'Antes.\n\n| a | b';
    fileUri = await createScratchFile(half);
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, half.length);
    await simulateTyping(panel, [{ from: half.length, to: half.length, insert: ' |' }]);

    await waitForText(fileUri, `${half} |`);
  });
});
