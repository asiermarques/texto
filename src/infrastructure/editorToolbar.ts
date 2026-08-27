import * as vscode from 'vscode';
import { buildAllToolbarButtons, type ToolbarStrings } from '../domain/editorToolbar';
import type { FrontmatterBlock } from '../domain/frontmatter';
import type { WritingEditorPreferences } from '../domain/preferences';

/**
 * US-005 (003): the only place in the extension allowed to call
 * `vscode.l10n.t` for the toolbar — every string it resolves is a source
 * (English) literal, translated at runtime through `l10n/bundle.l10n.es.json`
 * when the display language is Spanish, and left as-is (the in-source
 * default, BR-002) otherwise. Rebuilt on every `refresh()`: display language
 * cannot change without a window reload (EDGE-002), so this is cheap, not
 * cached.
 */
function resolveToolbarStrings(version: string, frontmatterFieldCount: number): ToolbarStrings {
  return {
    themeLabel: {
      light: vscode.l10n.t('Theme Light'),
      dark: vscode.l10n.t('Theme Dark'),
      vscode: vscode.l10n.t('Theme VSCode'),
    },
    themeTooltip: {
      light: vscode.l10n.t('Theme: Light'),
      dark: vscode.l10n.t('Theme: Dark'),
      vscode: vscode.l10n.t("Theme: follow VSCode's active theme"),
    },
    alignmentLabel: {
      left: vscode.l10n.t('Left'),
      right: vscode.l10n.t('Right'),
      justified: vscode.l10n.t('Just'),
    },
    alignmentTooltip: {
      left: vscode.l10n.t('Alignment: left'),
      right: vscode.l10n.t('Alignment: right'),
      justified: vscode.l10n.t('Alignment: justified (with hyphenation)'),
    },
    sizeDecreaseTooltip: vscode.l10n.t('Decrease text size'),
    sizeResetTooltip: vscode.l10n.t('Reset text size'),
    sizeIncreaseTooltip: vscode.l10n.t('Increase text size'),
    focusModeLabel: vscode.l10n.t('Focus mode'),
    focusModeTooltipOn: vscode.l10n.t('Focus mode: on (click to turn off)'),
    focusModeTooltipOff: vscode.l10n.t('Focus mode: off (click to turn on)'),
    rawMarkdownLabel: vscode.l10n.t('Raw markdown'),
    rawMarkdownTooltipOn: vscode.l10n.t('Raw markdown: on (click to go back to the composed view)'),
    rawMarkdownTooltipOff: vscode.l10n.t('Raw markdown: off (click to view the raw markdown)'),
    versionTooltip: vscode.l10n.t('Texto version {0}', version),
    // Two strings rather than one skeleton: the English inflects ("field" /
    // "fields") and so does the Spanish, and a shared template would force
    // one of the two to be wrong in at least one language.
    frontmatterTooltip:
      frontmatterFieldCount === 1
        ? vscode.l10n.t('Frontmatter: {0} metadata field, not counted as prose', frontmatterFieldCount)
        : vscode.l10n.t('Frontmatter: {0} metadata fields, not counted as prose', frontmatterFieldCount),
  };
}

const BUTTON_IDS = [
  'frontmatter',
  'theme-light',
  'theme-dark',
  'theme-vscode',
  'size-decrease',
  'size-value',
  'size-increase',
  'align-left',
  'align-justified',
  'align-right',
  'focus-mode',
  'raw-markdown',
  'version',
] as const;

function commandFor(id: string): string | vscode.Command | undefined {
  // The Frontmatter indicator states something about the Chapter rather than
  // offering an action: with no `.command` VSCode renders it as plain text,
  // with no hover highlight and no pointer cursor, which is exactly what an
  // indicator should look like next to ten real buttons.
  if (id === 'frontmatter') return undefined;
  if (id.startsWith('theme-')) {
    return { command: 'texto.setTheme', title: 'Tema', arguments: [id.slice('theme-'.length)] };
  }
  if (id.startsWith('align-')) {
    return { command: 'texto.setAlignment', title: 'Alineación', arguments: [id.slice('align-'.length)] };
  }
  if (id === 'size-decrease') return 'texto.decreaseTextSize';
  if (id === 'size-value') return 'texto.resetTextSize';
  if (id === 'size-increase') return 'texto.increaseTextSize';
  if (id === 'focus-mode') return 'texto.toggleFocusMode';
  if (id === 'version') return 'texto.showVersion';
  return 'texto.toggleRawMarkdown'; // raw-markdown
}

