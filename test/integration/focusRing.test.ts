import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-012: no focus ring on the Writing surface.

suite('US-012: no focus ring on the Writing surface', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('neither the editor root nor the focused node draws a focus ring', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    // `openInWritingEditor` only waits for the webview's script to answer
    // its handshake — real window/DOM focus is a separate, genuinely async
    // step (OS-level window activation, then DOM-level) that can lag well
    // behind it under load, e.g. several test hosts launched back to back.
    // Poll instead of asserting on a single snapshot taken the instant the
    // panel opens, with a longer timeout than the suite's default: window
    // activation is slower and less deterministic than any in-webview state
    // change every other `waitFor` in this suite polls for.
    const snapshot = await waitFor(
      async () => {
        const s = await requestSnapshot(panel);
        return s.hasFocus ? s : undefined;
      },
      'the editor to hold focus after opening',
      15000
    );

    assert.ok(
      snapshot.focusRing.editorOutlineStyle === 'none' || snapshot.focusRing.editorOutlineWidth === '0px',
      `the editor root draws a focus ring: ${snapshot.focusRing.editorOutlineStyle} ${snapshot.focusRing.editorOutlineWidth}`
    );
    assert.ok(
      snapshot.focusRing.focusedOutlineStyle === 'none' || snapshot.focusRing.focusedOutlineWidth === '0px',
      `the focused node draws a focus ring: ${snapshot.focusRing.focusedOutlineStyle} ${snapshot.focusRing.focusedOutlineWidth}`
    );
  });

  test('a list with several items leaves no stray boxes around the bullets', async () => {
    fileUri = await createScratchFile('- primero\n- segundo\n- tercero');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.focusRing.focusedOutlineStyle, 'none');
  });

  test('losing focus does not change the look: still no ring', async () => {
    fileUri = await createScratchFile('Un párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    // Move the focus out of the webview, to the command palette, and close
    // it — inside the test host that is the reliable way to blur the panel
    // without depending on a second real editor.
    await vscode.commands.executeCommand('workbench.action.quickOpen');
    await vscode.commands.executeCommand('workbench.action.closeQuickOpen');

    const snapshot = await requestSnapshot(panel);
    assert.ok(
      snapshot.focusRing.editorOutlineStyle === 'none' || snapshot.focusRing.editorOutlineWidth === '0px',
      `without focus, the editor root draws a ring: ${snapshot.focusRing.editorOutlineStyle} ${snapshot.focusRing.editorOutlineWidth}`
    );
  });
});
