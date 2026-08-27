import * as vscode from 'vscode';
import { EditOriginTracker } from '../domain/editOriginTracker';
import { EditorToolbar } from './editorToolbar';
import { getHtmlForWebview } from '../domain/html';
import { getNonce } from '../domain/nonce';
import {
  decreaseTextSize,
  increaseTextSize,
  TEXT_SIZE_DEFAULT,
  type EditorTheme,
  type WritingEditorPreferences,
  type TextAlignment,
} from '../domain/preferences';
import type { ExtensionToWebviewMessage, TextChange, WebviewToExtensionMessage } from '../domain/textChange';
import { countWords } from '../domain/wordCount';
import {
  getPreferences,
  onPreferencesChanged,
  setAlignment as writeAlignment,
  setFocusModeEnabled as writeFocusModeEnabled,
  setTextSize as writeTextSize,
  setTheme as writeTheme,
} from './preferences';
import { WordCountStatusBar } from './wordCountStatusBar';

/**
 * The Writing editor: a `CustomTextEditorProvider` for `*.md` files.
 *
 * Owns every call into the `vscode` API — applying edits, subscribing to
 * document changes, building the webview HTML. The parts with real logic
 * (origin tracking, HTML shape) are pure functions from `../domain` that
 * this class wires up; this class itself is the untested-by-vitest shell,
 * covered instead by the @vscode/test-electron integration suite.
 */
