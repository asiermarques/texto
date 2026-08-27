import * as vscode from 'vscode';
import { isEditorTheme, isTextAlignment } from './domain/preferences';
import { migrateFocusModeFromGlobalState } from './infrastructure/preferences';
import { WritingEditorProvider } from './infrastructure/writingEditorProvider';

/**
 * Exposed via `vscode.extensions.getExtension(id).exports` so the
 * integration suite can reach the live webview panel of a running editor —
 * there is no other way to observe a webview from outside the extension.
 */
export interface TextoExtensionApi {
  readonly panelFor: (uri: vscode.Uri) => vscode.WebviewPanel | undefined;
  readonly isFocusModeEnabled: () => boolean;
  readonly setFocusModeEnabled: (enabled: boolean) => Promise<void>;
  /** US-020: there is no public way to read a `vscode.StatusBarItem`'s current state from outside the extension. */
  readonly getWordCountStatusBarState: () => { readonly visible: boolean; readonly text: string };
  /** US-021: same reason, for one of the toolbar's buttons (see `src/domain/editorToolbar.ts` for the valid ids). */
  readonly getToolbarButtonState: (id: string) => { readonly text: string; readonly tooltip: string; readonly visible: boolean } | undefined;
  /** US-002 (008): how many times the Word count total has actually been recomputed for this Chapter — proves the debounce coalesces a burst of keystrokes into one recomputation. */
  readonly getWordCountRecomputeCount: (uri: vscode.Uri) => number;
}

export async function activate(context: vscode.ExtensionContext): Promise<TextoExtensionApi> {
  // Runs, and completes, before anything else: it must land before any
  // Chapter can be opened, or the first read of texto.focusMode could win
  // the race against the migration's own write (US-015).
  await migrateFocusModeFromGlobalState(context);

  context.subscriptions.push(WritingEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('texto.toggleFocusMode', async () => {
      const enabled = !WritingEditorProvider.isFocusModeEnabled();
      await WritingEditorProvider.setFocusModeEnabled(enabled);
    })
  );

  // US-017: the palette half of text size, alongside the webview's own
  // keymap (Mod-=/Mod--/Mod-0) — both funnel through the same setting.
  // `getActiveDocumentUri()`, not `vscode.window.activeTextEditor`: the
  // latter never sees a CustomTextEditor (RISK-007).
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.increaseTextSize', async () => {
      await WritingEditorProvider.increaseTextSize(WritingEditorProvider.getActiveDocumentUri());
    }),
    vscode.commands.registerCommand('texto.decreaseTextSize', async () => {
      await WritingEditorProvider.decreaseTextSize(WritingEditorProvider.getActiveDocumentUri());
    }),
    vscode.commands.registerCommand('texto.resetTextSize', async () => {
      await WritingEditorProvider.resetTextSize();
    })
  );

  // US-022: panel state, not a setting — toggles the active panel only.
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.toggleRawMarkdown', () => {
      WritingEditorProvider.toggleRawMarkdownView();
    })
  );

  // The toolbar's Frontmatter button. Panel state like Raw markdown above,
  // and routed the same way — there is no fold to toggle without a Writing
  // editor in view.
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.toggleFrontmatter', () => {
      WritingEditorProvider.toggleFrontmatterView();
    })
  );

  // US-005 (009): the palette half of inserting a Table, alongside the
  // webview's own keymap (Mod-Alt-T). Routed to the active panel, not to a
  // TextEditor: the cursor this writes at lives inside the webview.
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.insertTable', () => {
      WritingEditorProvider.insertTable();
    })
  );

  // US-021 (redesigned on Author feedback): the toolbar's Tema and
  // Alineación buttons, one command each carrying its own value as a
  // `Command.arguments` entry — not declared in package.json's `commands`
  // (they need an argument to mean anything, so the palette is not their
  // audience), only registered here and invoked by `EditorToolbar`.
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.setTheme', async (value: unknown) => {
      if (isEditorTheme(value)) {
        await WritingEditorProvider.setTheme(value);
      }
    }),
    vscode.commands.registerCommand('texto.setAlignment', async (value: unknown) => {
      if (isTextAlignment(value)) {
        await WritingEditorProvider.setAlignment(value);
      }
    })
  );

  // The toolbar's version button, and the same answer from the palette:
  // "which Texto am I running" is the first thing a bug report needs, and
  // the manifest is the only source of truth for it. The message reuses the
  // button's own tooltip string, so both surfaces say the same thing in
  // both languages.
  const version = String(context.extension.packageJSON.version);
  context.subscriptions.push(
    vscode.commands.registerCommand('texto.showVersion', async () => {
      await vscode.window.showInformationMessage(vscode.l10n.t('Texto version {0}', version));
    })
  );

  // US-023/US-024: the context menu's resource argument is only there when
  // invoked from the explorer or a tab's own menu; from the palette (or the
  // tab menu, which VSCode also calls with no argument in some versions)
  // there is none, so both fall back to whichever markdown file is in view,
  // in either editor kind (RISK-007: not `vscode.window.activeTextEditor`
  // alone — that misses an active Writing editor entirely).
  const resolveMarkdownResource = (uri?: vscode.Uri): vscode.Uri | undefined =>
    uri ?? vscode.window.activeTextEditor?.document.uri ?? WritingEditorProvider.getActiveDocumentUri();

  context.subscriptions.push(
    vscode.commands.registerCommand('texto.openWithTexto', async (uri?: vscode.Uri) => {
      const resource = resolveMarkdownResource(uri);
      if (resource) {
        await vscode.commands.executeCommand('vscode.openWith', resource, WritingEditorProvider.viewType);
      }
    }),
    vscode.commands.registerCommand('texto.openAsMarkdown', async (uri?: vscode.Uri) => {
      const resource = resolveMarkdownResource(uri);
      if (resource) {
        await vscode.commands.executeCommand('vscode.openWith', resource, 'default');
      }
    })
  );

  return {
    panelFor: (uri) => WritingEditorProvider.panelFor(uri),
    isFocusModeEnabled: () => WritingEditorProvider.isFocusModeEnabled(),
    setFocusModeEnabled: (enabled) => WritingEditorProvider.setFocusModeEnabled(enabled),
    getWordCountStatusBarState: () => WritingEditorProvider.getWordCountStatusBarState(),
    getToolbarButtonState: (id) => WritingEditorProvider.getToolbarButtonState(id),
    getWordCountRecomputeCount: (uri) => WritingEditorProvider.getWordCountRecomputeCount(uri),
  };
}

export function deactivate(): void {
  // Nothing to tear down: subscriptions above own everything we started.
}
