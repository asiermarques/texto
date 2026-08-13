import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, openInProseEditor, requestSnapshot, setCursor, sleep, waitFor } from './support';

// US-011/US-015/US-016: the preferences of a Writing space, written in the
// Work's own `.vscode/settings.json` and committed alongside the text — the
// way the README tells the Author to configure a Work.
//
// The rest of the suite writes every setting at Global scope and opens
// Chapters from a temp dir outside the workspace (see `createScratchFile`),
// so nothing exercised the resolution that actually matters here: a Chapter
// *inside* the folder, reading that folder's settings. `getPreferences` is
// passed `document.uri` precisely so this works.

const workspaceFolder = (): vscode.Uri => {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('The test host should have opened the fixtures folder as a Writing space.');
  }
  return folder.uri;
};

/** A Chapter inside the workspace folder, unlike `createScratchFile`'s temp dir. */
async function createChapterInWorkspace(name: string, content: string): Promise<vscode.Uri> {
  const uri = vscode.Uri.joinPath(workspaceFolder(), name);
  await fs.promises.writeFile(uri.fsPath, content, 'utf8');
  return uri;
}

/**
 * Writes the folder's `.vscode/settings.json` by hand — the Author's own gesture,
 * and the only one available here: `update(…, ConfigurationTarget.Workspace)` is
 * refused by the test host. Waits until VSCode has actually reloaded the file,
 * so a failure afterwards is the extension's and not a race.
 */
async function writeWorkspaceSettings(settings: Record<string, unknown>): Promise<void> {
  const dir = path.join(workspaceFolder().fsPath, '.vscode');
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
  for (const [key, value] of Object.entries(settings)) {
    const section = key.slice('texto.'.length);
    await waitFor(
      () => (vscode.workspace.getConfiguration('texto', workspaceFolder()).get(section) === value ? true : undefined),
      `VSCode to reload ${key} from the folder's settings.json`
    );
  }
}

suite("Settings in the Writing space's .vscode/settings.json", () => {
  let fileUri: vscode.Uri | undefined;

  teardown(async () => {
    await closeAllEditors();
    if (fileUri) {
      await fs.promises.rm(fileUri.fsPath, { force: true });
      fileUri = undefined;
    }
    // Leave the fixtures directory as it was found.
    await fs.promises.rm(path.join(workspaceFolder().fsPath, '.vscode'), { recursive: true, force: true });
    await waitFor(
      () => (vscode.workspace.getConfiguration('texto', workspaceFolder()).get('tema') === 'claro' ? true : undefined),
      "the folder's settings to go back to their default values"
    );
  });

  test("texto.tema in the Work's folder tints a Chapter of that folder", async () => {
    await writeWorkspaceSettings({ 'texto.tema': 'oscuro' });

    fileUri = await createChapterInWorkspace('chapter-settings.md', 'Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.themeAttribute, 'oscuro', "the Chapter should take the theme from its own folder's settings.json");
  });

  test("texto.modoFoco in the Work's folder turns Focus mode off for a Chapter of that folder", async () => {
    await writeWorkspaceSettings({ 'texto.modoFoco': false });

    fileUri = await createChapterInWorkspace('chapter-focus.md', 'Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);
    await setCursor(panel, 50); // with Focus mode on, this would dim the first paragraph
    await sleep(200);

    const snapshot = await requestSnapshot(panel);
    assert.deepStrictEqual(snapshot.dimmedText, [], "the Chapter should respect the modoFoco in its own folder's settings.json");
  });
});
