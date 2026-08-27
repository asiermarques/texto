import type { EditorTheme, TextAlignment } from './preferences';

export interface WebviewLike {
  readonly cspSource: string;
}

export interface HtmlAssetUris {
  readonly scriptUri: string;
  readonly styleUri: string;
  readonly fontCssUri: string;
  /**
   * Requirement 010: where the **Diagram** renderer lives. Advertised in a
   * meta tag rather than loaded by a `<script>` of its own — the webview
   * injects it, and only once a **Chapter** turns out to contain a
   * **Diagram**, so the ~1.5MB bundle is never on the path to first paint
   * (ADR 0004).
   */
  readonly mermaidScriptUri: string;
}

/** The subset of `WritingEditorPreferences` that has to be visible before first paint. */
export interface InitialPresentation {
  readonly theme: EditorTheme;
  readonly textSize: number;
  readonly alignment: TextAlignment;
}

/**
 * The webview's HTML shell. Kept as a pure function of its inputs (no
 * `vscode` import) so it can be unit-tested without an extension host —
 * `webview` only needs to look like a `vscode.Webview` (`cspSource`).
 *
 * `theme`, `textSize` and `alignment` are stamped on `<html>` itself rather
 * than sent later over `postMessage` (US-016/US-018/US-019, RISK-005): the
 * palette, measure and alignment in `styles.css` are all scoped off `<html>`
 * attributes/custom properties, and the stylesheet already has to load
 * before the script (US-005's no-flash guarantee) — putting these in the
 * same HTML string means the right composition is there on first paint,
 * same guarantee, extended to the two settings that shipped after the theme.
 */
export function getHtmlForWebview(webview: WebviewLike, assets: HtmlAssetUris, nonce: string, presentation: InitialPresentation): string {
  return `<!DOCTYPE html>
<html lang="es" data-theme="${presentation.theme}" data-align="${presentation.alignment}" style="--editor-font-size:${presentation.textSize}px">
<head>
  <meta charset="UTF-8" />
  <meta property="csp-nonce" content="${nonce}" />
  <meta property="mermaid-script" content="${assets.mermaidScriptUri}" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource}; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
  />
  <link rel="stylesheet" href="${assets.fontCssUri}">
  <link rel="stylesheet" href="${assets.styleUri}">
  <title>Writing editor</title>
</head>
<body>
  <div id="editor-root"></div>
  <script nonce="${nonce}" src="${assets.scriptUri}"></script>
</body>
</html>`;
}
