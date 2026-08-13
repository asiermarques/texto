import { describe, expect, it } from 'vitest';
import { getHtmlForWebview } from '../../src/domain/html';

const webview = { cspSource: 'vscode-webview://abc123' };
const assets = {
  scriptUri: 'vscode-webview://abc123/dist/webview.js',
  styleUri: 'vscode-webview://abc123/dist/media/styles.css',
  fontCssUri: 'vscode-webview://abc123/dist/media/fonts.css',
};

describe('getHtmlForWebview', () => {
  it('declares a Content-Security-Policy that only allows the webview origin plus the nonce', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', 'claro');

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(webview.cspSource);
    expect(html).toContain("script-src 'nonce-the-nonce'");
    expect(html).not.toContain('unsafe-inline');
  });

  it('loads the script through the provided webview URI, with the nonce attached', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', 'claro');

    expect(html).toContain(`<script nonce="the-nonce" src="${assets.scriptUri}">`);
  });

  it('loads the stylesheet and font stylesheet through webview URIs', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', 'claro');

    expect(html).toContain(assets.styleUri);
    expect(html).toContain(assets.fontCssUri);
  });

  it('exposes the nonce for style-mod so CodeMirror can inject styles under CSP', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', 'claro');

    expect(html).toContain('<meta property="csp-nonce" content="the-nonce"');
  });

  it('provides a mount point for the editor', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', 'claro');

    expect(html).toContain('id="editor-root"');
  });

  it('US-016/RISK-005: sets data-theme on <html> itself, so the palette is there on first paint — no flash', () => {
    expect(getHtmlForWebview(webview, assets, 'the-nonce', 'claro')).toContain('<html lang="es" data-theme="claro">');
    expect(getHtmlForWebview(webview, assets, 'the-nonce', 'oscuro')).toContain('<html lang="es" data-theme="oscuro">');
    expect(getHtmlForWebview(webview, assets, 'the-nonce', 'vscode')).toContain('<html lang="es" data-theme="vscode">');
  });
});
