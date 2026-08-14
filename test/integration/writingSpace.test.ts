import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, waitFor } from './support';

// US-011: opening by default in the Writing space.
//
// The extension contributes no code for this — a Writing space is a
// directory whose own `.vscode/settings.json` sets
// `workbench.editorAssociations` for `*.md`, entirely VSCode's own
// mechanism (documented in README.md). What we own, and verify here, is
// that our `customEditors` registration (priority "option") cooperates with
// it correctly: it wins when the association says so, and stays out of the
// way otherwise.
//
// The association is set at Global scope here rather than Workspace scope
// — this test host runs without an open workspace folder, so a Workspace
// write is rejected by VSCode itself ("no workspace is opened"), a
// limitation of this launch setup, not of the extension. The resolution
// mechanism `vscode.open` consults is identical either way; only *where*
// the genuine Writing space persists the setting (its own
// `.vscode/settings.json`, Workspace-scoped, versioned with the Work)
// differs, and that part is a plain JSON file this test doesn't need to
// exercise to prove the cooperation works.

const EDITOR_ASSOCIATIONS_KEY = 'editorAssociations';
const VIEW_TYPE = 'texto.editor';

suite('US-011: opening by default in the Writing space', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await vscode.workspace
      .getConfiguration('workbench')
      .update(EDITOR_ASSOCIATIONS_KEY, undefined, vscode.ConfigurationTarget.Global);
    await deleteScratchFile(fileUri);
  });

  test('with *.md associated to the Writing editor, opening a Chapter from the explorer goes through it', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    await vscode.workspace
      .getConfiguration('workbench')
      .update(EDITOR_ASSOCIATIONS_KEY, { '*.md': VIEW_TYPE }, vscode.ConfigurationTarget.Global);

    // What a double click in the file explorer triggers.
    await vscode.commands.executeCommand('vscode.open', fileUri);

    const api = await getExtensionApi();
    await waitFor(() => (api.panelFor(fileUri) ? true : undefined), 'the Chapter to open in the Writing editor');
  });

  test('a Chapter of the Writing space can still be opened as plain text with "Reopen Editor With…"', async () => {
    fileUri = await createScratchFile('Un Capítulo cualquiera.');
    await vscode.workspace
      .getConfiguration('workbench')
      .update(EDITOR_ASSOCIATIONS_KEY, { '*.md': VIEW_TYPE }, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('vscode.open', fileUri);
    const api = await getExtensionApi();
    await waitFor(() => (api.panelFor(fileUri) ? true : undefined), 'the Chapter to open in the Writing editor');

    await vscode.commands.executeCommand('vscode.openWith', fileUri, 'default');

    assert.ok(vscode.window.activeTextEditor, 'a normal text editor was expected to be active');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), fileUri.toString());
  });
});
