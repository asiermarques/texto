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

  test('the cursor crosses the Scene break without ever resting inside hidden characters', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    // The break spans [17,20), the whole of its own line. Position 21 (the
    // blank line under it) is off that line, so there the break is composed
    // and its dashes hidden.
    await setCursor(panel, 21);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-scene-break') ? true : undefined), 'the break to be hidden');

    await moveCursor(panel, 'left');

    // One step left reaches the end of the break's own line — which IS on
    // that line, so the dashes come back with the cursor: it lands on
    // characters it can see and delete, never inside invisible ones. The
    // atomic skip that keeps a *mid-line* hidden marker (a `**` pair, a
    // Link's target) from swallowing the cursor is measured in
    // livePreviewEmphasis; a marker that is a whole line has both its edges
    // on that line, so reaching either one reveals it.
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('---') ? s : undefined;
    }, 'the dashes to come back as the cursor reaches the break');
    assert.strictEqual(snapshot.selectionHead, 20, 'a single step left should reach the break, not jump over it');
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
