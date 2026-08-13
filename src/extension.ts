import * as vscode from 'vscode';
import { migrateFocusModeFromGlobalState } from './infrastructure/preferences';
import { ProseEditorProvider } from './infrastructure/proseEditorProvider';

/**
 * Exposed via `vscode.extensions.getExtension(id).exports` so the
 * integration suite can reach the live webview panel of a running editor —
 * there is no other way to observe a webview from outside the extension.
 */
export interface TextoExtensionApi {
  readonly panelFor: (uri: vscode.Uri) => vscode.WebviewPanel | undefined;
  readonly isFocusModeEnabled: () => boolean;
  readonly setFocusModeEnabled: (enabled: boolean) => Promise<void>;
}

export async function activate(context: vscode.ExtensionContext): Promise<TextoExtensionApi> {
  // Runs, and completes, before anything else: it must land before any
  // Chapter can be opened, or the first read of texto.modoFoco could win
  // the race against the migration's own write (US-015).
  await migrateFocusModeFromGlobalState(context);

  context.subscriptions.push(ProseEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('texto.toggleFocusMode', async () => {
      const enabled = !ProseEditorProvider.isFocusModeEnabled();
      await ProseEditorProvider.setFocusModeEnabled(enabled);
    })
  );

  return {
    panelFor: (uri) => ProseEditorProvider.panelFor(uri),
    isFocusModeEnabled: () => ProseEditorProvider.isFocusModeEnabled(),
    setFocusModeEnabled: (enabled) => ProseEditorProvider.setFocusModeEnabled(enabled),
  };
}

export function deactivate(): void {
  // Nothing to tear down: subscriptions above own everything we started.
}
