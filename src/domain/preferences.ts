/**
 * The Writing editor's own preferences, declared as VSCode settings
 * (`contributes.configuration` in `package.json`, all under the `texto.`
 * prefix). Kept as a pure shape and a pure reading function so this is
 * testable without a real `vscode.WorkspaceConfiguration` — the
 * `src/infrastructure/preferences.ts` module is the only place that touches
 * the actual `vscode` API.
 */
/**
 * US-016: light by default (DEC-005) — a Chapter reads as paper, not as a
 * dark editor, regardless of the Author's VSCode theme, unless they ask this
 * editor to follow it (`vscode`). Renamed from `claro`/`oscuro` to
 * `light`/`dark` in US-002 (003): an English identifier like every other
 * `texto.*` key and value — see docs/UBIQUITOUS_LANGUAGE.md.
 */
export type EditorTheme = 'light' | 'dark' | 'vscode';

const VALID_THEMES: readonly EditorTheme[] = ['light', 'dark', 'vscode'];

/** Exported for `texto.setTheme` (US-021's toolbar command) to validate its `Command.arguments` value before writing it. */
export function isEditorTheme(value: unknown): value is EditorTheme {
  return typeof value === 'string' && (VALID_THEMES as readonly string[]).includes(value);
}

/**
 * US-019 (DEC-006, amended): left is the factory value. Justified turns on
 * word-hyphenation alongside it (src/webview/styles.css) — the two travel
 * together, see the story for why. Right added afterwards, on Author
 * feedback about the settings toolbar (US-021) — DEC-006 originally offered
 * only two values; see the implementation-plan note next to it. Renamed from
 * `izquierda`/`derecha`/`justificado` in US-002 (003).
 */
export type TextAlignment = 'left' | 'right' | 'justified';

const VALID_ALIGNMENTS: readonly TextAlignment[] = ['left', 'right', 'justified'];

/** Exported for `texto.setAlignment` (US-021's toolbar command) to validate its `Command.arguments` value before writing it. */
export function isTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === 'string' && (VALID_ALIGNMENTS as readonly string[]).includes(value);
}

/**
 * US-017: the factory size matches the fixed 1.125rem (18px @ 16px root)
 * US-004 composed at, so migrating to this setting changes nothing by
 * default. Min/max keep prose usable at either end (mirrored in
 * package.json's `minimum`/`maximum`, which are UI hints only — `readPreferences`
 * clamps for real, in case of a hand-edited settings.json).
 */
export const TEXT_SIZE_DEFAULT = 18;
export const TEXT_SIZE_MIN = 14;
export const TEXT_SIZE_MAX = 28;
export const TEXT_SIZE_STEP = 2;

export function clampTextSize(value: number): number {
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, value));
}

export function increaseTextSize(current: number): number {
  return clampTextSize(current + TEXT_SIZE_STEP);
}

export function decreaseTextSize(current: number): number {
  return clampTextSize(current - TEXT_SIZE_STEP);
}

/**
 * Where a preference write has to land. Every `texto.*` setting used to be
 * written at Global scope unconditionally, which made the toolbar buttons
 * look broken inside a Writing space whose own `.vscode/settings.json`
 * pins that setting: VSCode resolves folder scope over workspace over
 * global, so the write landed in a scope the Author's Chapter never read
 * back (BUG: "los botones de tema y de modo foco no hacen nada"). Writing
 * to the most specific scope that already defines the value is what
 * VSCode's own settings UI does, and the only behaviour that keeps the
 * button in sync with what the Author sees.
 */
export type PreferenceScope = 'folder' | 'workspace' | 'global';

/** The subset of `vscode.WorkspaceConfiguration.inspect`'s result this decision needs. */
export interface InspectedPreference {
  readonly workspaceFolderValue?: unknown;
  readonly workspaceValue?: unknown;
}

export function resolveWriteScope(inspected: InspectedPreference | undefined): PreferenceScope {
  if (inspected?.workspaceFolderValue !== undefined) {
    return 'folder';
  }
  if (inspected?.workspaceValue !== undefined) {
    return 'workspace';
  }
  return 'global';
}

export interface WritingEditorPreferences {
  readonly focusModeEnabled: boolean;
  readonly theme: EditorTheme;
  readonly textSize: number;
  readonly alignment: TextAlignment;
}

export const defaultPreferences: WritingEditorPreferences = {
  focusModeEnabled: true,
  theme: 'light',
  textSize: TEXT_SIZE_DEFAULT,
  alignment: 'left',
};

/** The one method this module needs off `vscode.WorkspaceConfiguration`. */
export interface ConfigurationLike {
  get<T>(section: string, defaultValue: T): T;
}

export function readPreferences(config: ConfigurationLike): WritingEditorPreferences {
  const rawTheme = config.get<string>('theme', defaultPreferences.theme);
  const rawAlignment = config.get<string>('alignment', defaultPreferences.alignment);
  return {
    focusModeEnabled: config.get<boolean>('focusMode', defaultPreferences.focusModeEnabled),
    // package.json declares `texto.theme` as an enum, so VSCode itself keeps
    // this to the three valid values in the normal case — this fallback is
    // only for a settings.json hand-edited to something else (also what
    // BR-004 relies on: a stale Spanish value like the pre-US-002 `claro`
    // degrades to the default instead of throwing).
    theme: isEditorTheme(rawTheme) ? rawTheme : defaultPreferences.theme,
    textSize: clampTextSize(config.get<number>('textSize', defaultPreferences.textSize)),
    alignment: isTextAlignment(rawAlignment) ? rawAlignment : defaultPreferences.alignment,
  };
}

/**
 * US-015: Focus mode used to live in `context.globalState`
 * (`texto.focusModeEnabled`), before it became the `texto.focusMode` setting.
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