export class WritingEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'texto.editor';

  // Keyed by document URI. The integration suite is the only consumer: a
  // webview's rendered state isn't observable from the extension host any
  // other way, so tests need a handle on the live panel to message it. The
  // matching `documents` map is what lets a config-change subscription
  // re-read each panel's *resource-scoped* preferences (US-015), and now
  // also what recomputes the word count total (US-020), without threading
  // the document through some other channel.
  private static readonly panels = new Map<string, vscode.WebviewPanel>();
  private static readonly documents = new Map<string, vscode.TextDocument>();

  // US-020 (RISK-007): `onDidChangeActiveTextEditor` never fires for a
  // CustomTextEditor, so the status bar's visibility is governed from here —
  // each panel's own `onDidChangeViewState` — rather than from the usual
  // VSCode editor-focus event.
  private static readonly wordCountBar = new WordCountStatusBar();
  // US-002 (008): the Chapter total is recomputed at most once per
  // ~200ms of typing rather than once per keystroke (FR-004/ASM-002) — the
  // extension host's only work on the hot path, taken off it. `wordCountTotals`
  // is the last-recomputed total per document, read by every render that
  // isn't itself a recomputation (a selection change, reactivating a panel);
  // `pendingWordCountRecompute` is the in-flight trailing-edge timer per
  // document, cleared and replaced by each new change so only the LAST one
  // in a burst fires (EDGE-003: dropping the trailing update would leave the
  // total permanently wrong until the next edit).
  private static readonly WORD_COUNT_DEBOUNCE_MS = 200;
  private static readonly wordCountTotals = new Map<string, number>();
  private static readonly pendingWordCountRecompute = new Map<string, ReturnType<typeof setTimeout>>();
  // Test-only: how many times countWords has actually run for a document,
  // so the integration suite can prove a burst of keystrokes recomputes the
  // total once, not once per keystroke — there is no other way to observe a
  // recomputation from outside the extension (US-020's `getWordCountStatusBarState`
  // is the same idea, for the rendered text).
  private static readonly wordCountRecomputeCounts = new Map<string, number>();
  // US-021 (redesigned on Author feedback): one status bar button per
  // setting, shown/hidden alongside wordCountBar under the same activeUri.
  private static readonly toolbar = new EditorToolbar();
  private static activeUri: string | undefined;
  // Same as `activeUri`, except it is not cleared when the panel merely loses
  // focus. Clicking a status bar button can blur the webview before the
  // command runs, and a preference write still has to know which Chapter it
  // is for to resolve its scope (`writePreference`) — falling back to Global
  // there is exactly the bug that made these buttons look dead inside a
  // Writing space that pins the setting.
  private static lastActiveUri: string | undefined;
  private static readonly selectionWordCounts = new Map<string, number>();

  // US-022: panel-local, not a setting — mirrored here only so the toolbar's
  // "ver markdown" button can show the current value; the webview is the
  // source of truth, this is just what it last reported.
  private static readonly rawMarkdownStates = new Map<string, boolean>();

  /** US-021's toolbar reads this to label its "ver markdown" button; defaults to composed for an unknown/not-yet-reporting panel. */
  public static isRawMarkdownActive(uri: vscode.Uri): boolean {
    return WritingEditorProvider.rawMarkdownStates.get(uri.toString()) ?? false;
  }

  /** Toggles the *active* panel only (RISK-007's tracking) — there is nothing to toggle if no Writing editor is focused. */
  public static toggleRawMarkdownView(): void {
    const uriString = WritingEditorProvider.activeUri;
    if (!uriString) {
      return;
    }
    void WritingEditorProvider.panels.get(uriString)?.webview.postMessage({ type: 'toggleRawMarkdown' } satisfies ExtensionToWebviewMessage);
  }

  public static panelFor(uri: vscode.Uri): vscode.WebviewPanel | undefined {
    return WritingEditorProvider.panels.get(uri.toString());
  }

  /** US-021: the document behind whichever panel is currently active — `vscode.window.activeTextEditor` doesn't see a CustomTextEditor (RISK-007). */
  public static getActiveDocumentUri(): vscode.Uri | undefined {
    const uriString = WritingEditorProvider.activeUri;
    return uriString ? WritingEditorProvider.documents.get(uriString)?.uri : undefined;
  }

  /** The Chapter a preference change is being made for — see `lastActiveUri`. */
  private static getPreferenceResource(): vscode.Uri | undefined {
    const uriString = WritingEditorProvider.activeUri ?? WritingEditorProvider.lastActiveUri;
    return uriString ? WritingEditorProvider.documents.get(uriString)?.uri : undefined;
  }

  /** Exposed for the integration suite — there is no other way to read a `vscode.StatusBarItem`'s current state. */
  public static getWordCountStatusBarState(): { readonly visible: boolean; readonly text: string } {
    return { visible: WritingEditorProvider.wordCountBar.isVisible, text: WritingEditorProvider.wordCountBar.text };
  }

  /** Exposed for the integration suite — same reason as `getWordCountStatusBarState`. */
  public static getToolbarButtonState(id: string): { readonly text: string; readonly tooltip: string } | undefined {
    return WritingEditorProvider.toolbar.getButtonState(id);
  }

  /** Exposed for the integration suite (US-002 of 008) — proves a burst of keystrokes recomputes the total once, not once per keystroke. */
  public static getWordCountRecomputeCount(uri: vscode.Uri): number {
    return WritingEditorProvider.wordCountRecomputeCounts.get(uri.toString()) ?? 0;
  }

  private static setActivePanel(document: vscode.TextDocument): void {
    WritingEditorProvider.activeUri = document.uri.toString();
    WritingEditorProvider.lastActiveUri = WritingEditorProvider.activeUri;
    WritingEditorProvider.refreshWordCountStatusBar(document);
    WritingEditorProvider.refreshToolbar(document);
  }

  private static clearActivePanel(uriString: string): void {
    if (WritingEditorProvider.activeUri !== uriString) {
      return;
    }
    WritingEditorProvider.activeUri = undefined;
    WritingEditorProvider.wordCountBar.hide();
    WritingEditorProvider.toolbar.hide();
  }

  /** Renders the bar from the last-recomputed total (US-002 of 008) — never itself a recomputation, so a selection change or reactivating a panel costs no parse. */
  private static refreshWordCountStatusBar(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    if (WritingEditorProvider.activeUri !== uriString) {
      return;
    }
    const total = WritingEditorProvider.wordCountTotals.get(uriString) ?? WritingEditorProvider.recomputeWordCountTotal(document);
    const selected = WritingEditorProvider.selectionWordCounts.get(uriString) ?? 0;
    WritingEditorProvider.wordCountBar.show(total, selected);
  }

  /** The one place `countWords` actually runs (US-002 of 008) — records the result so `refreshWordCountStatusBar` can read it without recomputing. */
  private static recomputeWordCountTotal(document: vscode.TextDocument): number {
    const uriString = document.uri.toString();
    const total = countWords(document.getText());
    WritingEditorProvider.wordCountTotals.set(uriString, total);
    WritingEditorProvider.wordCountRecomputeCounts.set(uriString, (WritingEditorProvider.wordCountRecomputeCounts.get(uriString) ?? 0) + 1);
    return total;
  }

  /**
   * FR-004/ASM-002: trailing-edge debounce — each call cancels whichever
   * recompute was still pending for this document and schedules a fresh
   * one, so a burst of keystrokes inside ~200ms of each other recomputes the
   * total exactly once, on the LAST one. EDGE-003 is why this is trailing
   * (delay-and-coalesce), not leading (ignore-if-too-soon): the latter would
   * drop the update for the keystroke that ends the burst, leaving the total
   * permanently wrong until some unrelated later edit.
   */
  private static scheduleWordCountRecompute(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    const pending = WritingEditorProvider.pendingWordCountRecompute.get(uriString);
    if (pending) {
      clearTimeout(pending);
    }
    const timer = setTimeout(() => {
      WritingEditorProvider.pendingWordCountRecompute.delete(uriString);
      WritingEditorProvider.recomputeWordCountTotal(document);
      WritingEditorProvider.refreshWordCountStatusBar(document);
    }, WritingEditorProvider.WORD_COUNT_DEBOUNCE_MS);
    WritingEditorProvider.pendingWordCountRecompute.set(uriString, timer);
  }

  /** A panel closing (or a Chapter no longer tracked) must not let a pending recompute fire against stale state later. */
  private static cancelPendingWordCountRecompute(uriString: string): void {
    const pending = WritingEditorProvider.pendingWordCountRecompute.get(uriString);
    if (pending) {
      clearTimeout(pending);
      WritingEditorProvider.pendingWordCountRecompute.delete(uriString);
    }
  }

  private static refreshToolbar(document: vscode.TextDocument): void {
    const uriString = document.uri.toString();
    if (WritingEditorProvider.activeUri !== uriString) {
      return;
    }
    WritingEditorProvider.toolbar.refresh(getPreferences(document.uri), WritingEditorProvider.isRawMarkdownActive(document.uri));
  }

  // Focus mode (US-009/US-010) is one global preference, not per-Chapter —
  // it travels with the Author, not with the file. Since US-015 it is the
  // `texto.focusMode` setting rather than `context.globalState`: no more
  // in-memory cache, because the reason it existed (a `globalState` read
  // triggered from a different event could observe a stale value right
  // after a write, due to that storage's own IPC round trip) does not apply
  // to `vscode.workspace.getConfiguration`, which is synchronous and always
  // current within the extension host.
  public static isFocusModeEnabled(resource?: vscode.Uri): boolean {
    return getPreferences(resource ?? WritingEditorProvider.getPreferenceResource()).focusModeEnabled;
  }

  public static async setFocusModeEnabled(enabled: boolean, resource?: vscode.Uri): Promise<void> {
    await writeFocusModeEnabled(enabled, resource ?? WritingEditorProvider.getPreferenceResource());
    // Propagation to open panels is not done here: the `onPreferencesChanged`
    // subscription registered in `register()` reacts to this update the same
    // way it reacts to the Author editing settings.json directly — one
    // mechanism for both origins.
  }

  // US-017: text size, resolved and written the same way as Focus mode — see
  // setFocusModeEnabled above. `resource` is the Chapter the change is being
  // made for: it decides both which scope's value is read (a Writing space's
  // local settings override the Author's global choice) and, since the
  // scope-shadowing bug, which scope the new value is written to.
  public static getTextSize(resource?: vscode.Uri): number {
    return getPreferences(resource ?? WritingEditorProvider.getPreferenceResource()).textSize;
  }

  public static async increaseTextSize(resource?: vscode.Uri): Promise<void> {
    const target = resource ?? WritingEditorProvider.getPreferenceResource();
    await writeTextSize(increaseTextSize(WritingEditorProvider.getTextSize(target)), target);
  }

  public static async decreaseTextSize(resource?: vscode.Uri): Promise<void> {
    const target = resource ?? WritingEditorProvider.getPreferenceResource();
    await writeTextSize(decreaseTextSize(WritingEditorProvider.getTextSize(target)), target);
  }

  public static async resetTextSize(resource?: vscode.Uri): Promise<void> {
    await writeTextSize(TEXT_SIZE_DEFAULT, resource ?? WritingEditorProvider.getPreferenceResource());
  }

  // US-021: the toolbar's Tema and Alineación buttons write straight
  // through these — same scope resolution as every other preference.
  public static async setTheme(value: EditorTheme, resource?: vscode.Uri): Promise<void> {
    await writeTheme(value, resource ?? WritingEditorProvider.getPreferenceResource());
  }

  public static async setAlignment(value: TextAlignment, resource?: vscode.Uri): Promise<void> {
    await writeAlignment(value, resource ?? WritingEditorProvider.getPreferenceResource());
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new WritingEditorProvider(context);
    // The version button has nothing to show until the manifest is in
    // reach: `EditorToolbar` is a static field, constructed before any
    // `ExtensionContext` exists. This runs once, well before any Chapter
    // can be opened, so every refresh() afterwards already has it.
    WritingEditorProvider.toolbar.setVersion(String(context.extension.packageJSON.version));
    const providerRegistration = vscode.window.registerCustomEditorProvider(WritingEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });

    // Applied in place to every open Writing editor — no webview reload —
    // whether the change came from the toggle command or from the Author
    // editing settings.json directly.
    const configSubscription = onPreferencesChanged(() => {
      for (const [uriString, panel] of WritingEditorProvider.panels) {
        const document = WritingEditorProvider.documents.get(uriString);
        const preferences = getPreferences(document?.uri);
        void panel.webview.postMessage({ type: 'setFocusMode', enabled: preferences.focusModeEnabled } satisfies ExtensionToWebviewMessage);
        void panel.webview.postMessage({ type: 'setTheme', theme: preferences.theme } satisfies ExtensionToWebviewMessage);
        void panel.webview.postMessage({ type: 'setTextSize', textSize: preferences.textSize } satisfies ExtensionToWebviewMessage);
        void panel.webview.postMessage({ type: 'setAlignment', alignment: preferences.alignment } satisfies ExtensionToWebviewMessage);
        if (document) {
          WritingEditorProvider.refreshToolbar(document);
        }
      }
    });

    return vscode.Disposable.from(
      providerRegistration,
      configSubscription,
      WritingEditorProvider.wordCountBar.statusBarItem,
      ...WritingEditorProvider.toolbar.statusBarItems
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const tracker = new EditOriginTracker();
    WritingEditorProvider.panels.set(document.uri.toString(), webviewPanel);
    WritingEditorProvider.documents.set(document.uri.toString(), document);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview, getPreferences(document.uri));

    // US-020 (RISK-007): a freshly resolved panel starts active more often
    // than not (VSCode opens it in the foreground), and `onDidChangeViewState`
    // only fires on a later CHANGE — this covers the initial state too.
    if (webviewPanel.active) {
      WritingEditorProvider.setActivePanel(document);
    }

    // `active` is focus, `visible` is "still the editor on screen": a webview
    // panel goes inactive as soon as the Author clicks anywhere outside the
    // iframe — including on the toolbar's own status bar buttons — so hiding
    // on `!active` made the whole toolbar vanish under the very click that
    // was meant to use it. Only leaving the Chapter (`!visible`) hides it.
    const viewStateSubscription = webviewPanel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        WritingEditorProvider.setActivePanel(document);
      } else if (!event.webviewPanel.visible) {
        WritingEditorProvider.clearActivePanel(document.uri.toString());
      }
    });

    const postToWebview = (message: ExtensionToWebviewMessage): void => {
      void webviewPanel.webview.postMessage(message);
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      // US-020: the total updates on every change, own edits included — only
      // the externalUpdate message below is limited to changes we didn't
      // originate. US-002 (008): debounced rather than recomputed inline —
      // see scheduleWordCountRecompute.
      WritingEditorProvider.scheduleWordCountRecompute(document);
      if (tracker.isOwnChange(event.document.version)) {
        return;
      }
      if (event.contentChanges.length === 0) {
        return;
      }
      const changes: TextChange[] = event.contentChanges.map((change) => ({
        from: change.rangeOffset,
        to: change.rangeOffset + change.rangeLength,
        insert: change.text,
      }));
      postToWebview({ type: 'externalUpdate', changes });
    });

    const messageSubscription = webviewPanel.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      if (message.type === 'ready') {
        const preferences = getPreferences(document.uri);
        postToWebview({
          type: 'init',
          text: document.getText(),
          focusModeEnabled: preferences.focusModeEnabled,
          theme: preferences.theme,
          textSize: preferences.textSize,
          alignment: preferences.alignment,
        });
        return;
      }
      if (message.type === 'edit') {
        void this.applyChanges(document, message.changes, tracker);
        return;
      }
      if (message.type === 'changeTextSize') {
        if (message.direction === 'increase') {
          void WritingEditorProvider.increaseTextSize(document.uri);
        } else if (message.direction === 'decrease') {
          void WritingEditorProvider.decreaseTextSize(document.uri);
        } else {
          void WritingEditorProvider.resetTextSize();
        }
        return;
      }
      if (message.type === 'selectionWordCount') {
        WritingEditorProvider.selectionWordCounts.set(document.uri.toString(), message.count);
        WritingEditorProvider.refreshWordCountStatusBar(document);
        return;
      }
      if (message.type === 'rawMarkdownChanged') {
        WritingEditorProvider.rawMarkdownStates.set(document.uri.toString(), message.enabled);
        WritingEditorProvider.refreshToolbar(document);
        return;
      }
      if (message.type === 'openLink') {
        // BR-004/DEC-001: the webview never navigates itself — this is the
        // one place a Link's target is actually opened, with VSCode's own
        // API, the same "explicit Author gesture" the Privacy NFR asks for.
        void vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
    });

    webviewPanel.onDidDispose(() => {
      WritingEditorProvider.panels.delete(document.uri.toString());
      WritingEditorProvider.documents.delete(document.uri.toString());
      WritingEditorProvider.selectionWordCounts.delete(document.uri.toString());
      WritingEditorProvider.rawMarkdownStates.delete(document.uri.toString());
      // US-002 (008): a pending debounced recompute must not fire against a
      // closed panel's disposed status bar item once this Chapter is gone.
      WritingEditorProvider.cancelPendingWordCountRecompute(document.uri.toString());
      WritingEditorProvider.wordCountTotals.delete(document.uri.toString());
      WritingEditorProvider.wordCountRecomputeCounts.delete(document.uri.toString());
      if (WritingEditorProvider.lastActiveUri === document.uri.toString()) {
        WritingEditorProvider.lastActiveUri = undefined;
      }
      WritingEditorProvider.clearActivePanel(document.uri.toString());
      changeSubscription.dispose();
      messageSubscription.dispose();
      viewStateSubscription.dispose();
    });
  }

  private async applyChanges(
    document: vscode.TextDocument,
    changes: readonly TextChange[],
    tracker: EditOriginTracker
  ): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    for (const change of changes) {
      const range = new vscode.Range(document.positionAt(change.from), document.positionAt(change.to));
      edit.replace(document.uri, range, change.insert);
    }
    // A single `applyEdit` call is one atomic edit: VSCode bumps
    // `document.version` by exactly 1 for it, however many ranges it touches.
    tracker.markOwnEdit(document.version + 1);
    await vscode.workspace.applyEdit(edit);
  }

  private buildHtml(webview: vscode.Webview, preferences: WritingEditorPreferences): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'styles.css'));
    const fontCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'fonts.css'));
    return getHtmlForWebview(
      webview,
      {
        scriptUri: scriptUri.toString(),
        styleUri: styleUri.toString(),
        fontCssUri: fontCssUri.toString(),
      },
      nonce,
      { theme: preferences.theme, textSize: preferences.textSize, alignment: preferences.alignment }
    );
  }
}
