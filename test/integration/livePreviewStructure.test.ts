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
