import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-016: light and dark, the editor's own themes.
//
// US-005 asserted the editor always follows VSCode's theme (OQ-002). This
// plan reverts that: light is the default (DEC-005), independent of VSCode's
// theme, with dark and "vscode" (the old behaviour) as the other two
// values of `texto.theme`. See ARCHITECTURE.md, "Theme follows VSCode".
// Values renamed from claro/oscuro to light/dark in US-002 (003).

async function setTheme(value: 'light' | 'dark' | 'vscode' | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('theme', value, vscode.ConfigurationTarget.Global);
}

suite('US-016: the Writing editor theme', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await setTheme(undefined); // back to the default value (light)
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('without touching the setting, and with VSCode on a dark theme, the Chapter is composed in Light', async function () {
    this.timeout(15000);
    const config = vscode.workspace.getConfiguration();
    const originalWorkbenchTheme = config.get<string>('workbench.colorTheme');
    await config.update('workbench.colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);

    try {
      fileUri = await createScratchFile('Un párrafo de prueba.');
      const panel = await openInWritingEditor(fileUri);
      const snapshot = await requestSnapshot(panel);

      assert.strictEqual(snapshot.themeAttribute, 'light');
    } finally {
      await config.update('workbench.colorTheme', originalWorkbenchTheme, vscode.ConfigurationTarget.Global);
    }
  });

  test('the background and colour of Light are neither pure white nor pure black (paper, not screen)', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.notStrictEqual(snapshot.style.backgroundColor, 'rgb(255, 255, 255)');
    assert.notStrictEqual(snapshot.style.color, 'rgb(0, 0, 0)');
  });

  test('changing the setting to Dark changes the palette without reloading the open Chapter', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);
    assert.strictEqual(before.themeAttribute, 'light');

    await setTheme('dark');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'dark' ? s : undefined;
    }, 'the Chapter to switch to Dark');
    assert.notStrictEqual(snapshot.style.backgroundColor, before.style.backgroundColor);
  });

  test('with the setting on "vscode", the Chapter follows VSCode\'s active theme, as before this story', async function () {
    this.timeout(15000);
    await setTheme('vscode');
    const config = vscode.workspace.getConfiguration();
    const originalTheme = config.get<string>('workbench.colorTheme');

    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);
    assert.strictEqual(before.themeAttribute, 'vscode');

    const targetTheme = originalTheme?.includes('Light') ? 'Default Dark Modern' : 'Default Light Modern';
    try {
      await config.update('workbench.colorTheme', targetTheme, vscode.ConfigurationTarget.Global);

      await waitFor(async () => {
        const s = await requestSnapshot(panel);
        return s.style.backgroundColor !== before.style.backgroundColor ? s : undefined;
      }, "the webview's background to change when VSCode's theme changes");
    } finally {
      await config.update('workbench.colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
    }
  });

  test('the stylesheet loads before the script, so there is no unstyled flash', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const html = panel.webview.html;

    const styleIndex = html.indexOf('rel="stylesheet"');
    const scriptIndex = html.indexOf('<script');
    assert.ok(styleIndex > -1 && scriptIndex > -1 && styleIndex < scriptIndex, "the stylesheet must load before the webview's script");
  });

  test('RISK-005: the theme travels in the initial HTML, it does not arrive later by message — no flash', async () => {
    await setTheme('dark');
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);

    assert.ok(panel.webview.html.includes('data-theme="dark"'), 'the initial HTML should already carry the resolved theme');
  });

  test('Focus mode reads effortlessly in both Light and Dark: the dimming is no longer the original ring one (0.35)', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 50);
    const light = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length > 0 ? s : undefined;
    }, 'the first paragraph to dim in Light');
    assert.notStrictEqual(parseFloat(light.dimOpacity), 0.35);

    await setTheme('dark');
    const dark = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'dark' ? s : undefined;
    }, 'the Chapter to switch to Dark');
    assert.notStrictEqual(parseFloat(dark.dimOpacity), 0.35);
    assert.notStrictEqual(dark.dimOpacity, light.dimOpacity, 'the dimming should be calibrated per theme, not be a single value');
  });

  test('an invalid texto.theme setting falls back to Light', async () => {
    // The configuration API does not validate against the enum declared in
    // package.json when written programmatically — only VSCode's settings
    // editor does — so this genuinely exercises readPreferences' resilience
    // against a hand-edited, invalid settings.json.
    await vscode.workspace.getConfiguration('texto').update('theme', 'sepia', vscode.ConfigurationTarget.Global);
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.themeAttribute, 'light');
  });

  test('BR-004: a Writing space still pinning the old Spanish value falls back to Light, not an error', async () => {
    await vscode.workspace.getConfiguration('texto').update('theme', 'claro', vscode.ConfigurationTarget.Global);
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.themeAttribute, 'light');
  });
});
