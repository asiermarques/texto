import type { EditorTheme, TextAlignment } from './preferences';

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

/** US-017: which way the keymap shortcut (Mod-=/Mod--/Mod-0) asked to move. */
export type TextSizeDirection = 'increase' | 'decrease' | 'reset';

export type WebviewToExtensionMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'edit'; readonly changes: readonly TextChange[] }
  // US-017: the webview can't write texto.textSize itself — it asks the
  // extension, the same as the toggleFocusMode command does, so the setting
  // stays the one source of truth regardless of which of the three origins
  // (command, keymap, hand-edited settings.json) changed it.
  | { readonly type: 'changeTextSize'; readonly direction: TextSizeDirection }
  // US-020: the selection lives in CodeMirror, so only the webview can count
  // its words; the total is computed host-side, straight off the
  // `TextDocument` (see WritingEditorProvider).
  | { readonly type: 'selectionWordCount'; readonly count: number }
  // US-022: panel-local state, not a setting — reported so US-021's menu can
  // show the current value, but never persisted anywhere.
  | { readonly type: 'rawMarkdownChanged'; readonly enabled: boolean }
  // US-007 (006, BR-004/DEC-001): Cmd/Ctrl+click on a composed Link. The
  // webview never navigates itself — it only posts the target, and the
  // extension host opens it with vscode.env.openExternal.
  | { readonly type: 'openLink'; readonly url: string };

export type ExtensionToWebviewMessage =
  | {
      readonly type: 'init';
      readonly text: string;
      readonly focusModeEnabled: boolean;
      readonly theme: EditorTheme;
      readonly textSize: number;
      readonly alignment: TextAlignment;
    }
  | { readonly type: 'externalUpdate'; readonly changes: readonly TextChange[] }
  // Toggling Focus mode on an already-open editor (US-010): applied in place,
  // no webview reload — see focusModeCompartment in src/webview/main.ts.
  | { readonly type: 'setFocusMode'; readonly enabled: boolean }
  // US-016: same pattern as setFocusMode — the initial theme already
  // travelled in the HTML (see html.ts), this is only for a later change.
  | { readonly type: 'setTheme'; readonly theme: EditorTheme }
  // US-017/US-018: applied as a CSS custom property, no reload.
  | { readonly type: 'setTextSize'; readonly textSize: number }
  // US-019: applied as a data attribute, no reload.
  | { readonly type: 'setAlignment'; readonly alignment: TextAlignment }
  // US-022: toggles Live preview and Focus mode's dimming off in place (a
  // Compartment reconfigure, like Focus mode itself) — sent only to the
  // active panel, resolved host-side (WritingEditorProvider.activeUri, the
  // same tracking RISK-007/US-020 introduced).
  | { readonly type: 'toggleRawMarkdown' };

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
