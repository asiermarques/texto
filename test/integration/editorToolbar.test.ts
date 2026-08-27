import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-021 (redesigned per Author feedback): every setting is its own status
// bar button next to the word count, not a QuickPick menu entry. Setting
// keys and enum values renamed to English in US-002 (003). US-005 (003):
// button text and tooltips now resolve through vscode.l10n.t — this test
// host has no Spanish language pack (RISK-002), so it reads the in-source
// English strings, same as any VSCode not running in Spanish.

async function resetSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration('texto');
  await config.update('theme', undefined, vscode.ConfigurationTarget.Global);
  await config.update('alignment', undefined, vscode.ConfigurationTarget.Global);
  await config.update('textSize', undefined, vscode.ConfigurationTarget.Global);
  await config.update('focusMode', undefined, vscode.ConfigurationTarget.Global);
}

suite('US-021: the toolbar buttons', () => {
  let fileUri: vscode.Uri;
  let otherFileUri: vscode.Uri | undefined;

  teardown(async () => {
    await resetSettings();
    await closeAllEditors();
    await deleteScratchFile(fileUri);
    if (otherFileUri) {
      await deleteScratchFile(otherFileUri);
      otherFileUri = undefined;
    }
  });

  test('every button appears with its current value marked, text in English', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const theme = await waitFor(() => api.getToolbarButtonState('theme-light'), 'the Theme Light button to appear');
    assert.ok(theme.text.includes('$(check)'), `expected Light marked active, got "${theme.text}"`);
    assert.ok(theme.text.includes('Theme Light'));
    assert.ok(!api.getToolbarButtonState('theme-dark')!.text.includes('$(check)'));

    assert.strictEqual(api.getToolbarButtonState('size-value')?.text, '18px');
    const left = api.getToolbarButtonState('align-left')!;
    assert.ok(left.text.includes('$(check)'));
    assert.ok(left.text.includes('Left'));
    assert.ok(api.getToolbarButtonState('focus-mode')!.text.includes('$(eye)'));
    assert.ok(api.getToolbarButtonState('focus-mode')!.text.includes('Focus mode'));
    assert.ok(api.getToolbarButtonState('raw-markdown')!.text.includes('$(book)'));
    assert.ok(api.getToolbarButtonState('raw-markdown')!.text.includes('Raw markdown'));
  });

  test('clicking a Theme button changes the palette and marks it active', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('theme-light'), 'the toolbar to appear');

    await vscode.commands.executeCommand('texto.setTheme', 'dark');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.themeAttribute === 'dark' ? s : undefined;
    }, 'the Chapter to switch to Dark');
    assert.strictEqual(snapshot.themeAttribute, 'dark');
    await waitFor(() => (api.getToolbarButtonState('theme-dark')!.text.includes('$(check)') ? true : undefined), 'Dark to be marked active');
    assert.ok(!api.getToolbarButtonState('theme-light')!.text.includes('$(check)'));
  });

  test('clicking Right right-aligns the Chapter and marks it active', async () => {
    fileUri = await createScratchFile('Un párrafo largo de varias palabras.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('align-left'), 'the toolbar to appear');

    await vscode.commands.executeCommand('texto.setAlignment', 'right');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'right' ? s : undefined;
    }, 'the Chapter to right-align');
    assert.strictEqual(snapshot.style.textAlign, 'right');
    await waitFor(() => (api.getToolbarButtonState('align-right')!.text.includes('$(check)') ? true : undefined), 'Right to be marked active');
  });

  test('clicking the + button grows the text and the size button reflects it', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    const before = await requestSnapshot(panel);
    await waitFor(() => api.getToolbarButtonState('size-value'), 'the toolbar to appear');

    await vscode.commands.executeCommand('texto.increaseTextSize');

    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize !== before.style.fontSize ? s : undefined;
    }, 'the text to grow');
    assert.strictEqual(api.getToolbarButtonState('size-value')?.text, '20px');
  });

  test('clicking the Focus mode button toggles it and flips the icon', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('focus-mode'), 'the toolbar to appear');

    await vscode.commands.executeCommand('texto.toggleFocusMode');

    await waitFor(
      () => (api.getToolbarButtonState('focus-mode')!.text.includes('$(eye-closed)') ? true : undefined),
      'the icon to flip to eye-closed'
    );
    assert.ok(api.getToolbarButtonState('focus-mode')!.tooltip.includes('off'));
    await api.setFocusModeEnabled(true); // restore, since it is a global preference
  });

  test('clicking the Raw markdown button toggles it and flips the icon', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => api.getToolbarButtonState('raw-markdown'), 'the toolbar to appear');

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');

    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.length === 0 ? s : undefined;
    }, 'the raw view to activate');
    assert.ok(api.getToolbarButtonState('raw-markdown')!.text.includes('$(code)'));
  });

  test('the version button shows the version the manifest declares', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();

    const button = await waitFor(() => api.getToolbarButtonState('version'), 'the version button to appear');
    const declared = (vscode.extensions.getExtension('asiermarques.texto')!.packageJSON as { version: string }).version;
    assert.strictEqual(button.text, `$(info) Texto ${declared}`);
    assert.strictEqual(button.tooltip, `Texto version ${declared}`);
  });

  test('RISK-007: leaving the Writing editor hides the toolbar, returning to it shows it again', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    await openInWritingEditor(fileUri);
    const api = await getExtensionApi();
    await waitFor(() => (api.getWordCountStatusBarState().visible ? true : undefined), 'the word count (and toolbar) to appear');

    otherFileUri = await createScratchFile('plain text, not a Chapter');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(otherFileUri));

    await waitFor(() => (api.getWordCountStatusBarState().visible ? undefined : true), 'the toolbar to hide');

    await openInWritingEditor(fileUri);
    await waitFor(() => (api.getWordCountStatusBarState().visible ? true : undefined), 'the toolbar to reappear');
    assert.strictEqual(api.getToolbarButtonState('size-value')?.text, '18px');
  });
});
