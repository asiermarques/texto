import * as vscode from 'vscode';
import { EditOriginTracker } from '../domain/editOriginTracker';
import { getHtmlForWebview } from '../domain/html';
import { getNonce } from '../domain/nonce';
import type { EditorTheme } from '../domain/preferences';
import type { ExtensionToWebviewMessage, TextChange, WebviewToExtensionMessage } from '../domain/textChange';
import { getPreferences, onPreferencesChanged, setFocusModeEnabled as writeFocusModeEnabled } from './preferences';

/**
 * The Prose editor: a `CustomTextEditorProvider` for `*.md` files.
 *
 * Owns every call into the `vscode` API — applying edits, subscribing to
 * document changes, building the webview HTML. The parts with real logic
 * (origin tracking, HTML shape) are pure functions from `../domain` that
 * this class wires up; this class itself is the untested-by-vitest shell,
 * covered instead by the @vscode/test-electron integration suite.
 */
export class ProseEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'texto.editorDeEscritura';

  // Keyed by document URI. The integration suite is the only consumer: a
  // webview's rendered state isn't observable from the extension host any
  // other way, so tests need a handle on the live panel to message it. The
  // matching `documents` map is what lets a config-change subscription
  // re-read each panel's *resource-scoped* preferences (US-015) without
  // threading the document through some other channel.
  private static readonly panels = new Map<string, vscode.WebviewPanel>();
  private static readonly documents = new Map<string, vscode.Uri>();

  public static panelFor(uri: vscode.Uri): vscode.WebviewPanel | undefined {
    return ProseEditorProvider.panels.get(uri.toString());
  }

  // Focus mode (US-009/US-010) is one global preference, not per-Chapter —
  // it travels with the Author, not with the file. Since US-015 it is the
  // `texto.modoFoco` setting rather than `context.globalState`: no more
  // in-memory cache, because the reason it existed (a `globalState` read
  // triggered from a different event could observe a stale value right
  // after a write, due to that storage's own IPC round trip) does not apply
  // to `vscode.workspace.getConfiguration`, which is synchronous and always
  // current within the extension host.
  public static isFocusModeEnabled(resource?: vscode.Uri): boolean {
    return getPreferences(resource).focusModeEnabled;
  }

  public static async setFocusModeEnabled(enabled: boolean): Promise<void> {
    await writeFocusModeEnabled(enabled);
    // Propagation to open panels is not done here: the `onPreferencesChanged`
    // subscription registered in `register()` reacts to this update the same
    // way it reacts to the Author editing settings.json directly — one
    // mechanism for both origins.
  }

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new ProseEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(ProseEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });

    // Applied in place to every open Prose editor — no webview reload —
    // whether the change came from the toggle command or from the Author
    // editing settings.json directly.
    const configSubscription = onPreferencesChanged(() => {
      for (const [uriString, panel] of ProseEditorProvider.panels) {
        const uri = ProseEditorProvider.documents.get(uriString);
        const preferences = getPreferences(uri);
        void panel.webview.postMessage({ type: 'setFocusMode', enabled: preferences.focusModeEnabled } satisfies ExtensionToWebviewMessage);
        void panel.webview.postMessage({ type: 'setTheme', theme: preferences.theme } satisfies ExtensionToWebviewMessage);
      }
    });

    return vscode.Disposable.from(providerRegistration, configSubscription);
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const tracker = new EditOriginTracker();
    ProseEditorProvider.panels.set(document.uri.toString(), webviewPanel);
    ProseEditorProvider.documents.set(document.uri.toString(), document.uri);

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview, getPreferences(document.uri).theme);

    const postToWebview = (message: ExtensionToWebviewMessage): void => {
      void webviewPanel.webview.postMessage(message);
    };

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) {
        return;
      }
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
        });
        return;
      }
      if (message.type === 'edit') {
        void this.applyChanges(document, message.changes, tracker);
      }
    });

    webviewPanel.onDidDispose(() => {
      ProseEditorProvider.panels.delete(document.uri.toString());
      ProseEditorProvider.documents.delete(document.uri.toString());
      changeSubscription.dispose();
      messageSubscription.dispose();
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

  private buildHtml(webview: vscode.Webview, theme: EditorTheme): string {
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
      theme
    );
  }
}
