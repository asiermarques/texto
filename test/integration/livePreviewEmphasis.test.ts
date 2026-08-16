import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  deleteBackward,
  moveCursor,
  openInWritingEditor,
  requestSnapshot,
  setCursor,
  waitFor,
  waitForText,
} from './support';

// US-006: emphasis hidden, revealed on the cursor's line.
//
// Emphasis reveals while the cursor is within the emphasized TEXT (between
// its markers) — not merely "somewhere on the physical line" — so that
// finishing a **marker** hides it immediately, and a single backspace right
// after it removes the whole hidden marker as one unit. See
// src/domain/livePreview.ts for the full rationale.

suite("US-006: emphasis hidden, revealed on the cursor's line", () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('bold is composed with the asterisks hidden when the cursor is not on it', async () => {
    fileUri = await createScratchFile('Un párrafo con **negrita** de verdad.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-strong') ? s : undefined;
    }, 'bold to be composed with the asterisks hidden');

    assert.ok(!snapshot.renderedText.includes('**'), `the asterisks should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('negrita'));
  });

  test('italic is composed with the markers hidden when the cursor is not on it', async () => {
    fileUri = await createScratchFile('Un *susurro* apenas audible.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-emphasis') ? s : undefined;
    }, 'italic to be composed with the markers hidden');

    assert.ok(!snapshot.renderedText.includes('*'), `the asterisks should not be visible: ${snapshot.renderedText}`);
  });

  test('moving the cursor inside the bold reveals the asterisks, and leaving hides them again', async () => {
    fileUri = await createScratchFile('Un párrafo con **negrita** de verdad.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 20); // inside "negrita" (content in [17,24))
    const onIt = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('**') ? s : undefined;
    }, 'the asterisks to reappear with the cursor inside the bold');
    assert.ok(onIt.renderedText.includes('**negrita**'));

    await setCursor(panel, 0); // outside the bold
    const off = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return !s.renderedText.includes('**') ? s : undefined;
    }, 'the asterisks to hide again on leaving');
    assert.ok(!off.renderedText.includes('**'));
  });

  test('the cursor does not get stuck inside a hidden bold marker when moving with the arrow keys', async () => {
    fileUri = await createScratchFile('Texto con **fuerte** aquí.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 9); // right before the opening marker, in [10,12)
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-strong') ? true : undefined), 'the bold to be hidden');

    await moveCursor(panel, 'right'); // normal step: 9 → 10 (marker edge, still hidden)
    const afterFirstStep = await requestSnapshot(panel);
    assert.strictEqual(afterFirstStep.selectionHead, 10);

    await moveCursor(panel, 'right'); // must jump the whole two-character hidden marker: 10 → 12
    const afterSecondStep = await requestSnapshot(panel);
    assert.strictEqual(afterSecondStep.selectionHead, 12, 'the cursor got stuck inside the hidden marker');
  });

  test('deleting backwards from the end of the bold removes the hidden marker as one unit', async () => {
    fileUri = await createScratchFile('Texto con **fuerte** aquí.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 20); // right after the closing marker "**", in [18,20)
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-strong') ? true : undefined), 'the bold to be hidden');

    await deleteBackward(panel);

    await waitForText(fileUri, 'Texto con **fuerte aquí.');
  });

  // Links moved into the Composed subset in requirement 006 — see
  // test/integration/livePreviewLinks.test.ts. Tables (NOGOAL-001 of 006)
  // stay outside it.
  test('a pasted table is shown as plain text and preserved on save', async () => {
    fileUri = await createScratchFile('| a | b |\n| --- | --- |\n| 1 | 2 |');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await requestSnapshot(panel);
    assert.ok(snapshot.renderedText.includes('| a | b |'));

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), '| a | b |\n| --- | --- |\n| 1 | 2 |');
  });
});
