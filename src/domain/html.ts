import type { EditorTheme } from './preferences';

export interface WebviewLike {
  readonly cspSource: string;
}

export interface HtmlAssetUris {
  readonly scriptUri: string;
  readonly styleUri: string;
  readonly fontCssUri: string;
}

/**
 * The webview's HTML shell. Kept as a pure function of its inputs (no
 * `vscode` import) so it can be unit-tested without an extension host —
 * `webview` only needs to look like a `vscode.Webview` (`cspSource`).
 *
 * `theme` is stamped on `<html>` itself rather than sent later over
 * `postMessage` (US-016, RISK-005): the palette in `styles.css` is scoped by
 * `[data-theme]`, and the stylesheet already has to load before the script
 * (US-005's no-flash guarantee) — putting the theme in the same HTML string
 * means the right palette is there on first paint, same guarantee, one more
 * attribute.
 */
export function getHtmlForWebview(webview: WebviewLike, assets: HtmlAssetUris, nonce: string, theme: EditorTheme): string {
  return `<!DOCTYPE html>
<html lang="es" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <meta property="csp-nonce" content="${nonce}" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource}; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
  />
  <link rel="stylesheet" href="${assets.fontCssUri}">
  <link rel="stylesheet" href="${assets.styleUri}">
  <title>Editor de escritura</title>
</head>
<body>
  <div id="editor-root"></div>
  <script nonce="${nonce}" src="${assets.scriptUri}"></script>
</body>
</html>`;
}
