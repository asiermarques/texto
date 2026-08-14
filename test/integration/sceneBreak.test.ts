import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, moveCursor, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-008: Scene break.

suite('US-008: scene break', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test("the horizontal rule is composed as a Scene break, not as markdown's characters", async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0); // in the first Scene, outside the break
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-scene-break') ? s : undefined;
    }, 'the Scene break to be composed');

    assert.ok(!snapshot.renderedText.includes('---'), `the dashes should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('Primera escena.'));
    assert.ok(snapshot.renderedText.includes('Segunda escena.'));
  });

  test("placing the cursor on the break's line reveals the original syntax, editable", async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 18); // on the "---" line
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('---') ? s : undefined;
    }, 'the dashes to reappear');

    assert.ok(snapshot.renderedText.includes('---'));
  });

  test('the cursor crosses the Scene break without getting stuck', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    // The break spans [17,20). Position 20 (right after it) does not "touch"
    // it, so it stays hidden and atomic there — unlike position 17 (its own
    // start), which already counts as being on its line.
    await setCursor(panel, 20);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-scene-break') ? true : undefined), 'the break to be hidden');

    await moveCursor(panel, 'left');

    const snapshot = await requestSnapshot(panel);
    // Without atomicRanges, a single step left would leave the cursor at 19,
    // inside the three-character hidden marker.
    assert.strictEqual(snapshot.selectionHead, 17, 'the cursor got stuck inside the hidden Scene break');
  });

  test('the file keeps the horizontal rule exactly as written, on save', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), 'Primera escena.\n\n---\n\nSegunda escena.');
  });
});
