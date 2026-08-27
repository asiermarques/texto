import { cursorCharLeft, cursorCharRight, defaultKeymap, deleteCharBackward } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import type { ExtensionToWebviewMessage, TextChange, TextSizeDirection, WebviewToExtensionMessage } from '../domain/textChange';
import type { TestFromWebviewMessage, TestToWebviewMessage } from '../domain/testProtocol';
import type { TextAlignment } from '../domain/preferences';
import { proseStartOffset } from '../domain/frontmatter';
import { countWordsInRange } from '../domain/wordCount';
import { treeField } from './treeField';
import { toggleInlineWrap } from '../domain/inlineFormatting';
import { isLikelyUrl, pasteUrlOverSelection, wrapSelectionAsLink } from '../domain/linkEditing';
import { computeEnterContinuation } from '../domain/listContinuation';
import { toggleTaskMarkerAt } from '../domain/taskToggle';
import { frontmatterFold, foldedFrontmatterEnd } from './frontmatterFold';
import { livePreview, redrawDiagrams } from './livePreviewPlugin';
import { focusMode } from './focusModePlugin';
import { noFocusRingTheme } from './noFocusRingTheme';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

const vscodeApi = acquireVsCodeApi();

function postToExtension(message: WebviewToExtensionMessage): void {
  vscodeApi.postMessage(message);
}

// Set while we're applying a change that came FROM the extension (init or
// externalUpdate), so the updateListener below doesn't echo it straight
// back as an "edit" message — the webview-side half of the echo-loop guard
// described in RISK-001; EditOriginTracker is the extension-side half.
let applyingExternalChange = false;

const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged && !applyingExternalChange) {
    const changes: TextChange[] = [];
    for (const transaction of update.transactions) {
      transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        changes.push({ from: fromA, to: toA, insert: inserted.toString() });
      });
    }
    if (changes.length > 0) {
      postToExtension({ type: 'edit', changes });
    }
  }
  // US-020: the selection only exists inside CodeMirror — the total word
  // count is computed host-side, off the TextDocument (WritingEditorProvider).
  if ((update.docChanged || update.selectionSet) && !applyingExternalChange) {
    reportSelectionWordCount(update.state);
  }
});

let lastReportedSelectionWordCount: number | undefined;

function reportSelectionWordCount(state: EditorState): void {
  const selection = state.selection.main;
  const text = state.doc.toString();
  // US-004 (008): the same tree livePreviewPlugin.ts/focusModePlugin.ts read
  // — a selection change with no edit costs no parse (FR-002).
  // Clamped past the Frontmatter for the same reason `countWords` excludes
  // it: metadata is not prose. Without this, Select all would report more
  // words selected than the Chapter has in total.
  const from = Math.max(selection.from, proseStartOffset(text));
  const count = selection.empty || from >= selection.to ? 0 : countWordsInRange(state.field(treeField), text, from, selection.to);
  if (count === lastReportedSelectionWordCount) {
    return;
  }
  lastReportedSelectionWordCount = count;
  postToExtension({ type: 'selectionWordCount', count });
}

// Focus mode (US-010) lives in its own Compartment so toggling it reconfigures
// the live view in place — no `setState`, no webview reload, undo history
// and everything else untouched.
const focusModeCompartment = new Compartment();

// US-022: Live preview gets the same Compartment treatment as Focus mode, so
// "ver markdown" can switch it off in place too.
const livePreviewCompartment = new Compartment();

// Frontmatter folds in and out the same way — one more Compartment, so the
// toolbar button reconfigures the live view in place with no reload.
const frontmatterCompartment = new Compartment();

// US-022: panel-local, never persisted — a fresh panel always starts
// composed (see the 'init' handler). `focusModeEnabledPreference` is tracked
// separately from the compartment itself because raw markdown must override
// it without losing what to restore once it's turned off again.
let rawMarkdownActive = false;
let focusModeEnabledPreference = true;
// Frontmatter starts folded away on every fresh panel (see the 'init'
// handler): panel state, never persisted, exactly like rawMarkdownActive.
let frontmatterRevealed = false;

