import { renderMermaidSVG, THEMES } from 'beautiful-mermaid';

/**
 * The **Diagram** renderer, built as a bundle of its own (`dist/mermaid.js`,
 * see `esbuild.js`) and loaded only by a **Chapter** that actually contains
 * one — never by `dist/webview.js`, which every **Chapter** pays for on
 * every panel open.
 *
 * That split is the whole point of this file: `beautiful-mermaid` and the
 * layout engine it depends on weigh ~1.5 MB minified against the Writing
 * surface's own ~326 KB, and 94% of it is ELK, a graph-layout solver imported
 * statically and impossible to tree-shake. Folding it into the Writing
 * surface would make every **Chapter** — a novel with no diagram in it as
 * much as a design note full of them — parse six times the JavaScript before
 * showing its first line (ADR 0004).
 *
 * The bundle publishes itself on `window` rather than exporting: it is
 * fetched by `src/webview/mermaidRenderer.ts` as a plain `<script>` tag,
 * because the webview's own bundle is an IIFE and a dynamic `import()`
 * inside one has no module graph to resolve against.
 */
declare global {
  interface Window {
    __textoMermaid?: {
      renderMermaidSVG: typeof renderMermaidSVG;
      THEMES: typeof THEMES;
    };
  }
}

window.__textoMermaid = { renderMermaidSVG, THEMES };
