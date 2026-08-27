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

  test('one undo reverts the keystroke and the padding it caused together', async () => {
    fileUri = await createScratchFile(SLOPPY);
    const panel = await openInWritingEditor(fileUri);

    const at = SLOPPY.indexOf('Ana') + 'Ana'.length;
    await setCursor(panel, at);
    await simulateTyping(panel, [{ from: at, to: at, insert: 's' }]);
    await waitForText(fileUri, PADDED.replace('| Ana    |', '| Anas   |'));

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
