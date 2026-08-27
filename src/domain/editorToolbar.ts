import type { EditorTheme, WritingEditorPreferences, TextAlignment } from './preferences';

/**
 * US-021 (redesigned on Author feedback): every Editor de escritura setting
 * is its own status bar button next to the word count, not an entry in a
 * QuickPick menu — a `+`/size/`-` group for text size, one button per value
 * for Theme and Alignment, one toggle each for Focus mode and Raw markdown.
 * Kept pure so "the active choice is marked" and "the label reflects the
 * current state" are vitest assertions; `src/infrastructure/editorToolbar.ts`
 * is the only place that turns these into real `vscode.StatusBarItem`s.
 */
export interface ToolbarButtonSpec {
  readonly id: string;
  readonly text: string;
  readonly tooltip: string;
}

/**
 * Every piece of text the toolbar needs, already resolved for the display
 * language (US-005, requirement 003). This module stays free of `vscode` as
 * a value (ASM-002, the folders-by-purity convention), so it cannot call
 * `vscode.l10n.t` itself — `src/infrastructure/editorToolbar.ts` is the only
 * place that does, once per refresh, and hands the result in here.
 */
export interface ToolbarStrings {
  readonly themeLabel: Record<EditorTheme, string>;
  readonly themeTooltip: Record<EditorTheme, string>;
  readonly alignmentLabel: Record<TextAlignment, string>;
  readonly alignmentTooltip: Record<TextAlignment, string>;
  readonly sizeDecreaseTooltip: string;
  readonly sizeResetTooltip: string;
  readonly sizeIncreaseTooltip: string;
  readonly focusModeLabel: string;
  readonly focusModeTooltipOn: string;
  readonly focusModeTooltipOff: string;
  readonly rawMarkdownLabel: string;
  readonly rawMarkdownTooltipOn: string;
  readonly rawMarkdownTooltipOff: string;
  /** Already carries the running version interpolated into it — see `buildVersionButton`. */
  readonly versionTooltip: string;
}

// The theme's name travels in the label itself (Author feedback): on their
// own, "Light" and "Dark" next to the alignment and size buttons read as
// some unnamed mode, not as the Writing editor's theme.
export function buildThemeButtons(current: EditorTheme, strings: ToolbarStrings): ToolbarButtonSpec[] {
  return (['light', 'dark', 'vscode'] as const).map((theme) => ({
    id: `theme-${theme}`,
    text: theme === current ? `$(check) ${strings.themeLabel[theme]}` : strings.themeLabel[theme],
    tooltip: strings.themeTooltip[theme],
  }));
}

// left · justified · right, in that order (Author feedback): justified sits
// between the two edges it is made of, the way a word processor's alignment
// group reads. No icons: VSCode's codicon set has no text-alignment glyph at
// all.
export function buildAlignmentButtons(current: TextAlignment, strings: ToolbarStrings): ToolbarButtonSpec[] {
  return (['left', 'justified', 'right'] as const).map((alignment) => ({
    id: `align-${alignment}`,
    text: alignment === current ? `$(check) ${strings.alignmentLabel[alignment]}` : strings.alignmentLabel[alignment],
    tooltip: strings.alignmentTooltip[alignment],
  }));
}

export function buildTextSizeButtons(size: number, strings: ToolbarStrings): ToolbarButtonSpec[] {
  return [
    { id: 'size-decrease', text: '$(remove)', tooltip: strings.sizeDecreaseTooltip },
    { id: 'size-value', text: `${size}px`, tooltip: strings.sizeResetTooltip },
    { id: 'size-increase', text: '$(add)', tooltip: strings.sizeIncreaseTooltip },
  ];
}

export function buildFocusModeButton(enabled: boolean, strings: ToolbarStrings): ToolbarButtonSpec {
  return {
    id: 'focus-mode',
    text: enabled ? `$(eye) ${strings.focusModeLabel}` : `$(eye-closed) ${strings.focusModeLabel}`,
    tooltip: enabled ? strings.focusModeTooltipOn : strings.focusModeTooltipOff,
  };
}

export function buildRawMarkdownButton(active: boolean, strings: ToolbarStrings): ToolbarButtonSpec {
  return {
    id: 'raw-markdown',
    text: active ? `$(code) ${strings.rawMarkdownLabel}` : `$(book) ${strings.rawMarkdownLabel}`,
    tooltip: active ? strings.rawMarkdownTooltipOn : strings.rawMarkdownTooltipOff,
  };
}

/**
 * The version of Texto currently running, readable at a glance rather than
 * hidden behind a menu — the same Author feedback that turned this toolbar
 * from a QuickPick into buttons. The product name travels in the label for
 * the same reason the Theme buttons carry theirs: on its own, a bare
 * `0.1.4` in the status bar names nothing. The version string is not
 * translated (it comes from the manifest), so only the tooltip arrives
 * through `ToolbarStrings`.
 */
export function buildVersionButton(version: string, strings: ToolbarStrings): ToolbarButtonSpec {
  return {
    id: 'version',
    text: `$(info) Texto ${version}`,
    tooltip: strings.versionTooltip,
  };
}

/** Every button, in the order they should appear next to the word count. */
export function buildAllToolbarButtons(
  preferences: WritingEditorPreferences,
  rawMarkdownActive: boolean,
  version: string,
  strings: ToolbarStrings
): ToolbarButtonSpec[] {
  return [
    ...buildThemeButtons(preferences.theme, strings),
    ...buildTextSizeButtons(preferences.textSize, strings),
    ...buildAlignmentButtons(preferences.alignment, strings),
    buildFocusModeButton(preferences.focusModeEnabled, strings),
    buildRawMarkdownButton(rawMarkdownActive, strings),
    buildVersionButton(version, strings),
  ];
}
