import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-014: air and typographic detail.

suite('US-014: air and typographic detail', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('there is more vertical space before a heading than between two consecutive paragraphs', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.\n\n## Un título\n\nTercer párrafo.');
    const panel = await openInWritingEditor(fileUri);
    // Live preview composes the heading after the first paint, so measure
    // only once the composition class it carries the air on is applied.
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-2') ? s : undefined;
    }, 'the heading to be composed');

    const lines = snapshot.lineRects;
    const firstParagraph = lines.find((l) => l.text.includes('Primer párrafo'));
    const secondParagraph = lines.find((l) => l.text.includes('Segundo párrafo'));
    const heading = lines.find((l) => l.text.includes('Un título'));
    assert.ok(firstParagraph && secondParagraph && heading, 'the expected lines were not found in the snapshot');

    const paragraphToParagraphGap = secondParagraph!.top - (firstParagraph!.top + firstParagraph!.height);
    // The heading's air is `padding-top`, which lives *inside* its rectangle
    // (styles.css explains why it is not a margin: CodeMirror's height map
    // only counts the element's box). So the visible space before the
    // heading runs up to where its text starts, not up to `top`.
    const headingTextTop = heading!.top + heading!.paddingTop;
    const paragraphToHeadingGap = headingTextTop - (secondParagraph!.top + secondParagraph!.height);
    const bodyLineHeight = parseFloat(snapshot.style.lineHeight);

    assert.ok(
      paragraphToHeadingGap > paragraphToParagraphGap,
      `expected more air before the heading (${paragraphToHeadingGap}px) than between paragraphs (${paragraphToParagraphGap}px)`
    );
    assert.ok(
      paragraphToHeadingGap > bodyLineHeight,
      `the space before the heading (${paragraphToHeadingGap}px) does not exceed the body's leading (${bodyLineHeight}px)`
    );
  });

  test("the heading's margin does not change when the cursor enters its line (depends on US-013)", async () => {
    fileUri = await createScratchFile('Un párrafo.\n\n## Un título\n\nOtro párrafo.');
    const panel = await openInWritingEditor(fileUri);

    // Same as above: compare against the *composed* heading, or this
    // measures the plain line and passes or fails on timing alone.
    const before = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-2') ? s : undefined;
    }, 'the heading to be composed');
    const headingBefore = before.lineRects.find((l) => l.text.includes('título'));
    assert.ok(headingBefore, "the heading's line was not found");

    await setCursor(panel, 15); // inside "## Un título"
    const after = await requestSnapshot(panel);
    const headingAfter = after.lineRects.find((l) => l.text.includes('##'));
    assert.ok(headingAfter, "the heading's line was not found with the marker revealed");

    assert.strictEqual(headingAfter!.top, headingBefore!.top, 'the heading shifted when the cursor entered its line');
  });

  /*
   * The regression this guards: the cushion below and the air above used to
   * be padding on #editor-root, a flex item stretched to a 100%-tall body,
   * so they came out of the editor's own box instead of cushioning it —
   * `.cm-editor { height: 100% }` measured barely half the window, and the
   * Chapter ended mid-screen with a scrollbar hanging beside the text. The
   * air now lives on `.cm-content`, inside the scroller, where it scrolls
   * with the prose.
   */
  test('the Writing surface fills the window, top to bottom', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);
    const { writingSurface } = await requestSnapshot(panel);

    assert.ok(
      writingSurface.visibleHeight >= writingSurface.viewportHeight - 2,
      `the Writing surface is ${writingSurface.visibleHeight}px tall in a ${writingSurface.viewportHeight}px window`
    );
  });

  test('the writing column has a generous bottom cushion, about half a screen', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const paddingBottomPx = parseFloat(snapshot.style.contentPaddingBottom);
    assert.ok(paddingBottomPx > 150, `the bottom cushion is too small: ${snapshot.style.contentPaddingBottom}`);
  });

  test("the composition uses the font's ligatures and figures, smoothing and text-rendering", async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.notStrictEqual(snapshot.style.fontVariantLigatures, 'none');
    assert.notStrictEqual(snapshot.style.fontVariantNumeric, 'normal');
    assert.strictEqual(snapshot.style.textRendering, 'optimizelegibility');
    assert.strictEqual(snapshot.style.webkitFontSmoothing, 'antialiased');
  });

  test('it still keeps the family, size and measure US-004 fixes', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.ok(snapshot.style.fontFamily.includes('Literata'));
    const columnWidth = snapshot.contentBox.right - snapshot.contentBox.left;
    assert.ok(columnWidth > 0 && columnWidth < 1200, `the column is outside the reading measure range: ${columnWidth}px`);
  });
});