/** Recomputes both compartments from the current preference + raw-view state — the one place either is decided. */
function applyComposition(): void {
  view.dispatch({
    effects: [
      livePreviewCompartment.reconfigure(rawMarkdownActive ? [] : livePreview),
      focusModeCompartment.reconfigure(rawMarkdownActive || !focusModeEnabledPreference ? [] : focusMode),
      // Raw markdown shows the Chapter exactly as it is on disk, so it
      // outranks the fold: hiding something there would contradict the one
      // thing that view is for (Author's choice). The Author's own toggle is
      // remembered, not lost, and applies again on the way back.
      frontmatterCompartment.reconfigure(rawMarkdownActive || frontmatterRevealed ? [] : frontmatterFold),
    ],
  });
}

/**
 * US-017: the webview cannot write `texto.textSize` itself — it asks
 * the extension, exactly like the toggleFocusMode command does, so the
 * setting stays the single source of truth for text size regardless of
 * which of its three origins (command palette, this keymap, or a hand-edited
 * settings.json) changed it. `preventDefault: true` is what lets CodeMirror
 * consume the key before it reaches VSCode's own zoom accelerator
 * (RISK-006) — if a platform still steals it first, `Cmd+Alt+=`/`Cmd+Alt+-`
 * are the documented fallback (see README).
 */
function requestTextSizeChange(direction: TextSizeDirection): (view: EditorView) => boolean {
  return () => {
    postToExtension({ type: 'changeTextSize', direction });
    return true;
  };
}

const textSizeKeymap: readonly KeyBinding[] = [
  { key: 'Mod-=', run: requestTextSizeChange('increase'), preventDefault: true },
  { key: 'Mod--', run: requestTextSizeChange('decrease'), preventDefault: true },
  { key: 'Mod-0', run: requestTextSizeChange('reset'), preventDefault: true },
  { key: 'Mod-Alt-=', run: requestTextSizeChange('increase'), preventDefault: true },
  { key: 'Mod-Alt--', run: requestTextSizeChange('decrease'), preventDefault: true },
];

/**
 * US-007 (BR-004/DEC-001) and US-016 (DEC-002): the two things a click on
 * composed material can mean. A Task's box is checked first — it's a real
 * DOM node precisely so this hit-test works (DEC-002) — before falling
 * through to the Link case, which needs the Cmd/Ctrl modifier VSCode's own
 * link-opening convention uses. The webview itself never navigates for a
 * Link: it only posts the URL (read off the same `title` attribute that
 * makes the target discoverable while hidden, EDGE-003/styles.css) and
 * leaves opening it to the extension host (WritingEditorProvider), the one
 * with a real `vscode.env.openExternal`.
 */
const clickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.cm-live-task')) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const change = pos === null ? null : toggleTaskMarkerAt(view.state.doc.toString(), pos);
      if (change) {
        event.preventDefault();
        view.dispatch({ changes: [change] });
        return true;
      }
    }
    // Requirement 010: the way into a composed Diagram with the mouse.
    // A Diagram is the one composition that replaces its own lines outright,
    // so there is no text under the pointer for CodeMirror to resolve a
    // click to — without this, clicking the picture puts the cursor at its
    // edge, which reads as "outside" and leaves the source unreachable. The
    // same gap US-008 of 006 had to close for a Code block's hidden fence.
    const diagram = target?.closest('.cm-live-diagram');
    if (diagram) {
      const pos = view.posAtDOM(diagram);
      event.preventDefault();
      // One position in, not the block's own start: the start is the fence
      // line's first character, which `touchesBlock` counts as inside, but
      // landing there means a Backspace deletes the paragraph above rather
      // than anything in the block the Author just asked to open.
      view.dispatch({ selection: { anchor: Math.min(pos + 1, view.state.doc.length) } });
      view.focus();
      return true;
    }
    if (!(event.metaKey || event.ctrlKey)) {
      return false;
    }
    const url = target?.closest('.cm-live-link')?.getAttribute('title');
    if (!url) {
      return false;
    }
    event.preventDefault();
    postToExtension({ type: 'openLink', url });
    return true;
  },
});

