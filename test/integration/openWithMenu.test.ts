import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, waitFor } from './support';

// US-023/US-024: opening a Chapter with the right editor from the context
// menu, in both directions, without going through "Reopen Editor With…".

suite('US-023: "Abrir con Texto"', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('opens a .md outside a Writing space in the Writing editor', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document); // starts in the plain code editor

    await vscode.commands.executeCommand('texto.openWithTexto', fileUri);

    const api = await getExtensionApi();
    await waitFor(() => (api.panelFor(fileUri) ? true : undefined), 'the Chapter to open in the Writing editor');
  });

  test('from a .md already open in the code editor, switches it to the Writing editor in place', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
    assert.ok(vscode.window.activeTextEditor);

    // What invoking the command from the tab's own context menu does — no
    // explicit resource argument, the same as the palette form.
    await vscode.commands.executeCommand('texto.openWithTexto');

    const api = await getExtensionApi();
    await waitFor(() => (api.panelFor(fileUri) ? true : undefined), 'the Chapter to switch to the Writing editor');
  });
});

suite('US-024: "Abrir como markdown"', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('opens a Chapter from the Writing editor in the plain code editor', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    await openInWritingEditor(fileUri);

    await vscode.commands.executeCommand('texto.openAsMarkdown', fileUri);

    assert.ok(vscode.window.activeTextEditor, 'a normal text editor was expected to be active');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), fileUri.toString());
  });

  test('without an explicit resource, falls back to the active Chapter (RISK-007: not activeTextEditor)', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    await openInWritingEditor(fileUri);

    // Same as the Chapter's own tab context menu — no resource argument.
    await vscode.commands.executeCommand('texto.openAsMarkdown');

    assert.ok(vscode.window.activeTextEditor, 'a normal text editor was expected to be active');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), fileUri.toString());
  });

  test('unsaved changes made as markdown are kept when reopening in the Writing editor — same TextDocument', async () => {
    fileUri = await createScratchFile('Texto original.');
    await openInWritingEditor(fileUri);
    await vscode.commands.executeCommand('texto.openAsMarkdown', fileUri);
    const codeEditor = vscode.window.activeTextEditor;
    assert.ok(codeEditor);

    await codeEditor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, codeEditor.document.getText().length), ' Añadido.');
    });
    assert.ok(codeEditor.document.isDirty);

    await vscode.commands.executeCommand('vscode.openWith', fileUri, 'texto.editor');

    const api = await getExtensionApi();
    const panel = await waitFor(() => api.panelFor(fileUri), 'the Chapter to reopen in the Writing editor');
    assert.ok(panel);
    const reopenedDocument = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(reopenedDocument.getText(), 'Texto original. Añadido.');
    assert.ok(reopenedDocument.isDirty, 'the unsaved change should have survived — same TextDocument');
  });
});
