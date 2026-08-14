import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-015: the Writing editor's preferences as VSCode settings.
//
// toggleFocusMode.test.ts already covers the palette command (which goes
// through WritingEditorProvider.setFocusModeEnabled). What this suite adds is
// the other route of change US-015 introduces: writing the setting directly
// (as if the Author edited settings.json), without going through any command.

suite('US-015: changing texto.focusMode directly propagates to the open panels', () => {
  let fileUri: vscode.Uri;
  let secondFileUri: vscode.Uri | undefined;

  teardown(async () => {
    const api = await getExtensionApi();
    await api.setFocusModeEnabled(true);
    await closeAllEditors();
    await deleteScratchFile(fileUri);
    if (secondFileUri) {
      await deleteScratchFile(secondFileUri);
      secondFileUri = undefined;
    }
  });

  test('editing the setting (without the command) shows up in the open Chapter, without reloading', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 50);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'it to start dimmed');

    await vscode.workspace.getConfiguration('texto').update('focusMode', false, vscode.ConfigurationTarget.Global);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length === 0 ? s : undefined;
    }, 'the setting to show up without reloading the webview');
    if (snapshot.dimmedText.length !== 0) {
      throw new Error('the Chapter should have gone to full opacity');
    }
  });

  test('editing the setting with two Chapters open at once shows the change in both', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.');
    secondFileUri = await createScratchFile('Otro párrafo.\n\nY uno más.');
    const panel = await openInWritingEditor(fileUri);
    const secondPanel = await openInWritingEditor(secondFileUri);
    await setCursor(panel, 5);
    await setCursor(secondPanel, 5);
    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length > 0 ? true : undefined), 'the first one to start dimmed');
    await waitFor(async () => ((await requestSnapshot(secondPanel)).dimmedText.length > 0 ? true : undefined), 'the second one to start dimmed');

    await vscode.workspace.getConfiguration('texto').update('focusMode', false, vscode.ConfigurationTarget.Global);

    await waitFor(async () => ((await requestSnapshot(panel)).dimmedText.length === 0 ? true : undefined), 'the first one to reflect the setting');
    await waitFor(async () => ((await requestSnapshot(secondPanel)).dimmedText.length === 0 ? true : undefined), 'the second one to reflect the setting');
  });
});