/**
 * US-014 (EDGE-007): pasting a URL over a non-empty selection turns it into
 * a Link (or, if the selection already is one, replaces only its target —
 * see `pasteUrlOverSelection`) instead of replacing the selected words with
 * the raw URL. An empty selection, or clipboard text that doesn't look like
 * a URL, falls through to CM6's ordinary paste.
 */
const pasteLinkHandler = EditorView.domEventHandlers({
  paste(event, view) {
    const selection = view.state.selection.main;
    if (selection.empty) {
      return false;
    }
    const pasted = event.clipboardData?.getData('text/plain');
    if (!pasted || !isLikelyUrl(pasted)) {
      return false;
    }
    event.preventDefault();
    const { changes } = pasteUrlOverSelection(view.state.doc.toString(), { from: selection.from, to: selection.to }, pasted.trim());
    view.dispatch({ changes });
    return true;
  },
});

/** US-013: `Cmd`/`Ctrl`+`B`/`I` — wraps (or unwraps) the selection with `marker`, through the same edit bridge every keystroke uses. */
function applyInlineWrap(marker: string): (view: EditorView) => boolean {
  return (view) => {
    const selection = view.state.selection.main;
    const result = toggleInlineWrap(view.state.doc.toString(), { from: selection.from, to: selection.to }, marker);
    view.dispatch({ changes: result.changes, selection: result.selection });
    return true;
  };
}

/** US-014: `Cmd`/`Ctrl`+`K` — wraps the selection as `[selection]()`, cursor left on the target. */
function applyLinkWrap(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const result = wrapSelectionAsLink(view.state.doc.toString(), { from: selection.from, to: selection.to });
  view.dispatch({ changes: result.changes, selection: result.selection });
  return true;
}

// RISK-002: Mod-K is VSCode's own chord prefix (Mod-K Mod-S for Keyboard
// Shortcuts, Mod-K V for the markdown preview, …) — the same fallback
// pattern Text size's Mod-Alt-=/Mod-Alt-- already established for when the
// platform steals the plain shortcut first (README, "A Link from the
// keyboard"). Mod-B and Mod-I face weaker competition (VSCode's sidebar
// toggle, not a chord prefix) so they get no alternate binding.
const formattingKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: applyInlineWrap('**'), preventDefault: true },
  { key: 'Mod-i', run: applyInlineWrap('*'), preventDefault: true },
  { key: 'Mod-k', run: applyLinkWrap, preventDefault: true },
  { key: 'Mod-Alt-k', run: applyLinkWrap, preventDefault: true },
];

/**
 * US-015: Enter, only when it lands inside a list item, a Task or a
 * blockquote AND the cursor is collapsed — a real (non-empty) selection
 * means the Author is replacing selected text, not continuing a block, so
 * this falls through to the ordinary Enter binding below it (which then
 * also handles every other Enter: a plain Paragraph, or no match at all).
 */
function continueListOnEnter(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }
  const result = computeEnterContinuation(view.state.doc.toString(), selection.from);
  if (!result) {
    return false;
  }
  view.dispatch({ changes: result.changes, selection: result.selection });
  return true;
}

const listContinuationKeymap: readonly KeyBinding[] = [{ key: 'Enter', run: continueListOnEnter }];

// No undo/redo keymap here on purpose: VSCode owns undo/redo on the
// TextDocument (Cmd+Z/Cmd+Shift+Z are handled by the workbench for the
// active custom editor and are not intercepted here), and the resulting
// document change comes back as an externalUpdate like any other change
// we didn't originate — see US-002/US-003.
function createExtensions(focusModeEnabled: boolean) {
  return [
    // Without this, every style CodeMirror injects at runtime — its own base
    // theme AND every `EditorView.theme` we add (noFocusRingTheme) — is
    // dropped by the webview's Content Security Policy: `style-src` only
    // admits the stylesheet host and this nonce, and CM6 puts the nonce on
    // its `<style>` tag only when this facet says what it is (it does not
    // read the `csp-nonce` meta tag by itself). The failure is silent and
    // looks like a layout bug: `.cm-editor` is left as a plain block, so
    // `.cm-content` never gets its `min-height: 100%` and the clickable
    // surface is only as tall as the text already written — a blank Chapter
    // then has a single line's worth of it, at the very top, and clicking
    // anywhere else in the window does nothing at all.
    EditorView.cspNonce.of(cspNonce),
    // US-004 (008): the Chapter's tree, owned as state and updated
    // incrementally — always on, independent of the two compartments below,
    // so toggling Raw markdown view never tears it down or forces a full
    // reparse on the way back.
    treeField,
    keymap.of(textSizeKeymap),
    keymap.of(formattingKeymap),
    keymap.of(listContinuationKeymap),
    keymap.of(defaultKeymap),
    updateListener,
    clickHandler,
    pasteLinkHandler,
    EditorView.lineWrapping,
    noFocusRingTheme,
    livePreviewCompartment.of(livePreview),
    focusModeCompartment.of(focusModeEnabled ? focusMode : []),
    // Folded from the first frame: a Chapter with Frontmatter must never
    // flash its metadata before the fold lands.
    frontmatterCompartment.of(frontmatterFold),
  ];
}

