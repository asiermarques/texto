import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInProseEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-016: Claro and Oscuro, the editor's own themes.
//
// US-005 asserted the editor always follows VSCode's theme (OQ-002). This
// plan reverts that: Claro is the default (DEC-005), independent of VSCode's
// theme, with Oscuro and "vscode" (the old behaviour) as the other two
// values of `texto.tema`. See ARCHITECTURE.md, "Theme follows VSCode".

async function setTheme(value: 'claro' | 'oscuro' | 'vscode' | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('tema', value, vscode.ConfigurationTarget.Global);
}

suite('US-016: the Prose editor theme', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await setTheme(undefined); // back to the default value (claro)
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('without touching the setting, and with VSCode on a dark theme, the Chapter is composed in Claro', async function () {
    this.timeout(15000);
    const config = vscode.workspace.getConfiguration();
    const originalWorkbenchTheme = config.get<string>('workbench.colorTheme');
    await config.update('workbench.colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);

    try {
      fileUri = await createScratchFile('Un párrafo de prueba.');
      const panel = await openInProseEditor(fileUri);
      const snapshot = await requestSnapshot(panel);

      assert.strictEqual(snapshot.themeAttribute, 'claro');
    } finally {
      await config.update('workbench.colorTheme', originalWorkbenchTheme, vscode.ConfigurationTarget.Global);
    }
  });

  test('the background and colour of Claro are neither pure white nor pure black (paper, not screen)', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.notStrictEqual(snapshot.style.backgroundColor, 'rgb(255, 255, 255)');
    assert.notStrictEqual(snapshot.style.color, 'rgb(0, 0, 0)');
  });

  test('changing the setting to Oscuro changes the palette without reloading the open Chapter', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);
    const before = await requestSnapshot(panel);
    assert.strictEqual(before.themeAttribute, 'claro');

    await setTheme('oscuro');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'oscuro' ? s : undefined;
    }, 'the Chapter to switch to Oscuro');
    assert.notStrictEqual(snapshot.style.backgroundColor, before.style.backgroundColor);
  });

  test('with the setting on "vscode", the Chapter follows VSCode\'s active theme, as before this story', async function () {
    this.timeout(15000);
    await setTheme('vscode');
    const config = vscode.workspace.getConfiguration();
    const originalTheme = config.get<string>('workbench.colorTheme');

    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);
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
    const panel = await openInProseEditor(fileUri);
    const html = panel.webview.html;

    const styleIndex = html.indexOf('rel="stylesheet"');
    const scriptIndex = html.indexOf('<script');
    assert.ok(styleIndex > -1 && scriptIndex > -1 && styleIndex < scriptIndex, "the stylesheet must load before the webview's script");
  });

  test('RISK-005: the theme travels in the initial HTML, it does not arrive later by message — no flash', async () => {
    await setTheme('oscuro');
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);

    assert.ok(panel.webview.html.includes('data-theme="oscuro"'), 'the initial HTML should already carry the resolved theme');
  });

  test('Focus mode reads effortlessly in both Claro and Oscuro: the dimming is no longer the original ring one (0.35)', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);
    await setCursor(panel, 50);
    const claro = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length > 0 ? s : undefined;
    }, 'the first paragraph to dim in Claro');
    assert.notStrictEqual(parseFloat(claro.dimOpacity), 0.35);

    await setTheme('oscuro');
    const oscuro = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'oscuro' ? s : undefined;
    }, 'the Chapter to switch to Oscuro');
    assert.notStrictEqual(parseFloat(oscuro.dimOpacity), 0.35);
    assert.notStrictEqual(oscuro.dimOpacity, claro.dimOpacity, 'the dimming should be calibrated per theme, not be a single value');
  });

  test('an invalid texto.tema setting falls back to Claro', async () => {
    // The configuration API does not validate against the enum declared in
    // package.json when written programmatically — only VSCode's settings
    // editor does — so this genuinely exercises readPreferences' resilience
    // against a hand-edited, invalid settings.json.
    await vscode.workspace.getConfiguration('texto').update('tema', 'sepia', vscode.ConfigurationTarget.Global);
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInProseEditor(fileUri);

    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.themeAttribute, 'claro');
  });
});
