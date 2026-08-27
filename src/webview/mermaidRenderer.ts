import type { renderMermaidSVG, THEMES } from 'beautiful-mermaid';

/**
 * Loads the **Diagram** renderer on demand, and turns a **Diagram**'s source
 * into an SVG the Writing surface can show.
 *
 * Only the types of `beautiful-mermaid` are imported here — never its code.
 * A value import would pull the whole 1.5 MB renderer into `dist/webview.js`,
 * which is exactly what `src/webview/mermaidBundle.ts` exists to avoid
 * (ADR 0004). What this module actually calls is whatever that separate
 * bundle published on `window`, once it has arrived.
 */

type MermaidGlobal = {
  renderMermaidSVG: typeof renderMermaidSVG;
  THEMES: typeof THEMES;
};

/**
 * The two palettes a **Diagram** is drawn with. Colours come from
 * `beautiful-mermaid`'s own `THEMES` rather than from the **Editor theme**'s
 * custom properties: a composed **Diagram** is a plate set into the prose,
 * like a **Code block**'s ground, and it carries the renderer's palette
 * rather than the **Writing surface**'s.
 */
export type DiagramTheme = 'github-light' | 'github-dark';

/**
 * Which of the two the current **Editor theme** resolves to. Light and Dark
 * map straight across; "vscode" has no palette of its own to read, so it
 * follows the kind of theme VSCode stamps on the webview's `body`
 * (`vscode-light`, `vscode-dark`, `vscode-high-contrast`,
 * `vscode-high-contrast-light`) — the same signal its own webview styles use.
 */
export function currentDiagramTheme(): DiagramTheme {
  const editorTheme = document.documentElement.dataset.theme;
  if (editorTheme === 'light') {
    return 'github-light';
  }
  if (editorTheme === 'dark') {
    return 'github-dark';
  }
  return document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light')
    ? 'github-light'
    : 'github-dark';
}

/**
 * `beautiful-mermaid` puts a Google Fonts `@import` at the top of every SVG
 * it renders, to fetch the face it measured the text boxes with. The
 * webview's Content Security Policy admits no remote origin at all, so the
 * request is refused whatever we do — this strips it so the refusal is not
 * also a console error on every **Diagram**, and so no **Chapter** ever
 * reaches for the network merely by being opened. The `font-family` rule
 * after it stays, and falls through to the same `system-ui` the SVG already
 * names as its fallback.
 */
const REMOTE_FONT_IMPORT = /@import\s+url\((['"]?)https?:\/\/[^)]*\1\)\s*;?/g;

function withoutRemoteFonts(svg: string): string {
  return svg.replace(REMOTE_FONT_IMPORT, '');
}

// Rendering a flowchart costs ~8ms — nothing on a cursor move, far too much
// on a keystroke, and a Chapter's Diagrams are re-composed on both. Keyed by
// source AND theme, because the same source drawn in the other palette is a
// different picture. Bounded, and oldest-first: a Map preserves insertion
// order, so its first key is the least recently added.
const MAX_CACHED_DIAGRAMS = 64;
const cache = new Map<string, string>();

function cacheKey(source: string, theme: DiagramTheme): string {
  return `${theme} ${source}`;
}

/** The renderer, if this webview has already loaded it. */
function loaded(): MermaidGlobal | undefined {
  return window.__textoMermaid;
}

let loading: Promise<MermaidGlobal | undefined> | undefined;

/**
 * Fetches `dist/mermaid.js`, once per webview. The URI and the nonce both
 * come out of the HTML shell `src/domain/html.ts` wrote: the script is
 * injected rather than declared there so a **Chapter** without a **Diagram**
 * never loads it, and it needs the nonce because the Content Security Policy
 * admits no script without one.
 *
 * Resolves to `undefined` rather than rejecting when the script cannot be
 * had — a **Diagram** that fails to load falls back to showing its own
 * source (`diagramWidget.ts`), which is a worse Writing surface but never a
 * broken one.
 */
export function loadDiagramRenderer(): Promise<MermaidGlobal | undefined> {
  const already = loaded();
  if (already) {
    return Promise.resolve(already);
  }
  if (loading) {
    return loading;
  }

  const src = document.querySelector('meta[property="mermaid-script"]')?.getAttribute('content');
  const nonce = document.querySelector('meta[property="csp-nonce"]')?.getAttribute('content') ?? '';
  if (!src) {
    return Promise.resolve(undefined);
  }

  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.setAttribute('nonce', nonce);
    script.src = src;
    script.addEventListener('load', () => resolve(loaded()));
    script.addEventListener('error', () => resolve(undefined));
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * The **Diagram**'s SVG, or `undefined` when the renderer has not arrived
 * yet (the caller then waits on `loadDiagramRenderer` and asks again) or
 * when this source is not a diagram the renderer understands.
 *
 * Synchronous by design: `beautiful-mermaid` renders synchronously, so a
 * cached **Diagram** — which is every **Diagram** after its first draw — is
 * painted in the same frame CodeMirror builds the widget in, with no flash
 * of placeholder in between.
 */
export function renderDiagram(source: string, theme: DiagramTheme): string | undefined {
  const key = cacheKey(source, theme);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached === '' ? undefined : cached;
  }

  const mermaid = loaded();
  if (!mermaid) {
    return undefined;
  }

  let svg: string;
  try {
    svg = withoutRemoteFonts(mermaid.renderMermaidSVG(source, mermaid.THEMES[theme]));
  } catch {
    // Unparseable source, an unsupported diagram type, a solver that gave
    // up: all the same thing from here. Cached as the empty string so a
    // Chapter with a half-written Diagram in it does not pay the failed
    // render again on every keystroke elsewhere in the file.
    svg = '';
  }

  if (cache.size >= MAX_CACHED_DIAGRAMS) {
    const oldest = cache.keys().next();
    if (!oldest.done) {
      cache.delete(oldest.value);
    }
  }
  cache.set(key, svg);
  return svg === '' ? undefined : svg;
}
