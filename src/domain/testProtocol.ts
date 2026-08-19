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
  /**
   * CodeMirror's own `view.hasFocus` — deliberately NOT what US-012's
   * focus-ring test asserts on: it ANDs the DOM fact below with
   * `document.hasFocus()`, i.e. whether the VSCode window is the frontmost
   * window of the whole machine. That is the window manager's business, not
   * the extension's, and it made the test pass or fail depending on what
   * else the Author happened to be doing while the suite ran.
   */
  readonly hasFocus: boolean;
  /**
   * Whether the editor's content element is `document.activeElement` — the
   * DOM-level fact the focus-ring CSS (`:focus`, `:focus-visible`) actually
   * keys off, and the one the extension controls. This is what US-012
   * asserts.
   */
  readonly editorHasDomFocus: boolean;
  readonly selectionHead: number;
  /** Text content of every element currently marked with `cm-live-dim` (Focus mode). */
  readonly dimmedText: readonly string[];
  /** `document.documentElement.dataset.theme` — US-016's only way to prove which palette is active. */
  readonly themeAttribute: string;
  /** `document.documentElement.dataset.align` — US-019's only way to prove which alignment is active. */
  readonly alignAttribute: string;
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
    /** US-019: computed alignment and word-hyphenation of the editor's content. */
    readonly textAlign: string;
    readonly hyphens: string;
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
    readonly textAlign: string;
    readonly liveClasses: readonly string[];
    /**
     * US-019: one entry per *visual* line the paragraph wraps into, measured
     * off a DOM Range rather than off the element (a wrapped paragraph is a
     * single `.cm-line` box that always spans the full measure, so its own
     * rectangle can never show whether the text inside reaches the right
     * margin). This is the only way to prove justification actually
     * straightens the right edge instead of merely computing to `justify`.
     */
    readonly visualLines: readonly { readonly top: number; readonly left: number; readonly right: number }[];
  }[];
  /** The content box every visual line above is measured against (US-019). */
  readonly contentBox: { readonly left: number; readonly right: number };
  /**
   * The Writing surface measured two ways: `visibleHeight` is the box the
   * Author sees (`.cm-editor`), `clickableHeight` the box that actually
   * receives a click (`.cm-content`, the `contenteditable`). A click landing
   * between the two reaches no element CodeMirror listens on and does
   * nothing at all, so the surface is only really writable where they
   * coincide — which is what makes this measurable rather than a matter of
   * trusting the CSS. `posAtCoords` cannot stand in for it: it clamps to the
   * nearest position and answers happily for a point no click could ever
   * deliver.
   */
  readonly writingSurface: { readonly visibleHeight: number; readonly clickableHeight: number };
}

import type { TextChange, TextSizeDirection } from './textChange';

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
  | { readonly __test: true; readonly type: 'deleteBackward' }
  // US-017: invokes the exact same handler the CM6 keymap binding (Mod-=,
  // Mod--, Mod-0) runs — the real DOM keyboard event that reaches it is not
  // simulated, same convention as moveCursor above calling the CM6 command
  // directly instead of dispatching a KeyboardEvent.
  | { readonly __test: true; readonly type: 'triggerTextSizeShortcut'; readonly direction: TextSizeDirection }
  // US-007 (006): a real DOM `mousedown` dispatched at a document position,
  // modifier keys included — exercises the actual `domEventHandlers`
  // listener (src/webview/main.ts), not a shortcut around it.
  | { readonly __test: true; readonly type: 'clickAt'; readonly pos: number; readonly metaKey?: boolean; readonly ctrlKey?: boolean }
  // Where a click at these viewport coordinates leaves the cursor: resolved
  // through CodeMirror's own `posAtCoords` — the same lookup its pointer
  // handling does — and dispatched as a collapsed selection. `clickAt`
  // above goes the other way (position → coordinates), which cannot express
  // a click on a line whose whole content is hidden: a Code block's fence
  // line renders empty, so every position on it maps to the same point,
  // while a click anywhere along it resolves to the line's END. That
  // asymmetry is precisely what US-008's reveal has to survive.
  | { readonly __test: true; readonly type: 'placeCursorAtPoint'; readonly x: number; readonly y: number }
  // US-013/US-014/US-015 (006): a real DOM `keydown` on the content
  // element, so the CM6 `keymap` extension itself resolves it — proving
  // `preventDefault: true` actually wins against VSCode's own accelerators
  // (RISK-002), not merely that the handler function works in isolation.
  // `mod`, not a literal `metaKey`/`ctrlKey`: CM6's "Mod-" keybindings
  // resolve to Cmd on macOS and Ctrl everywhere else, so the webview
  // resolves this the same way CM6 itself does (`navigator.platform`) —
  // hard-coding `metaKey` here would only ever exercise the binding on a
  // macOS test runner, passing locally and failing on GitHub Actions' Linux
  // one.
  | { readonly __test: true; readonly type: 'keydown'; readonly key: string; readonly mod?: boolean; readonly altKey?: boolean }
  // US-014: a real DOM `paste` with the given text as its clipboard payload.
  | { readonly __test: true; readonly type: 'pasteText'; readonly text: string }
  // US-012: puts the DOM focus back on the editor explicitly. Whether the
  // webview holds focus after opening depends on the OS window manager
  // (which window is frontmost) — outside the extension's control and not
  // something the product promises. `document.activeElement`, which is what
  // the focus-ring rules actually key off, is per-document and settable
  // regardless, so the ring can be asserted deterministically.
  | { readonly __test: true; readonly type: 'focusEditor' }
  // US-018: CodeMirror only renders lines near the viewport — scrolls the
  // end of the document into view so a snapshot can see a long Chapter's
  // whole composed state, not just what fits on the first screen.
  | { readonly __test: true; readonly type: 'scrollToEnd' };

export type TestFromWebviewMessage = { readonly __test: true; readonly type: 'snapshotResult' } & EditorSnapshot;
