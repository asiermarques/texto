import { cursorCharLeft, cursorCharRight, defaultKeymap, deleteCharBackward } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import type { ExtensionToWebviewMessage, TextChange, TextSizeDirection, WebviewToExtensionMessage } from '../domain/textChange';
import type { TestFromWebviewMessage, TestToWebviewMessage } from '../domain/testProtocol';
import type { TextAlignment } from '../domain/preferences';
import { countWordsInRange } from '../domain/wordCount';
import { livePreview } from './livePreviewPlugin';
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
  const count = selection.empty ? 0 : countWordsInRange(state.doc.toString(), selection.from, selection.to);
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

// US-022: panel-local, never persisted — a fresh panel always starts
// composed (see the 'init' handler). `focusModeEnabledPreference` is tracked
// separately from the compartment itself because raw markdown must override
// it without losing what to restore once it's turned off again.
let rawMarkdownActive = false;
let focusModeEnabledPreference = true;

/** Recomputes both compartments from the current preference + raw-view state — the one place either is decided. */
function applyComposition(): void {
  view.dispatch({
    effects: [
      livePreviewCompartment.reconfigure(rawMarkdownActive ? [] : livePreview),
      focusModeCompartment.reconfigure(rawMarkdownActive || !focusModeEnabledPreference ? [] : focusMode),
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

// No undo/redo keymap here on purpose: VSCode owns undo/redo on the
// TextDocument (Cmd+Z/Cmd+Shift+Z are handled by the workbench for the
// active custom editor and are not intercepted here), and the resulting
// document change comes back as an externalUpdate like any other change
// we didn't originate — see US-002/US-003.
function createExtensions(focusModeEnabled: boolean) {
  return [
    keymap.of(textSizeKeymap),
    keymap.of(defaultKeymap),
    updateListener,
    EditorView.lineWrapping,
    noFocusRingTheme,
    livePreviewCompartment.of(livePreview),
    focusModeCompartment.of(focusModeEnabled ? focusMode : []),
  ];
}

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
      const rootStyle = getComputedStyle(root);
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
      const lineRects = Array.from(root.querySelectorAll('.cm-line'), (el) => {
        const rect = el.getBoundingClientRect();
        const lineStyle = getComputedStyle(el);
        return {
          visualLines: measureVisualLines(el),
          text: el.textContent ?? '',
          top: rect.top,
          height: rect.height,
          paddingTop: parseFloat(lineStyle.paddingTop) || 0,
          // US-019: whether a Scene break keeps its own centring under justified alignment.
          textAlign: lineStyle.textAlign,
          // US-019: the composed marker glyphs (•, ⁂) are ::before content,
          // invisible to textContent, and the real marker may be hidden too —
          // the live classes are the only reliable way to find e.g. the
          // Scene break's line when its text is empty.
          liveClasses: Array.from(el.classList).filter((c) => c.startsWith('cm-live-')),
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
        selectionHead: view.state.selection.main.head,
        style: {
          fontFamily: contentStyle.fontFamily,
          fontSize: contentStyle.fontSize,
          lineHeight: contentStyle.lineHeight,
          color: contentStyle.color,
          backgroundColor: bodyStyle.backgroundColor,
          rootMaxWidth: rootStyle.maxWidth,
          bodyJustifyContent: bodyStyle.justifyContent,
          rootPaddingBottom: rootStyle.paddingBottom,
          fontVariantLigatures: contentStyle.fontVariantLigatures,
          fontVariantNumeric: contentStyle.fontVariantNumeric,
          textRendering: contentStyle.textRendering,
          webkitFontSmoothing: contentStyle.getPropertyValue('-webkit-font-smoothing'),
          textAlign: contentStyle.textAlign,
          hyphens: contentStyle.getPropertyValue('-webkit-hyphens') || contentStyle.getPropertyValue('hyphens'),
        },
        lineRects,
        contentBox: { left: contentRect.left, right: contentRect.right },
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
    // is panel state, never carried over from a previous session.
    rawMarkdownActive = false;
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
  }
});

postToExtension({ type: 'ready' });
