import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { TextoExtensionApi } from '../../src/extension';
import type { EditorSnapshot, TestFromWebviewMessage, TestToWebviewMessage } from '../../src/domain/testProtocol';
import type { TextChange } from '../../src/domain/textChange';

const EXTENSION_ID = 'asiermarques.texto';
export const VIEW_TYPE = 'texto.editor';

export async function getExtensionApi(): Promise<TextoExtensionApi> {
  const extension = vscode.extensions.getExtension<TextoExtensionApi>(EXTENSION_ID);
  if (!extension) {
    throw new Error(`The extension "${EXTENSION_ID}" is not loaded in the test host.`);
  }
  return extension.isActive ? extension.exports : await extension.activate();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor<T>(
  fn: () => T | undefined | Promise<T | undefined>,
  description: string,
  timeoutMs = 5000
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for: ${description}`);
    }
    await sleep(25);
  }
}

/** Creates a scratch `.md` fixture file in its own temp dir, for isolation between tests. */
export async function createScratchFile(content: string): Promise<vscode.Uri> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texto-integration-'));
  const filePath = path.join(dir, 'chapter.md');
  await fs.promises.writeFile(filePath, content, 'utf8');
  return vscode.Uri.file(filePath);
}

export async function deleteScratchFile(uri: vscode.Uri): Promise<void> {
  await fs.promises.rm(path.dirname(uri.fsPath), { recursive: true, force: true });
}

export async function openInWritingEditor(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
  await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
  const api = await getExtensionApi();
  const panel = await waitFor(() => api.panelFor(uri), `the Writing editor panel for ${uri.fsPath}`);
  // The webview script loads asynchronously; retry the handshake until it
  // has registered its message listener, instead of racing it once.
  await waitFor(
    async () => (await tryRequestSnapshot(panel, 300)) !== undefined || undefined,
    "the webview's first answer (handshake)"
  );
  return panel;
}

/** One snapshot request, resolving to undefined (not throwing) if it times out. */
async function tryRequestSnapshot(panel: vscode.WebviewPanel, timeoutMs: number): Promise<EditorSnapshot | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const subscription = panel.webview.onDidReceiveMessage((message: TestFromWebviewMessage) => {
      if (settled || !(message && message.__test && message.type === 'snapshotResult')) {
        return;
      }
      settled = true;
      subscription.dispose();
      resolve(message);
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.dispose();
      resolve(undefined);
    }, timeoutMs);
    const request: TestToWebviewMessage = { __test: true, type: 'snapshot' };
    void panel.webview.postMessage(request).then(() => clearTimeout(timer));
  });
}

export async function requestSnapshot(panel: vscode.WebviewPanel): Promise<EditorSnapshot> {
  const snapshot = await waitFor(() => tryRequestSnapshot(panel, 300), "the webview's answer to a snapshot request");
  return snapshot;
}

/** Simulates the Author typing: dispatches a real CodeMirror transaction in the webview. */
export async function simulateTyping(panel: vscode.WebviewPanel, changes: readonly TextChange[]): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'insert', changes };
  await panel.webview.postMessage(request);
}

export async function setCursor(panel: vscode.WebviewPanel, pos: number): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'setCursor', pos };
  await panel.webview.postMessage(request);
}

export async function setSelection(panel: vscode.WebviewPanel, from: number, to: number): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'setSelectionRange', from, to };
  await panel.webview.postMessage(request);
}

export async function moveCursor(panel: vscode.WebviewPanel, direction: 'left' | 'right'): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'moveCursor', direction };
  await panel.webview.postMessage(request);
}

export async function deleteBackward(panel: vscode.WebviewPanel): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'deleteBackward' };
  await panel.webview.postMessage(request);
}

/** US-007: a real DOM mousedown at a document position, modifiers included. */
export async function clickAt(panel: vscode.WebviewPanel, pos: number, modifiers: { meta?: boolean; ctrl?: boolean } = {}): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'clickAt', pos, metaKey: modifiers.meta, ctrlKey: modifiers.ctrl };
  await panel.webview.postMessage(request);
}

/**
 * US-013/US-014/US-015: a real DOM keydown, so CM6's own keymap resolves it
 * (RISK-002). `mod` is CM6's own platform-independent modifier ("Mod-b" in
 * a keymap binding) — the webview resolves it to Cmd or Ctrl for whichever
 * platform is actually running the test, so this passes the same way
 * locally (macOS) and in CI (Linux).
 */
export async function pressKey(panel: vscode.WebviewPanel, key: string, modifiers: { mod?: boolean; alt?: boolean } = {}): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'keydown', key, mod: modifiers.mod, altKey: modifiers.alt };
  await panel.webview.postMessage(request);
}

/** US-014: a real DOM paste with `text` as its clipboard payload. */
export async function pasteText(panel: vscode.WebviewPanel, text: string): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'pasteText', text };
  await panel.webview.postMessage(request);
}

/** US-018: scrolls the end of the document into view, so a snapshot can see a long Chapter's whole composed state. */
export async function scrollToEnd(panel: vscode.WebviewPanel): Promise<void> {
  const request: TestToWebviewMessage = { __test: true, type: 'scrollToEnd' };
  await panel.webview.postMessage(request);
}

export async function waitForText(uri: vscode.Uri, expected: string, timeoutMs = 5000): Promise<void> {
  await waitFor(
    async () => {
      const document = await vscode.workspace.openTextDocument(uri);
      return document.getText() === expected ? true : undefined;
    },
    `the TextDocument to reach: ${JSON.stringify(expected)}`,
    timeoutMs
  );
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
