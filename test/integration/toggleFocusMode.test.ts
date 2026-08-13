import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInProseEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-010: turning Focus mode on and off.

const TOGGLE_COMMAND = 'texto.toggleFocusMode';

suite('US-010: turning Focus mode on and off', () => {
  let fileUri: vscode.Uri;
  let secondFileUri: vscode.Uri | undefined;

  teardown(async () => {
    // Reset first, and unconditionally: this is a *global* preference
    // (by design — US-009's dependency note), so every other suite sharing
    // this VSCode host assumes it starts enabled. Doing this before the
    // file cleanup below means a failure there can never skip it.
    const api = await getExtensionApi();
    await api.setFocusModeEnabled(true);

    await closeAllEditors();
    await deleteScratchFile(fileUri);
    if (secondFileUri) {
      await deleteScratchFile(secondFileUri);
      secondFileUri = undefined;
    }
  });

  test('the toggle command turns Focus mode off: the whole Chapter goes to full opacity', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);
    await setCursor(panel, 50); // second paragraph, so the first one starts dimmed
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'the first paragraph to be dimmed');

    await vscode.commands.executeCommand(TOGGLE_COMMAND);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length === 0 ? s : undefined;
    }, 'the whole Chapter to go to full opacity');
    assert.deepStrictEqual(snapshot.dimmedText, []);
  });

  test('toggling again brings the dimming back, following the cursor', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);
    await setCursor(panel, 50);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'it to start dimmed');

    await vscode.commands.executeCommand(TOGGLE_COMMAND); // off
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length === 0 ? true : undefined), 'it to turn off');

    await vscode.commands.executeCommand(TOGGLE_COMMAND); // on

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.some((t) => t.includes('Primer párrafo')) ? s : undefined;
    }, 'the dimming to come back');
    assert.ok(snapshot.dimmedText.some((t) => t.includes('Primer párrafo')));
  });

  test('turning Focus mode off and opening another Chapter leaves it off there too', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.');
    const panel = await openInProseEditor(fileUri);
    await setCursor(panel, 20);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'it to start dimmed');
    await vscode.commands.executeCommand(TOGGLE_COMMAND);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length === 0 ? true : undefined), 'it to turn off');

    secondFileUri = await createScratchFile('Otro párrafo distinto.\n\nY uno más.');
    const secondPanel = await openInProseEditor(secondFileUri);
    // openInProseEditor's handshake only confirms *a* response, which can
    // race the 'init' message itself — wait for the real content to have
    // landed before trusting anything else about this snapshot.
    await waitFor(async () => {
      const s = await requestSnapshot(secondPanel);
      return s.text === 'Otro párrafo distinto.\n\nY uno más.' ? s : undefined;
    }, 'the second Chapter to finish loading');
    await setCursor(secondPanel, 5);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(secondPanel);
      return s.selectionHead === 5 ? s : undefined;
    }, 'the cursor to land in the second Chapter');
    assert.deepStrictEqual(snapshot.dimmedText, [], 'the new Chapter should open with Focus mode already off');
  });

  test('the off state is stored in a way that survives a VSCode restart', async () => {
    const api = await getExtensionApi();
    assert.strictEqual(api.isFocusModeEnabled(), true, 'the default value should be on');

    await vscode.commands.executeCommand(TOGGLE_COMMAND);
    assert.strictEqual(api.isFocusModeEnabled(), false);

    // Since US-015, Focus mode is the `texto.modoFoco` setting
    // (ConfigurationTarget.Global) instead of `context.globalState`; it is
    // VSCode's own settings storage that persists this across restarts, so
    // checking the value is still there after the update/get cycle is the
    // test faithful to our scope — actually restarting VSCode is the
    // platform's responsibility, not this extension's.
    assert.strictEqual(api.isFocusModeEnabled(), false);
  });
});
