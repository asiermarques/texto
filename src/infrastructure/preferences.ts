import * as vscode from 'vscode';
import { type ProseEditorPreferences, readPreferences, resolveFocusModeMigration } from '../domain/preferences';

const SECTION = 'texto';

// The context.globalState key Focus mode lived under before US-015 — read
// once, at activation, purely to migrate it.
const LEGACY_FOCUS_MODE_KEY = 'texto.focusModeEnabled';

/**
 * Reads the Prose editor's preferences, resolved for `resource` the way
 * VSCode resolves any setting: folder scope overrides workspace scope
 * overrides user scope. Pass the Chapter's `document.uri` when reading for
 * a specific webview, so a Writing space's own `.vscode/settings.json`
 * takes effect for it.
 */
export function getPreferences(resource?: vscode.Uri): ProseEditorPreferences {
  return readPreferences(vscode.workspace.getConfiguration(SECTION, resource));
}

/**
 * Focus mode is one global preference for the Author, not per-Chapter (see
 * ARCHITECTURE.md) — it is always written at Global scope, regardless of
 * which Chapter's command palette it was toggled from.
 */
export async function setFocusModeEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update('modoFoco', enabled, vscode.ConfigurationTarget.Global);
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
 * `context.globalState` into the `texto.modoFoco` setting, the first time
 * this version activates. See `resolveFocusModeMigration` for the decision;
 * this is only the `vscode`-facing plumbing around it.
 */
export async function migrateFocusModeFromGlobalState(context: vscode.ExtensionContext): Promise<void> {
  const legacyValue = context.globalState.get<boolean>(LEGACY_FOCUS_MODE_KEY);
  const inspected = vscode.workspace.getConfiguration(SECTION).inspect<boolean>('modoFoco');
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