// The same nonce html.ts stamped into the Content Security Policy, carried
// in the `csp-nonce` meta tag it also emits for exactly this purpose.
const cspNonce = document.querySelector('meta[property="csp-nonce"]')?.getAttribute('content') ?? '';

const root = document.getElementById('editor-root');
if (!root) {
  throw new Error('Writing editor: the #editor-root node is missing from the webview HTML.');
}

// US-018: applied as a custom property on <html> (also set inline in the
// initial HTML — see html.ts, RISK-005), so `.cm-editor` and #editor-root's
// own `max-width: …em` (styles.css) scale together off the same value —
// that is what keeps the measure constant in characters per line.
function applyTextSize(textSize: number): void {
  document.documentElement.style.setProperty('--editor-font-size', `${textSize}px`);
}

// US-019: a data attribute, the same pattern data-theme uses.
function applyAlignment(alignment: TextAlignment): void {
  document.documentElement.dataset.align = alignment;
}

const view = new EditorView({
  state: EditorState.create({ doc: '', extensions: createExtensions(true) }),
  parent: root,
});

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage | TestToWebviewMessage>) => {
  const message = event.data;

  if ('__test' in message && message.__test) {
    if (message.type === 'snapshot') {
      const contentStyle = getComputedStyle(view.contentDOM);
      const bodyStyle = getComputedStyle(document.body);
      const liveClassSet = new Set<string>();
      root.querySelectorAll('[class*="cm-live-"]').forEach((el) => {
        el.classList.forEach((c) => {
          if (c.startsWith('cm-live-')) liveClassSet.add(c);
        });
      });
      const dimmedText = Array.from(root.querySelectorAll('.cm-live-dim'), (el) => el.textContent ?? '');
      const rootElementStyle = getComputedStyle(document.documentElement);
      const editorEl = root.querySelector('.cm-editor');
      const editorOutline = editorEl ? getComputedStyle(editorEl) : undefined;
      const focusedEl = document.activeElement;
      const focusedOutline = focusedEl ? getComputedStyle(focusedEl) : undefined;
      // One box per visual (wrapped) line: a Range over the line's contents
      // yields a client rect per text box, which we merge by row so that
      // decoration spans inside a line don't count as separate lines.
      const measureVisualLines = (el: Element): { top: number; left: number; right: number }[] => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rows = new Map<number, { top: number; left: number; right: number }>();
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 && rect.height === 0) continue;
          const key = Math.round(rect.top);
          const row = rows.get(key);
          if (row) {
            row.left = Math.min(row.left, rect.left);
            row.right = Math.max(row.right, rect.right);
          } else {
            rows.set(key, { top: rect.top, left: rect.left, right: rect.right });
          }
        }
        return [...rows.values()].sort((a, b) => a.top - b.top);
      };
      const contentRect = view.contentDOM.getBoundingClientRect();
      // The text column, not contentDOM's own rectangle: the measure is the
      // element's horizontal padding, so the rectangle spans the window.
      const textColumn = {
        left: contentRect.left + (parseFloat(contentStyle.paddingLeft) || 0),
        right: contentRect.right - (parseFloat(contentStyle.paddingRight) || 0),
      };
      const scrollerRect = view.scrollDOM.getBoundingClientRect();
      const lineRects = Array.from(root.querySelectorAll('.cm-line'), (el) => {
        const rect = el.getBoundingClientRect();
        const lineStyle = getComputedStyle(el);
        return {
          visualLines: measureVisualLines(el),
          text: el.textContent ?? '',
          top: rect.top,
          height: rect.height,
          paddingTop: parseFloat(lineStyle.paddingTop) || 0,
          borderTopWidth: parseFloat(lineStyle.borderTopWidth) || 0,
          borderBottomWidth: parseFloat(lineStyle.borderBottomWidth) || 0,
          width: rect.width,
          // US-019: whether a Scene break keeps its own centring under justified alignment.
          textAlign: lineStyle.textAlign,
          // US-019: the composed marker glyphs (•, ⁂) are ::before content,
          // invisible to textContent, and the real marker may be hidden too —
          // the live classes are the only reliable way to find e.g. the
          // Scene break's line when its text is empty.
          liveClasses: Array.from(el.classList).filter((c) => c.startsWith('cm-live-')),
        };
      });
      const tableCells = Array.from(root.querySelectorAll('.cm-live-table-cell'), (el) => {
        const rect = el.getBoundingClientRect();
        const cellStyle = getComputedStyle(el);
        // The Cell's box is the column; the Range is where its text landed
        // inside that column — the two only coincide for a left-aligned
        // Cell whose text fills it.
        const textBoxes = measureVisualLines(el);
        return {
          text: el.textContent ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          textLeft: textBoxes.length > 0 ? Math.min(...textBoxes.map((b) => b.left)) : rect.left,
          textRight: textBoxes.length > 0 ? Math.max(...textBoxes.map((b) => b.right)) : rect.right,
          textAlign: cellStyle.textAlign,
          fontWeight: cellStyle.fontWeight,
          paddingRight: parseFloat(cellStyle.paddingRight) || 0,
          borderLeftWidth: parseFloat(cellStyle.borderLeftWidth) || 0,
          borderRightWidth: parseFloat(cellStyle.borderRightWidth) || 0,
          fontVariantCaps: cellStyle.fontVariantCaps,
          fontVariantNumeric: cellStyle.fontVariantNumeric,
        };
      });
      const diagrams = Array.from(root.querySelectorAll('.cm-live-diagram'), (el) => {
        const rect = el.getBoundingClientRect();
        const svg = el.querySelector('svg');
        const svgRect = svg?.getBoundingClientRect();
        return {
          fallbackSource: el.querySelector('.cm-live-diagram-source')?.textContent ?? '',
          drawn: svg !== null,
          width: svgRect?.width ?? 0,
          height: svgRect?.height ?? 0,
          // The nonce attribute reads back as empty from the DOM once the
          // document has it (browsers hide it on purpose), so the honest
          // check is the `nonce` property, which keeps the real value.
          styleHasNonce: (svg?.querySelector('style') as (SVGStyleElement & { nonce?: string }) | null | undefined)?.nonce ? true : false,
          right: rect.right,
        };
      });
      const snapshot: TestFromWebviewMessage = {
        __test: true,
        type: 'snapshotResult',
        text: view.state.doc.toString(),
        renderedText: view.contentDOM.textContent ?? '',
        liveClasses: [...liveClassSet].sort(),
        dimmedText,
        themeAttribute: document.documentElement.dataset.theme ?? '',
        alignAttribute: document.documentElement.dataset.align ?? '',
        dimOpacity: rootElementStyle.getPropertyValue('--editor-dim-opacity').trim(),
        focusRing: {
          editorOutlineStyle: editorOutline?.outlineStyle ?? 'none',
          editorOutlineWidth: editorOutline?.outlineWidth ?? '0px',
          focusedOutlineStyle: focusedOutline?.outlineStyle ?? 'none',
          focusedOutlineWidth: focusedOutline?.outlineWidth ?? '0px',
        },
        hasGutter: root.querySelector('.cm-gutters') !== null,
        hasFocus: view.hasFocus,
        editorHasDomFocus: document.activeElement === view.contentDOM,
        selectionHead: view.state.selection.main.head,
        style: {
          fontFamily: contentStyle.fontFamily,
          fontSize: contentStyle.fontSize,
          lineHeight: contentStyle.lineHeight,
          color: contentStyle.color,
          backgroundColor: bodyStyle.backgroundColor,
          contentPaddingBottom: contentStyle.paddingBottom,
          fontVariantLigatures: contentStyle.fontVariantLigatures,
          fontVariantNumeric: contentStyle.fontVariantNumeric,
          textRendering: contentStyle.textRendering,
          webkitFontSmoothing: contentStyle.getPropertyValue('-webkit-font-smoothing'),
          textAlign: contentStyle.textAlign,
          hyphens: contentStyle.getPropertyValue('-webkit-hyphens') || contentStyle.getPropertyValue('hyphens'),
        },
        lineRects,
        tableCells,
        diagrams,
        contentBox: textColumn,
        scrollerBox: { left: scrollerRect.left, right: scrollerRect.right },
        viewportWidth: window.innerWidth,
        writingSurface: {
          visibleHeight: editorEl ? editorEl.getBoundingClientRect().height : 0,
          clickableHeight: contentRect.height,
          viewportHeight: window.innerHeight,
        },
      };
      vscodeApi.postMessage(snapshot);
    } else if (message.type === 'insert') {
      // Mirrors what a real keystroke does: CM6's own input handling moves
      // the caret to right after what was typed. A plain changes-only
      // dispatch does not do that by itself, so it's set explicitly here to
      // faithfully simulate typing rather than a silent no-op cursor.
      const changes = message.changes.map((change) => ({ from: change.from, to: change.to, insert: change.insert }));
      const changeSet = view.state.changes(changes);
      const lastChange = message.changes[message.changes.length - 1];
      const anchor = lastChange ? changeSet.mapPos(lastChange.to, 1) : view.state.selection.main.head;
      view.dispatch({ changes, selection: { anchor } });
    } else if (message.type === 'setCursor') {
      view.dispatch({ selection: { anchor: message.pos } });
    } else if (message.type === 'setSelectionRange') {
      view.dispatch({ selection: { anchor: message.from, head: message.to } });
    } else if (message.type === 'moveCursor') {
      (message.direction === 'left' ? cursorCharLeft : cursorCharRight)(view);
    } else if (message.type === 'deleteBackward') {
      deleteCharBackward(view);
    } else if (message.type === 'triggerTextSizeShortcut') {
      requestTextSizeChange(message.direction)(view);
    } else if (message.type === 'clickAt') {
      const coords = view.coordsAtPos(message.pos);
      const clientX = coords ? coords.left : 0;
      const clientY = coords ? (coords.top + coords.bottom) / 2 : 0;
      const domTarget = coords ? document.elementFromPoint(clientX, clientY) : null;
      // clientX/clientY matter beyond finding domTarget: US-016's real
      // handler (src/webview/main.ts's clickHandler) reads the position
      // back off the event with `view.posAtCoords`, exactly like a real
      // click would — omitting them would resolve every click to (0, 0).
      const mouseEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        metaKey: message.metaKey ?? false,
        ctrlKey: message.ctrlKey ?? false,
      });
      (domTarget ?? view.contentDOM).dispatchEvent(mouseEvent);
    } else if (message.type === 'placeCursorAtPoint') {
      // A collapsed selection, not a synthetic mousedown: without the
      // mouseup that ends a real drag, CM6's pointer handling leaves a
      // non-empty range behind, which would reveal a marker by overlapping
      // it rather than by resting on its line — the very distinction under
      // test. `posAtCoords` is CM6's own hit-test either way.
      const pos = view.posAtCoords({ x: message.x, y: message.y });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }
    } else if (message.type === 'keydown') {
      // Mirrors @codemirror/view's own platform check (`/Mac/.test(nav.platform)`)
      // so "Mod" resolves to whichever modifier CM6 itself expects on the
      // platform actually running the test — Cmd locally on macOS, Ctrl on
      // the Linux runner GitHub Actions uses.
      const isMac = /Mac/.test(navigator.platform);
      const keyEvent = new KeyboardEvent('keydown', {
        key: message.key,
        metaKey: (message.mod ?? false) && isMac,
        ctrlKey: (message.mod ?? false) && !isMac,
        altKey: message.altKey ?? false,
        bubbles: true,
        cancelable: true,
      });
      view.contentDOM.dispatchEvent(keyEvent);
    } else if (message.type === 'pasteText') {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', message.text);
      const pasteEvent = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(pasteEvent);
    } else if (message.type === 'focusEditor') {
      view.focus();
    } else if (message.type === 'scrollToEnd') {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.length) });
    }
    return;
  }

  if (message.type === 'init') {
    // The initial theme, text size and alignment already travelled in the
    // HTML itself (see html.ts, RISK-005) — this is only a safety net in the
    // unlikely case a preference changed between that HTML being built and
    // this message arriving.
    document.documentElement.dataset.theme = message.theme;
    applyTextSize(message.textSize);
    applyAlignment(message.alignment);
    // US-022: a freshly opened panel always starts composed — raw markdown
    // is panel state, never carried over from a previous session. The same
    // goes for the Frontmatter fold: a Chapter always opens with its
    // metadata folded away.
    rawMarkdownActive = false;
    frontmatterRevealed = false;
    focusModeEnabledPreference = message.focusModeEnabled;
    applyingExternalChange = true;
    view.setState(EditorState.create({ doc: message.text, extensions: createExtensions(message.focusModeEnabled) }));
    applyingExternalChange = false;
    view.focus();
    return;
  }

  if (message.type === 'externalUpdate') {
    applyingExternalChange = true;
    view.dispatch({
      changes: message.changes.map((change) => ({ from: change.from, to: change.to, insert: change.insert })),
    });
    applyingExternalChange = false;
    return;
  }

  if (message.type === 'setFocusMode') {
    focusModeEnabledPreference = message.enabled;
    applyComposition();
    return;
  }

  if (message.type === 'setTheme') {
    document.documentElement.dataset.theme = message.theme;
    // Requirement 010: every other composition follows the theme through
    // CSS, which needs nothing dispatched. A Diagram is drawn once with its
    // palette baked into the SVG, so it is the one thing that has to be
    // composed again.
    view.dispatch({ effects: redrawDiagrams.of(undefined) });
    return;
  }

  if (message.type === 'setTextSize') {
    applyTextSize(message.textSize);
    return;
  }

  if (message.type === 'setAlignment') {
    applyAlignment(message.alignment);
    return;
  }

  if (message.type === 'toggleRawMarkdown') {
    rawMarkdownActive = !rawMarkdownActive;
    applyComposition();
    postToExtension({ type: 'rawMarkdownChanged', enabled: rawMarkdownActive });
    return;
  }

  if (message.type === 'toggleFrontmatter') {
    frontmatterRevealed = !frontmatterRevealed;
    if (!frontmatterRevealed) {
      moveCursorOutOfFrontmatter();
    }
    applyComposition();
    if (frontmatterRevealed) {
      // Unfolding something the Author cannot see is the same as not
      // unfolding it: the block is always at the very top of the Chapter, so
      // showing it means going there. A separate dispatch, after
      // applyComposition, so the scroll is measured against the layout that
      // now has the block in it. The cursor is deliberately left where the
      // Author was writing — this carries the view, not the caret.
      view.dispatch({ effects: EditorView.scrollIntoView(0, { y: 'start' }) });
    }
    postToExtension({ type: 'frontmatterChanged', revealed: frontmatterRevealed });
  }
});

/**
 * `atomicRanges` stops the cursor entering a fold, but it cannot evict one
 * that was already inside when the fold appeared — an Author who was editing
 * a field and then folds the block would be left typing into nothing. Moving
 * the selection to the Chapter's first character is the only honest place
 * for it to go.
 */
function moveCursorOutOfFrontmatter(): void {
  const end = foldedFrontmatterEnd(view.state.doc);
  if (end > 0 && view.state.selection.main.from < end) {
    view.dispatch({ selection: { anchor: Math.min(end + 1, view.state.doc.length) } });
  }
}

postToExtension({ type: 'ready' });
