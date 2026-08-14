import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-017: text size.

const INCREASE = 'texto.increaseTextSize';
const DECREASE = 'texto.decreaseTextSize';
const RESET = 'texto.resetTextSize';

async function setTextSize(value: number | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('textSize', value, vscode.ConfigurationTarget.Global);
}

suite('US-017: text size', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await setTextSize(undefined); // back to the factory value
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('the increase command grows the body of the Chapter without reloading', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text === 'Un párrafo de prueba.' ? s : undefined;
    }, 'the Chapter to finish loading');

    await vscode.commands.executeCommand(INCREASE);

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize !== before.style.fontSize ? s : undefined;
    }, 'the body to grow');
    assert.ok(parseFloat(after.style.fontSize) > parseFloat(before.style.fontSize));
    assert.strictEqual(after.text, before.text, 'the document should not have reloaded');
  });

  test('reducing repeatedly stops at the minimum and the editor stays usable', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);

    for (let i = 0; i < 15; i += 1) {
      await vscode.commands.executeCommand(DECREASE);
    }
    const first = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize;
    }, 'a stable font size to read');

    await vscode.commands.executeCommand(DECREASE);
    const second = await requestSnapshot(panel);

    assert.strictEqual(second.style.fontSize, first, 'the size should not keep shrinking past the minimum');
  });

  test('a text size different from the factory one survives closing and reopening the Chapter', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    let panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);

    await vscode.commands.executeCommand(INCREASE);
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize !== before.style.fontSize ? s : undefined;
    }, 'the size to change');

    await closeAllEditors();
    panel = await openInWritingEditor(fileUri);
    const reopened = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text === 'Un párrafo de prueba.' ? s : undefined;
    }, 'the Chapter to finish reloading');

    assert.notStrictEqual(reopened.style.fontSize, before.style.fontSize);
  });

  test('the reset command returns to the factory size', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const factory = await requestSnapshot(panel);

    await vscode.commands.executeCommand(INCREASE);
    await vscode.commands.executeCommand(INCREASE);
    await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize !== factory.style.fontSize ? s : undefined;
    }, 'the size to grow');

    await vscode.commands.executeCommand(RESET);

    const reset = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize === factory.style.fontSize ? s : undefined;
    }, 'the size to return to the factory value');
    assert.strictEqual(reset.style.fontSize, factory.style.fontSize);
  });

  test('the keymap shortcut grows the Chapter, not VSCode itself', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);

    await panel.webview.postMessage({ __test: true, type: 'triggerTextSizeShortcut', direction: 'increase' });

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.fontSize !== before.style.fontSize ? s : undefined;
    }, 'the shortcut to grow the Chapter');
    assert.ok(parseFloat(after.style.fontSize) > parseFloat(before.style.fontSize));
  });
});