/**
 * US-021 (redesigned on Author feedback): one `vscode.StatusBarItem` per
 * button, next to the word count item (`WordCountStatusBar`) — shown and
 * hidden together with it, governed by the same `activeUri` tracking
 * (RISK-007) in `WritingEditorProvider`. Every button's `.command` is a
 * generic command with its target value as an argument (`texto.setTheme`,
 * `texto.setAlignment`) or one of the commands the earlier stories already
 * registered (`texto.increaseTextSize`, `texto.toggleFocusMode`, …) — no new
 * source of truth, this class only renders `domain/editorToolbar.ts`'s pure
 * button specs as real status bar items.
 */
export class EditorToolbar {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  // Which ids the last `refresh()` actually rendered. `vscode.StatusBarItem`
  // has no getter for whether `.show()` or `.hide()` was called last — the
  // same gap `WordCountStatusBar` works around — and since the Frontmatter
  // indicator comes and goes, "is this button up?" is now a question worth
  // answering per item and not just for the toolbar as a whole.
  private rendered = new Set<string>();
  private visible = false;
  // The running version, from the manifest. Handed in by
  // `WritingEditorProvider.register()` rather than taken as a constructor
  // argument: this class is instantiated as a static field, before any
  // `vscode.ExtensionContext` exists to read `extension.packageJSON` from.
  private version = '';

  constructor() {
    // Priorities descending in display order, immediately after the word
    // count item (priority 100 in WordCountStatusBar) — VSCode shows
    // higher-priority status bar items further left within the same
    // alignment group.
    let priority = 99;
    for (const id of BUTTON_IDS) {
      const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
      item.command = commandFor(id);
      this.items.set(id, item);
      priority -= 1;
    }
  }

  public setVersion(version: string): void {
    this.version = version;
  }

  public refresh(preferences: WritingEditorPreferences, rawMarkdownActive: boolean, frontmatter?: FrontmatterBlock): void {
    const specs = buildAllToolbarButtons(
      preferences,
      rawMarkdownActive,
      this.version,
      frontmatter,
      resolveToolbarStrings(this.version, frontmatter?.fields.length ?? 0)
    );
    this.rendered = new Set(specs.map((spec) => spec.id));

    for (const spec of specs) {
      const item = this.items.get(spec.id);
      if (!item) {
        continue;
      }
      item.text = spec.text;
      item.tooltip = spec.tooltip;
      item.show();
    }

    // An item the domain left out does not apply to this Chapter (the
    // Frontmatter indicator, on a Chapter with no block). Hiding it here,
    // rather than never showing it, is what makes the indicator disappear
    // when the Author deletes the block or moves to a Chapter without one —
    // status bar items keep their last state until told otherwise.
    for (const [id, item] of this.items) {
      if (!this.rendered.has(id)) {
        item.hide();
      }
    }

    this.visible = true;
  }

  public hide(): void {
    for (const item of this.items.values()) {
      item.hide();
    }
    this.visible = false;
  }

  public dispose(): void {
    for (const item of this.items.values()) {
      item.dispose();
    }
  }

  /** Exposed for the integration suite — same reason `WordCountStatusBar` exposes `.text`/`.isVisible`. */
  public getButtonState(id: string): { readonly text: string; readonly tooltip: string; readonly visible: boolean } | undefined {
    const item = this.items.get(id);
    if (!item) {
      return undefined;
    }
    return {
      text: item.text,
      tooltip: typeof item.tooltip === 'string' ? item.tooltip : '',
      // `.text` alone cannot answer this: hiding an item leaves its last
      // text in place, so a hidden Frontmatter indicator still reads
      // "$(tag) Frontmatter" until something overwrites it.
      visible: this.visible && this.rendered.has(id),
    };
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  /** For `WritingEditorProvider.register()` to hand every item to `vscode.Disposable.from`. */
  public get statusBarItems(): readonly vscode.StatusBarItem[] {
    return [...this.items.values()];
  }
}
