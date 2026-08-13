/**
 * The Prose editor's own preferences, declared as VSCode settings
 * (`contributes.configuration` in `package.json`, all under the `texto.`
 * prefix). Kept as a pure shape and a pure reading function so this is
 * testable without a real `vscode.WorkspaceConfiguration` — the
 * `src/infrastructure/preferences.ts` module is the only place that touches
 * the actual `vscode` API.
 */
/**
 * US-016: Claro by default (DEC-005) — a Chapter reads as paper, not as a
 * dark editor, regardless of the Author's VSCode theme, unless they ask this
 * editor to follow it (`vscode`).
 */
export type EditorTheme = 'claro' | 'oscuro' | 'vscode';

const VALID_THEMES: readonly EditorTheme[] = ['claro', 'oscuro', 'vscode'];

function isEditorTheme(value: unknown): value is EditorTheme {
  return typeof value === 'string' && (VALID_THEMES as readonly string[]).includes(value);
}

export interface ProseEditorPreferences {
  readonly focusModeEnabled: boolean;
  readonly theme: EditorTheme;
}

export const defaultPreferences: ProseEditorPreferences = {
  focusModeEnabled: true,
  theme: 'claro',
};

/** The one method this module needs off `vscode.WorkspaceConfiguration`. */
export interface ConfigurationLike {
  get<T>(section: string, defaultValue: T): T;
}

export function readPreferences(config: ConfigurationLike): ProseEditorPreferences {
  const rawTheme = config.get<string>('tema', defaultPreferences.theme);
  return {
    focusModeEnabled: config.get<boolean>('modoFoco', defaultPreferences.focusModeEnabled),
    // package.json declares `texto.tema` as an enum, so VSCode itself keeps
    // this to the three valid values in the normal case — this fallback is
    // only for a settings.json hand-edited to something else.
    theme: isEditorTheme(rawTheme) ? rawTheme : defaultPreferences.theme,
  };
}

/**
 * US-015: Focus mode used to live in `context.globalState`
 * (`texto.focusModeEnabled`), before it became the `texto.modoFoco` setting.
 * This decides, on activation, whether the Author's pre-existing choice
 * should be carried over into the new setting — the pure half of the
 * migration; `src/infrastructure/preferences.ts` supplies the two inputs
 * from the real `globalState` and `WorkspaceConfiguration.inspect`.
 *
 * Returns the value to write, or `undefined` if nothing should change:
 * either there was no legacy value to carry over, or the Author already
 * configured the new setting explicitly (at any scope) and that choice
 * must not be clobbered by the old one.
 */
export function resolveFocusModeMigration(legacyValue: boolean | undefined, isConfiguredAtAnyScope: boolean): boolean | undefined {
  if (legacyValue === undefined || isConfiguredAtAnyScope) {
    return undefined;
  }
  return legacyValue;
}
