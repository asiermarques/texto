import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, simulateTyping, waitFor, waitForText } from './support';

// US-002: writing, saving, undoing and redoing.

suite('US-002: writing, saving, undoing and redoing', () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Texto inicial.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('writing a paragraph marks the tab as modified', async () => {
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Más.' }]);

    const document = await waitFor(async () => {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      return doc.isDirty ? doc : undefined;
    }, 'the TextDocument to be marked as modified');
    assert.strictEqual(document.isDirty, true);
    assert.strictEqual(document.getText(), 'Texto inicial. Más.');
  });

  test('saving writes valid markdown to disk', async () => {
    const panel = await openInWritingEditor(fileUri);
    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Guardado.' }]);
    await waitForText(fileUri, 'Texto inicial. Guardado.');

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();

    const onDisk = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.strictEqual(onDisk, 'Texto inicial. Guardado.');
    assert.strictEqual(document.isDirty, false);
  });

  test('undo reverts the last edit and redo applies it again', async () => {
    const panel = await openInWritingEditor(fileUri);
    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Añadido.' }]);
    await waitForText(fileUri, 'Texto inicial. Añadido.');

    await vscode.commands.executeCommand('undo');
    await waitForText(fileUri, 'Texto inicial.');

    await vscode.commands.executeCommand('redo');
    await waitForText(fileUri, 'Texto inicial. Añadido.');
  });

  test('writing at one point keeps the rest of the Chapter intact', async () => {
    await deleteScratchFile(fileUri);
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo con [un enlace](https://example.com).');
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 15, to: 15, insert: ' Extra.' }]);
    await waitForText(fileUri, 'Primer párrafo. Extra.\n\nSegundo párrafo con [un enlace](https://example.com).');

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    const onDisk = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.ok(onDisk.includes('[un enlace](https://example.com)'), 'the markdown outside the subset was not kept intact');
  });

  test('opening and closing without writing leaves no changes in the file', async () => {
    const before = await fs.promises.readFile(fileUri.fsPath, 'utf8');

    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel); // confirms the webview actually loaded
    await closeAllEditors();

    const after = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.strictEqual(after, before);
  });

  test('an edit of our own is not sent back as if it were an external change (no duplicated text)', async () => {
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Único.' }]);
    await waitForText(fileUri, 'Texto inicial. Único.');

    // If the extension echoed its own change back to the webview, the same
    // insertion would be applied a second time and the text would duplicate
    // or corrupt — give it time to (wrongly) arrive, then check it didn't.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.text, 'Texto inicial. Único.');
  });
});
