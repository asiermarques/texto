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

    const columnWidth = snapshot.contentBox.right - snapshot.contentBox.left;
    assert.ok(columnWidth > 0 && columnWidth < 1200, `the column is outside the reading measure range: ${columnWidth}px`);
  });

  test('increasing the text size grows the column in the same proportion', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);
    const fontSizeBefore = parseFloat(before.style.fontSize);
    const widthBefore = before.contentBox.right - before.contentBox.left;

    await vscode.commands.executeCommand('texto.increaseTextSize');
    await vscode.commands.executeCommand('texto.increaseTextSize');

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return parseFloat(s.style.fontSize) !== fontSizeBefore ? s : undefined;
    }, 'the font size to change');
    const fontSizeAfter = parseFloat(after.style.fontSize);
    const widthAfter = after.contentBox.right - after.contentBox.left;

    const fontRatio = fontSizeAfter / fontSizeBefore;
    const widthRatio = widthAfter / widthBefore;
    const gutterBefore = before.contentBox.left - before.scrollerBox.left;
    const gutterAfter = after.contentBox.left - after.scrollerBox.left;
    const available = after.scrollerBox.right - after.scrollerBox.left;

    /*
     * The column is measured, not read off the `max-width` declaration this
     * test used to trust: on a window too narrow for the bigger measure the
     * declared width and the painted one part ways, and it is the painted one
     * the Author reads. So the rule has two halves — and the F-004 bug (the
     * column *shrinking* as the text grew) fails both of them.
     */
    if (widthBefore * fontRatio <= available - 2 * gutterBefore) {
      assert.ok(
        Math.abs(fontRatio - widthRatio) < 0.01,
        `there was room for the bigger measure, so the column should have grown in the same proportion as the font: font x${fontRatio}, column x${widthRatio}`
      );
    } else {
      assert.ok(widthRatio > 1, `the column should still have grown towards the window's limit: column x${widthRatio}`);
      assert.ok(
        gutterAfter < gutterBefore,
        `with no room for the whole measure the column should take everything the window has: the gutter went from ${gutterBefore}px to ${gutterAfter}px`
      );
    }
  });

  test('the column does not overflow the window: it stays inside it, centred', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const { contentBox, scrollerBox } = snapshot;
    assert.ok(
      contentBox.left >= scrollerBox.left && contentBox.right <= scrollerBox.right,
      `the column (${contentBox.left}–${contentBox.right}) spills out of the window (${scrollerBox.left}–${scrollerBox.right})`
    );
    const leftGutter = contentBox.left - scrollerBox.left;
    const rightGutter = scrollerBox.right - contentBox.right;
    assert.ok(Math.abs(leftGutter - rightGutter) < 2, `the column is off centre: ${leftGutter}px of gutter on the left, ${rightGutter}px on the right`);
  });

  /*
   * The measure used to be a `max-width` on the column itself, which narrowed
   * the scroller along with it: the scrollbar came out glued to the right of
   * the prose, a rail down the middle of the page. The measure is now padding
   * inside a full-width scroller, so the bar sits where a reader expects it.
   */
  test('the scrollbar rides the edge of the window, not the edge of the text', async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.ok(
      snapshot.scrollerBox.right >= snapshot.viewportWidth - 2,
      `the scrolling box ends at ${snapshot.scrollerBox.right} in a ${snapshot.viewportWidth}px window, so its scrollbar is inset from the edge`
    );
    assert.ok(snapshot.scrollerBox.left <= 2, `the scrolling box starts at ${snapshot.scrollerBox.left}, not at the window's edge`);
  });
});
