import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, requestSnapshot } from './support';

// US-001: opening a Chapter in the Writing editor.

suite('US-001: opening a Chapter in the Writing editor', () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('opening with "Reopen Editor With…" shows the Chapter\'s content in the webview', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.text, 'Un párrafo de prueba.');
  });

  test('opening a markdown file without asking for the Writing editor uses the normal code editor', async () => {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const api = await getExtensionApi();
    assert.strictEqual(api.panelFor(fileUri), undefined);
    assert.ok(vscode.window.activeTextEditor, 'a normal text editor was expected to be active');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), fileUri.toString());
  });

  test('the open Chapter has no gutter and no line numbers', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.hasGutter, false);
  });

  test('an empty Chapter opens without error and with the cursor ready to write', async () => {
    await deleteScratchFile(fileUri);
    fileUri = await createScratchFile('');

    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.text, '');
    assert.strictEqual(snapshot.selectionHead, 0);
  });
});
