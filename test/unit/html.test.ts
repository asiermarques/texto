import { describe, expect, it } from 'vitest';
import { getHtmlForWebview } from '../../src/domain/html';

const webview = { cspSource: 'vscode-webview://abc123' };
const assets = {
  scriptUri: 'vscode-webview://abc123/dist/webview.js',
  styleUri: 'vscode-webview://abc123/dist/media/styles.css',
  fontCssUri: 'vscode-webview://abc123/dist/media/fonts.css',
};
const preferences = { theme: 'light' as const, textSize: 18, alignment: 'left' as const };

describe('getHtmlForWebview', () => {
  it('declares a Content-Security-Policy that only allows the webview origin plus the nonce', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', preferences);

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain(webview.cspSource);
    expect(html).toContain("script-src 'nonce-the-nonce'");
    expect(html).not.toContain('unsafe-inline');
  });

  it('loads the script through the provided webview URI, with the nonce attached', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', preferences);

    expect(html).toContain(`<script nonce="the-nonce" src="${assets.scriptUri}">`);
  });

  it('loads the stylesheet and font stylesheet through webview URIs', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', preferences);

    expect(html).toContain(assets.styleUri);
    expect(html).toContain(assets.fontCssUri);
  });

  it('exposes the nonce for style-mod so CodeMirror can inject styles under CSP', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', preferences);

    expect(html).toContain('<meta property="csp-nonce" content="the-nonce"');
  });

  it('provides a mount point for the editor', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', preferences);

    expect(html).toContain('id="editor-root"');
  });

  it('US-016/RISK-005: sets data-theme on <html> itself, so the palette is there on first paint — no flash', () => {
    expect(getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, theme: 'light' })).toContain('data-theme="light"');
    expect(getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, theme: 'dark' })).toContain('data-theme="dark"');
    expect(getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, theme: 'vscode' })).toContain('data-theme="vscode"');
  });

  it('US-018: sets the text size as a CSS custom property on <html> itself — no flash of the factory size', () => {
    const html = getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, textSize: 22 });
    expect(html).toContain('--editor-font-size:22px');
  });

  it('US-019: sets data-align on <html> itself — no flash of the default alignment', () => {
    expect(getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, alignment: 'right' })).toContain('data-align="right"');
    expect(getHtmlForWebview(webview, assets, 'the-nonce', { ...preferences, alignment: 'justified' })).toContain(
      'data-align="justified"'
    );
  });
});
