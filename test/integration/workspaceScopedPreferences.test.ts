import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, getExtensionApi, openInWritingEditor, requestSnapshot, setCursor, sleep, waitFor } from './support';

// US-011/US-015/US-016: the preferences of a Writing space, written in the
// Work's own `.vscode/settings.json` and committed alongside the text — the
// way the README tells the Author to configure a Work. Setting keys and
// values renamed to English in US-002 (003).
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
    // Waits on the *scoped* value, not on the effective one: pinning a
    // setting to what happens to be its default (theme: light) would satisfy
    // an effective-value check before VSCode had even read the file, and the
    // test would then measure a Writing space that pins nothing.
    await waitFor(
      () => (readWorkspaceScopedValue(section) === value ? true : undefined),
      `VSCode to reload ${key} from the folder's settings.json`
    );
  }
}

/**
 * What the folder's own settings.json holds for `section` right now.
 * Whether this window files that file under Workspace or WorkspaceFolder
 * scope is VSCode's business (it depends on single- vs multi-root), and
 * these tests are about not caring — only about the value landing where the
 * Chapter reads it back from.
 */
function readWorkspaceScopedValue<T>(section: string): T | undefined {
  const inspected = vscode.workspace.getConfiguration('texto', workspaceFolder()).inspect<T>(section);
  return inspected?.workspaceFolderValue ?? inspected?.workspaceValue;
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
    // And Global scope as it was found too: a write landing there instead of
    // in the Work's settings.json is the very bug under test, so it must not
    // leak into the next test either.
    for (const section of ['theme', 'focusMode', 'alignment', 'textSize']) {
      await vscode.workspace.getConfiguration('texto').update(section, undefined, vscode.ConfigurationTarget.Global);
    }
    await waitFor(
      () => (vscode.workspace.getConfiguration('texto', workspaceFolder()).get('theme') === 'light' ? true : undefined),
      "the folder's settings to go back to their default values"
    );
  });

  test("texto.theme in the Work's folder tints a Chapter of that folder", async () => {
    await writeWorkspaceSettings({ 'texto.theme': 'dark' });

    fileUri = await createChapterInWorkspace('chapter-settings.md', 'Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.themeAttribute, 'dark', "the Chapter should take the theme from its own folder's settings.json");
  });

  test("texto.focusMode in the Work's folder turns Focus mode off for a Chapter of that folder", async () => {
    await writeWorkspaceSettings({ 'texto.focusMode': false });

    fileUri = await createChapterInWorkspace('chapter-focus.md', 'Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 50); // with Focus mode on, this would dim the first paragraph
    await sleep(200);

    const snapshot = await requestSnapshot(panel);
    assert.deepStrictEqual(snapshot.dimmedText, [], "the Chapter should respect the focusMode in its own folder's settings.json");
  });

  // BUG (Author report): "los botones de cambio de tema no funcionan, ni el
  // modo foco". Reading these settings per resource was only half the job:
  // every write went to Global scope, which VSCode resolves *under* the
  // folder's own settings.json — so inside a Work that pins them (exactly
  // what the README tells the Author to do) the buttons wrote a value the
  // Chapter never read back, and nothing on screen ever changed.

  test('a Tema button changes a Chapter whose Work pins the theme', async () => {
    await writeWorkspaceSettings({ 'texto.theme': 'light' });
    fileUri = await createChapterInWorkspace('chapter-set-theme.md', 'Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);

    await vscode.commands.executeCommand('texto.setTheme', 'dark');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'dark' ? s : undefined;
    }, 'the Chapter to switch to Oscuro despite the pinned theme');
    assert.strictEqual(snapshot.themeAttribute, 'dark');
    assert.strictEqual(readWorkspaceScopedValue<string>('theme'), 'dark', "the new theme should land in the Work's own settings.json");
  });

  test('Modo foco toggles from the value the Work pins, not from the Global one', async () => {
    // Global stays at the factory `true` while the Work pins `false`:
    // toggling used to read Global, compute `false`, and write a value that
    // changed nothing at all.
    await writeWorkspaceSettings({ 'texto.focusMode': false });
    fileUri = await createChapterInWorkspace('chapter-toggle-focus.md', 'Primer párrafo.\n\nSegundo párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => (api.getToolbarButtonState('focus-mode')?.text.includes('$(eye-closed)') ? true : undefined), 'the button to show the pinned off');

    await vscode.commands.executeCommand('texto.toggleFocusMode');

    await waitFor(() => (readWorkspaceScopedValue<boolean>('focusMode') === true ? true : undefined), "the Work's own setting to flip to true");
    await setCursor(panel, 5);
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length > 0 ? s : undefined;
    }, 'the Chapter to start dimming again');
  });

  test('text size steps from the value the Work pins', async () => {
    await writeWorkspaceSettings({ 'texto.textSize': 22 });
    fileUri = await createChapterInWorkspace('chapter-text-size.md', 'Un párrafo de prueba.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => (api.getToolbarButtonState('size-value')?.text === '22px' ? true : undefined), 'the pinned size to show in the toolbar');

    await vscode.commands.executeCommand('texto.increaseTextSize');

    await waitFor(() => (readWorkspaceScopedValue<number>('textSize') === 24 ? true : undefined), "the Work's own setting to grow to 24");
  });
});
