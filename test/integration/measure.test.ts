import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-018: the measure grows with text size, expressed in em against the
// editor's own font-size (F-004) instead of the document root's rem.

async function setTextSize(value: number | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('textSize', value, vscode.ConfigurationTarget.Global);
}

suite('US-018: the measure stays with the text size', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await setTextSize(undefined);
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('at the factory size, the column keeps the bounded measure US-004 fixed', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const maxWidthPx = parseFloat(snapshot.style.rootMaxWidth);
    assert.ok(maxWidthPx > 0 && maxWidthPx < 1200, `max-width outside the reading measure range: ${snapshot.style.rootMaxWidth}`);
  });

  test('increasing the text size grows the column in the same proportion', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);
    const fontSizeBefore = parseFloat(before.style.fontSize);
    const widthBefore = parseFloat(before.style.rootMaxWidth);

    await vscode.commands.executeCommand('texto.increaseTextSize');
    await vscode.commands.executeCommand('texto.increaseTextSize');

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return parseFloat(s.style.fontSize) !== fontSizeBefore ? s : undefined;
    }, 'the font size to change');
    const fontSizeAfter = parseFloat(after.style.fontSize);
    const widthAfter = parseFloat(after.style.rootMaxWidth);

    const fontRatio = fontSizeAfter / fontSizeBefore;
    const widthRatio = widthAfter / widthBefore;
    assert.ok(Math.abs(fontRatio - widthRatio) < 0.01, `expected the column to grow in the same proportion as the font: font x${fontRatio}, column x${widthRatio}`);
  });

  test('the column does not overflow a narrow window: it still shrinks to fit', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.style.bodyJustifyContent, 'center');
    assert.notStrictEqual(snapshot.style.rootMaxWidth, 'none');
  });
});
