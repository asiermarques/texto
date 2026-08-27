import * as vscode from 'vscode';
import { buildAllToolbarButtons, type ToolbarStrings } from '../domain/editorToolbar';
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
function resolveToolbarStrings(version: string): ToolbarStrings {
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
  };
}

const BUTTON_IDS = [
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

function commandFor(id: string): string | vscode.Command {
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

  public refresh(preferences: WritingEditorPreferences, rawMarkdownActive: boolean): void {
    for (const spec of buildAllToolbarButtons(preferences, rawMarkdownActive, this.version, resolveToolbarStrings(this.version))) {
      const item = this.items.get(spec.id);
      if (!item) {
        continue;
      }
      item.text = spec.text;
      item.tooltip = spec.tooltip;
      item.show();
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
  public getButtonState(id: string): { readonly text: string; readonly tooltip: string } | undefined {
    const item = this.items.get(id);
    return item ? { text: item.text, tooltip: typeof item.tooltip === 'string' ? item.tooltip : '' } : undefined;
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  /** For `WritingEditorProvider.register()` to hand every item to `vscode.Disposable.from`. */
  public get statusBarItems(): readonly vscode.StatusBarItem[] {
    return [...this.items.values()];
  }
}
