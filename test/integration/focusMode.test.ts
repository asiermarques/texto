import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInProseEditor, requestSnapshot, setCursor, setSelection, waitFor } from './support';

// US-009: dimming the text that does not hold the cursor.

suite('US-009: dimming the text that does not hold the cursor', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('the paragraph without the cursor is dimmed and the one holding it stays at full opacity', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);

    await setCursor(panel, 50); // inside the second paragraph
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.some((t) => t.includes('Primer párrafo')) ? s : undefined;
    }, 'the first paragraph to dim');

    assert.ok(snapshot.dimmedText.some((t) => t.includes('Primer párrafo')));
    assert.ok(!snapshot.dimmedText.some((t) => t.includes('Segundo párrafo')), 'the paragraph holding the cursor should not be dimmed');
  });

  test('the focus moves to the other paragraph when the cursor moves', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);

    await setCursor(panel, 10); // inside the first paragraph
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.some((t) => t.includes('Segundo párrafo')) ? s : undefined;
    }, 'the second paragraph to dim');

    assert.ok(!snapshot.dimmedText.some((t) => t.includes('Primer párrafo')), 'the paragraph holding the cursor should not be dimmed');
  });

  test('a single paragraph is never dimmed', async () => {
    fileUri = await createScratchFile('Un capítulo con un único párrafo, sin más.');
    const panel = await openInProseEditor(fileUri);

    const snapshot = await requestSnapshot(panel);
    assert.deepStrictEqual(snapshot.dimmedText, []);
  });

  test('selecting text spanning two paragraphs leaves both at full opacity', async () => {
    fileUri = await createScratchFile('Primer párrafo con varias palabras.\n\nSegundo párrafo también con texto.');
    const panel = await openInProseEditor(fileUri);

    // Selection from inside the first paragraph to inside the second one.
    await setSelection(panel, 10, 50);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length === 0 ? s : undefined;
    }, 'no paragraph to stay dimmed while the selection is active');

    assert.deepStrictEqual(snapshot.dimmedText, []);
  });
});
