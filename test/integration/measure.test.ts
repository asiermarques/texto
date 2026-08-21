import * as assert from 'assert';
import * as vscode from 'vscode';
import { TEXT_SIZE_MAX, TEXT_SIZE_MIN, TEXT_SIZE_STEP } from '../../src/domain/preferences';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-018: the measure grows with text size, expressed in em against the
// editor's own font-size (F-004) instead of the document root's rem.

/*
 * The measure as src/webview/styles.css declares it:
 *
 *   padding: 4rem max(1.5rem, (100% - 38em) / 2) 50vh;
 *
 * 38em of the editor's OWN font-size —that em is the whole of F-004, which
 * resolved it against the document root's rem instead— and a gutter that
 * never goes below 1.5rem of that root, whose font-size the webview leaves
 * at the browser's 16px. Restated here because the window decides which of
 * the two the Author actually sees, and the test has to know which.
 */
const MEASURE_EM = 38;
const MIN_GUTTER_PX = 24;

/** The painted column at `fontSize`: the measure, or what the window allows. */
function paintedColumn(fontSize: number, available: number): number {
  return Math.min(MEASURE_EM * fontSize, available - 2 * MIN_GUTTER_PX);
}

async function setTextSize(value: number | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('textSize', value, vscode.ConfigurationTarget.Global);
}

suite('US-018: the measure stays with the text size', () => {
  let fileUri: vscode.Uri;

  /*
   * The measure can only be seen growing in a window with room for it, and
   * the runner's window is not a desktop one: with the side bar open a third
   * of it is gone before the Chapter starts. Closing it gives the Writing
   * editor the whole window —what an Author writing in it would do anyway—
   * and keeps the assertions below on the interesting side of the clamp.
   */
  suiteSetup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
  });

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
    const opened = await requestSnapshot(panel);
    const available = opened.scrollerBox.right - opened.scrollerBox.left;

    /*
     * Which two sizes to compare is not a free choice. The measure follows
     * the text only while the window can hold it; past that the column is
     * against the 1.5rem gutter and no text size moves it. This test used to
     * step up from the factory size and demand growth, which held on a
     * desktop window and failed on CI's narrower one, where the column is
     * already at that limit before the first keystroke: the same painted
     * column at both sizes, x1, and nothing wrong with the editor.
     *
     * So the pair comes from the window actually measured: the largest step
     * whose bigger half still fits, which is where the measure is visible as
     * a measure rather than as the window's edge.
     */
    const sizes: number[] = [];
    for (let size = TEXT_SIZE_MIN; size <= TEXT_SIZE_MAX; size += TEXT_SIZE_STEP) {
      sizes.push(size);
    }
    const fits = (size: number): boolean => MEASURE_EM * size + 2 * MIN_GUTTER_PX <= available;
    const grown = [...sizes].reverse().find((size) => size > TEXT_SIZE_MIN && fits(size));
    const from = grown === undefined ? TEXT_SIZE_MIN : grown - TEXT_SIZE_STEP;

    await setTextSize(from);
    const before = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return parseFloat(s.style.fontSize) === from ? s : undefined;
    }, `the text size to settle at ${from}px`);
    const widthBefore = before.contentBox.right - before.contentBox.left;

    await vscode.commands.executeCommand('texto.increaseTextSize');

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return parseFloat(s.style.fontSize) !== from ? s : undefined;
    }, 'the font size to change');
    const fontSizeAfter = parseFloat(after.style.fontSize);
    const widthAfter = after.contentBox.right - after.contentBox.left;
    const gutterAfter = after.contentBox.left - after.scrollerBox.left;

    /*
     * True whatever the window: the F-004 bug —a measure anchored to the
     * root's rem, so the column narrowed from ~68 to ~45 characters as the
     * text grew— shows up here even where there is no room to grow.
     */
    assert.ok(
      widthAfter >= widthBefore - 0.5,
      `the column shrank as the text grew: ${widthBefore}px at ${from}px of text, ${widthAfter}px at ${fontSizeAfter}px`
    );

    if (grown === undefined) {
      // A window too narrow for even the smallest measure: the column can
      // only be the whole window less its two minimum gutters.
      assert.ok(
        Math.abs(widthAfter - (available - 2 * MIN_GUTTER_PX)) < 1 && Math.abs(gutterAfter - MIN_GUTTER_PX) < 1,
        `in a ${available}px window the column should fill it but for a ${MIN_GUTTER_PX}px gutter: ${widthAfter}px with ${gutterAfter}px of gutter`
      );
      return;
    }

    const fontRatio = fontSizeAfter / from;
    const widthRatio = widthAfter / widthBefore;
    assert.ok(
      Math.abs(fontRatio - widthRatio) < 0.01,
      `there was room for the bigger measure, so the column should have grown in the same proportion as the font: font x${fontRatio}, column x${widthRatio}`
    );
    // The proportion alone would also hold for a column that grew from the
    // wrong basis; these pin it to the editor's own em, which is the story.
    assert.ok(
      Math.abs(widthBefore - paintedColumn(from, available)) < 1 && Math.abs(widthAfter - paintedColumn(fontSizeAfter, available)) < 1,
      `the column is not ${MEASURE_EM}em of the text it holds: ${widthBefore}px at ${from}px and ${widthAfter}px at ${fontSizeAfter}px, in a ${available}px window`
    );
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
