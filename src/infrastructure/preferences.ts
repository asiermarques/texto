import * as vscode from 'vscode';
import {
  type EditorTheme,
  type PreferenceScope,
  type WritingEditorPreferences,
  type TextAlignment,
  readPreferences,
  resolveFocusModeMigration,
  resolveWriteScope,
} from '../domain/preferences';

const SECTION = 'texto';

// The context.globalState key Focus mode lived under before US-015 — read
// once, at activation, purely to migrate it.
const LEGACY_FOCUS_MODE_KEY = 'texto.focusModeEnabled';

/**
 * Reads the Writing editor's preferences, resolved for `resource` the way
 * VSCode resolves any setting: folder scope overrides workspace scope
 * overrides user scope. Pass the Chapter's `document.uri` when reading for
 * a specific webview, so a Writing space's own `.vscode/settings.json`
 * takes effect for it.
 */
export function getPreferences(resource?: vscode.Uri): WritingEditorPreferences {
  return readPreferences(vscode.workspace.getConfiguration(SECTION, resource));
}

const TARGETS: Record<PreferenceScope, vscode.ConfigurationTarget> = {
  folder: vscode.ConfigurationTarget.WorkspaceFolder,
  workspace: vscode.ConfigurationTarget.Workspace,
  global: vscode.ConfigurationTarget.Global,
};

/**
 * The one way any `texto.*` preference is written. Global is the Author's
 * scope — one choice that travels with them, not with the Chapter — but it
 * is only the *default*: if the Writing space already pins this setting in
 * its own `.vscode/settings.json` (folder or workspace scope), a Global
 * write would be shadowed by it and the Chapter would not change at all.
 * `resolveWriteScope` picks the scope the Author actually reads back; see
 * the note next to it in `domain/preferences.ts`.
 *
 * `resource` is the Chapter being written for — it is what lets VSCode
 * resolve, and update, folder scope at all.
 */
async function writePreference(key: string, value: unknown, resource?: vscode.Uri): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION, resource);
  await config.update(key, value, TARGETS[resolveWriteScope(config.inspect(key))]);
}

/**
 * Focus mode is one preference for the Author, not per-Chapter (see
 * ARCHITECTURE.md) — Global scope, unless the Writing space pins it (see
 * `writePreference`).
 */
export async function setFocusModeEnabled(enabled: boolean, resource?: vscode.Uri): Promise<void> {
  await writePreference('focusMode', enabled, resource);
}

/**
 * US-017: same pattern as Focus mode — one preference for the Author,
 * written from any of its three origins (the palette commands, the webview
 * keymap, or the Author's own settings.json), read back the same way for all
 * of them.
 */
export async function setTextSize(px: number, resource?: vscode.Uri): Promise<void> {
  await writePreference('textSize', px, resource);
}

/** US-019: same pattern as text size and Focus mode. */
export async function setAlignment(value: TextAlignment, resource?: vscode.Uri): Promise<void> {
  await writePreference('alignment', value, resource);
}

/** US-021: the toolbar's Editor theme buttons write through this — same pattern as the rest. */
export async function setTheme(value: EditorTheme, resource?: vscode.Uri): Promise<void> {
  await writePreference('theme', value, resource);
}

/**
 * Fires `listener` whenever a `texto.*` setting changes, from any source —
 * the command, or the Author editing `settings.json` directly. Returns the
 * subscription to dispose alongside the rest of the extension.
 */
export function onPreferencesChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SECTION)) {
      listener();
    }
  });
}

/**
 * US-015: carries an Author's pre-existing Focus mode choice from
 * `context.globalState` into the `texto.focusMode` setting, the first time
 * this version activates. See `resolveFocusModeMigration` for the decision;
 * this is only the `vscode`-facing plumbing around it.
 */
export async function migrateFocusModeFromGlobalState(context: vscode.ExtensionContext): Promise<void> {
  const legacyValue = context.globalState.get<boolean>(LEGACY_FOCUS_MODE_KEY);
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect<boolean>('focusMode');
  const isConfiguredAtAnyScope =
    inspected?.globalValue !== undefined || inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined;

  const migratedValue = resolveFocusModeMigration(legacyValue, isConfiguredAtAnyScope);
  if (migratedValue !== undefined) {
    await setFocusModeEnabled(migratedValue);
  }
  if (legacyValue !== undefined) {
    await context.globalState.update(LEGACY_FOCUS_MODE_KEY, undefined);
  }
}
