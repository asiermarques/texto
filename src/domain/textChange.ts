import type { EditorTheme } from './preferences';

/**
 * A single change described as offsets into the document, in the SAME
 * coordinate space CodeMirror's `ChangeSet.iterChanges` and VSCode's
 * `WorkspaceEdit` both use for multi-part edits: ranges into the *original*
 * (pre-edit) document, not cascading against each other.
 */
export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export type WebviewToExtensionMessage = { readonly type: 'ready' } | { readonly type: 'edit'; readonly changes: readonly TextChange[] };

export type ExtensionToWebviewMessage =
  | { readonly type: 'init'; readonly text: string; readonly focusModeEnabled: boolean; readonly theme: EditorTheme }
  | { readonly type: 'externalUpdate'; readonly changes: readonly TextChange[] }
  // Toggling Focus mode on an already-open editor (US-010): applied in place,
  // no webview reload — see focusModeCompartment in src/webview/main.ts.
  | { readonly type: 'setFocusMode'; readonly enabled: boolean }
  // US-016: same pattern as setFocusMode — the initial theme already
  // travelled in the HTML (see html.ts), this is only for a later change.
  | { readonly type: 'setTheme'; readonly theme: EditorTheme };

/**
 * Applies a batch of original-offset changes to a plain string. Used to
 * state, and test, the semantics the message protocol relies on — the
 * production path applies the same kind of change to a `vscode.TextDocument`
 * via `WorkspaceEdit`, and to a CodeMirror document via a transaction.
 */
export function applyChangesToText(text: string, changes: readonly TextChange[]): string {
  const sorted = [...changes].sort((a, b) => a.from - b.from);
  let result = '';
  let cursor = 0;
  for (const change of sorted) {
    result += text.slice(cursor, change.from);
    result += change.insert;
    cursor = change.to;
  }
  result += text.slice(cursor);
  return result;
}
