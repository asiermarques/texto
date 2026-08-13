import { cursorCharLeft, cursorCharRight, defaultKeymap, deleteCharBackward } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { ExtensionToWebviewMessage, TextChange, WebviewToExtensionMessage } from '../domain/textChange';
import type { TestFromWebviewMessage, TestToWebviewMessage } from '../domain/testProtocol';
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
  if (!update.docChanged || applyingExternalChange) {
    return;
  }
  const changes: TextChange[] = [];
  for (const transaction of update.transactions) {
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
  }
  if (changes.length > 0) {
    postToExtension({ type: 'edit', changes });
  }
});

// Focus mode (US-010) lives in its own Compartment so toggling it reconfigures
// the live view in place — no `setState`, no webview reload, undo history
// and everything else untouched.
const focusModeCompartment = new Compartment();

// No undo/redo keymap here on purpose: VSCode owns undo/redo on the
// TextDocument (Cmd+Z/Cmd+Shift+Z are handled by the workbench for the
// active custom editor and are not intercepted here), and the resulting
// document change comes back as an externalUpdate like any other change
// we didn't originate — see US-002/US-003.
function createExtensions(focusModeEnabled: boolean) {
  return [
    keymap.of(defaultKeymap),
    updateListener,
    EditorView.lineWrapping,
    noFocusRingTheme,
    livePreview,
    focusModeCompartment.of(focusModeEnabled ? focusMode : []),
  ];
}

const root = document.getElementById('editor-root');
if (!root) {
  throw new Error('Prose editor: the #editor-root node is missing from the webview HTML.');
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
      const lineRects = Array.from(root.querySelectorAll('.cm-line'), (el) => {
        const rect = el.getBoundingClientRect();
        const lineStyle = getComputedStyle(el);
        return {
          text: el.textContent ?? '',
          top: rect.top,
          height: rect.height,
          paddingTop: parseFloat(lineStyle.paddingTop) || 0,
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
        },
        lineRects,
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
    }
    return;
  }

  if (message.type === 'init') {
    // The initial theme already travelled in the HTML itself (see html.ts,
    // RISK-005) — this is only a safety net in the unlikely case the
    // preference changed between that HTML being built and this message
    // arriving.
    document.documentElement.dataset.theme = message.theme;
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
    view.dispatch({ effects: focusModeCompartment.reconfigure(message.enabled ? focusMode : []) });
    return;
  }

  if (message.type === 'setTheme') {
    document.documentElement.dataset.theme = message.theme;
  }
});

postToExtension({ type: 'ready' });
