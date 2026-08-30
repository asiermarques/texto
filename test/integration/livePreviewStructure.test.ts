import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-007: headings, blockquote and lists composed as prose.

suite('US-007: headings, blockquote and lists composed as prose', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('a heading is composed as a title, with the hash hidden', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 20); // in the paragraph, outside the heading
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-2') ? s : undefined;
    }, 'the heading to be composed');

    assert.ok(!snapshot.renderedText.includes('##'), `the hash should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('Un título'));
  });

  test("placing the cursor on the heading's line reveals the hash, editable", async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 5); // inside "## Un título"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('##') ? s : undefined;
    }, 'the hash to reappear');

    assert.ok(snapshot.renderedText.includes('## Un título'));
  });

  test('revealing the hash does not move the title — the marker hangs in the margin', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    // Composed, with the cursor well away from the heading's line.
    await setCursor(panel, 20);
    const composed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.liveClasses.includes('cm-live-heading-2') && !snapshot.renderedText.includes('##') ? snapshot : undefined;
    }, 'the heading to be composed');
    const composedTitle = composed.lineRects.find((line) => line.text.includes('Un título'));
    assert.ok(composedTitle && composedTitle.visualLines.length > 0, 'the title should be on the Writing surface');

    await setCursor(panel, 5);
    const revealed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.renderedText.includes('## Un título') ? snapshot : undefined;
    }, 'the hash to reappear');
    const revealedTitle = revealed.lineRects.find((line) => line.text.includes('Un título'));
    assert.ok(revealedTitle && revealedTitle.visualLines.length > 0, 'the title should still be on the Writing surface');

    // Its right edge, not its left: the hash hangs to the LEFT of the title,
    // so it is the left edge of the line's boxes once revealed, and the
    // title's own place is what the Author sees move. Let back into the
    // flow the hash pushed the whole line right by its own width — about
    // two characters — so the letter under the pointer was no longer the
    // letter clicked.
    assert.ok(
      Math.abs(revealedTitle!.visualLines[0].right - composedTitle!.visualLines[0].right) < 1,
      `the title should not move when the hash is revealed: ${composedTitle!.visualLines[0].right} -> ${revealedTitle!.visualLines[0].right}`
    );

    // And it really does hang, rather than being hidden a second way: the
    // line's boxes now reach further left than the title alone did, which is
    // the hash sitting in the margin where the Author can still see and edit
    // it.
    assert.ok(
      revealedTitle!.visualLines[0].left < composedTitle!.visualLines[0].left - 1,
      `the hash should hang to the left of the title: line starts at ${revealedTitle!.visualLines[0].left}, title at ${composedTitle!.visualLines[0].left}`
    );
  });

  test('a blockquote is composed distinctly from a normal paragraph, with the marker hidden', async () => {
    fileUri = await createScratchFile('> Una cita memorable.\n\nUn párrafo normal.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 30); // in the normal paragraph, outside the blockquote
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-blockquote') ? s : undefined;
    }, 'the blockquote to be composed');

    assert.ok(!snapshot.renderedText.includes('>'), `the marker should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('Una cita memorable.'));
  });

  test("every list item shows its composed bullet and not markdown's dash", async () => {
    fileUri = await createScratchFile('- primero\n- segundo\n- tercero\n\nUn párrafo aparte.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 35); // in the separate paragraph, off every list line
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-list-bullet') ? s : undefined;
    }, 'the list to be composed with bullets');

    assert.ok(!snapshot.renderedText.includes('- '), `the dash should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('primero'));
    assert.ok(snapshot.renderedText.includes('segundo'));
    assert.ok(snapshot.renderedText.includes('tercero'));
  });
});
