/**
 * A side-channel the integration suite uses to ask the webview about its
 * rendered state. There is no other way to observe a webview's DOM from the
 * extension host, so the webview always answers these — the cost is a
 * couple of tiny always-on message handlers, not a build-time test flag.
 */
export interface EditorSnapshot {
  readonly text: string;
  /** What's actually visible after Live preview decorations (hidden markers collapsed). */
  readonly renderedText: string;
  readonly liveClasses: readonly string[];
  readonly hasGutter: boolean;
  readonly hasFocus: boolean;
  readonly selectionHead: number;
  /** Text content of every element currently marked with `cm-live-dim` (Focus mode). */
  readonly dimmedText: readonly string[];
  /** `document.documentElement.dataset.theme` — US-016's only way to prove which palette is active. */
  readonly themeAttribute: string;
  /** Computed `--editor-dim-opacity`, the Focus mode dimming calibrated per theme (US-016). */
  readonly dimOpacity: string;
  /**
   * Computed `outline` of the editor root (`.cm-editor`) and of whatever DOM
   * node currently has focus (`document.activeElement`) — US-012's only way
   * to prove the focus ring is gone: the CSS as written is not the point,
   * the CSS as it actually resolves is.
   */
  readonly focusRing: {
    readonly editorOutlineStyle: string;
    readonly editorOutlineWidth: string;
    readonly focusedOutlineStyle: string;
    readonly focusedOutlineWidth: string;
  };
  readonly style: {
    readonly fontFamily: string;
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly color: string;
    readonly backgroundColor: string;
    readonly rootMaxWidth: string;
    readonly bodyJustifyContent: string;
    /** US-014 (F-003): the bottom cushion that lets the last line rise off the window's edge. */
    readonly rootPaddingBottom: string;
    /** US-014 (F-005): typographic detail Literata offers beyond the bare defaults. */
    readonly fontVariantLigatures: string;
    readonly fontVariantNumeric: string;
    readonly textRendering: string;
    readonly webkitFontSmoothing: string;
  };
  /**
   * Bounding box (viewport-relative) and text of every rendered CodeMirror
   * line, in document order — US-014's only way to measure real vertical
   * space (the air around a heading) rather than trust the CSS as written.
   *
   * `paddingTop` is reported separately because the air above a heading is
   * `padding-top` on the line, not a margin (see styles.css for why), and
   * padding sits *inside* the rectangle: `top` is the top of the padding
   * box, so the text starts at `top + paddingTop`. Measuring the gap to
   * `top` alone would never see that air.
   */
  readonly lineRects: readonly {
    readonly text: string;
    readonly top: number;
    readonly height: number;
    readonly paddingTop: number;
  }[];
}

import type { TextChange } from './textChange';

export type TestToWebviewMessage =
  | { readonly __test: true; readonly type: 'snapshot' }
  // Dispatches a real CodeMirror transaction, exactly as if the Author had
  // typed it — so it goes through the same updateListener → postMessage
  // path a keystroke would, exercising the real bridge instead of a shortcut.
  | { readonly __test: true; readonly type: 'insert'; readonly changes: readonly TextChange[] }
  // Places the cursor without going through a change, so tests can check
  // Live preview's per-line reveal independently of typing.
  | { readonly __test: true; readonly type: 'setCursor'; readonly pos: number }
  // A real (non-collapsed) selection, for Focus mode's "selection spans two
  // paragraphs" acceptance criterion.
  | { readonly __test: true; readonly type: 'setSelectionRange'; readonly from: number; readonly to: number }
  // Runs the real @codemirror/commands used for arrow-key / backspace
  // movement, so EditorView.atomicRanges is genuinely exercised rather than
  // assumed (US-006/US-008: the cursor must not get stuck in a hidden marker).
  | { readonly __test: true; readonly type: 'moveCursor'; readonly direction: 'left' | 'right' }
  | { readonly __test: true; readonly type: 'deleteBackward' };

export type TestFromWebviewMessage = { readonly __test: true; readonly type: 'snapshotResult' } & EditorSnapshot;
