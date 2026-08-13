import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInProseEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-014: air and typographic detail.

suite('US-014: air and typographic detail', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('there is more vertical space before a heading than between two consecutive paragraphs', async () => {
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo.\n\n## Un título\n\nTercer párrafo.');
    const panel = await openInProseEditor(fileUri);
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
    const panel = await openInProseEditor(fileUri);

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

  test('the writing column has a generous bottom cushion, about half a screen', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInProseEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const paddingBottomPx = parseFloat(snapshot.style.rootPaddingBottom);
    assert.ok(paddingBottomPx > 150, `the bottom cushion is too small: ${snapshot.style.rootPaddingBottom}`);
  });

  test("the composition uses the font's ligatures and figures, smoothing and text-rendering", async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInProseEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.notStrictEqual(snapshot.style.fontVariantLigatures, 'none');
    assert.notStrictEqual(snapshot.style.fontVariantNumeric, 'normal');
    assert.strictEqual(snapshot.style.textRendering, 'optimizelegibility');
    assert.strictEqual(snapshot.style.webkitFontSmoothing, 'antialiased');
  });

  test('it still keeps the family, size and measure US-004 fixes', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInProseEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.ok(snapshot.style.fontFamily.includes('Literata'));
    assert.notStrictEqual(snapshot.style.rootMaxWidth, 'none');
  });
});
