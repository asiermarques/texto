import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot } from './support';

// US-004: the editor's own typography and measure.

suite("US-004: the editor's own typography and measure", () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Un párrafo largo de prueba para comprobar la composición tipográfica.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
    await vscode.workspace.getConfiguration('editor').update('fontFamily', undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('editor').update('fontSize', undefined, vscode.ConfigurationTarget.Global);
  });

  test("the Chapter is composed with the editor's typography, not with VSCode's global font", async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.ok(snapshot.style.fontFamily.includes('Literata'), `expected Literata, got: ${snapshot.style.fontFamily}`);
    assert.ok(!snapshot.style.fontFamily.toLowerCase().includes('menlo'), "VSCode's default monospace font leaked into the composition");
  });

  test("changing editor.fontFamily or editor.fontSize in the settings does not affect the Chapter's composition", async () => {
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);

    const config = vscode.workspace.getConfiguration('editor');
    await config.update('fontFamily', 'Courier New', vscode.ConfigurationTarget.Global);
    await config.update('fontSize', 40, vscode.ConfigurationTarget.Global);

    // Give the webview a moment in case (incorrectly) it reacted to the setting.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = await requestSnapshot(panel);

    assert.strictEqual(after.style.fontFamily, before.style.fontFamily);
    assert.strictEqual(after.style.fontSize, before.style.fontSize);
  });

  test('the writing column does not fill the whole width: it has a bounded measure', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const columnWidth = snapshot.contentBox.right - snapshot.contentBox.left;
    const windowWidth = snapshot.scrollerBox.right - snapshot.scrollerBox.left;
    assert.ok(columnWidth < windowWidth, `the column fills the whole width: ${columnWidth}px of ${windowWidth}px`);
    assert.ok(columnWidth > 0 && columnWidth < 1200, `the column is outside the range expected of a reading measure: ${columnWidth}px`);
  });

  test('the column stays centred', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    const leftGutter = snapshot.contentBox.left - snapshot.scrollerBox.left;
    const rightGutter = snapshot.scrollerBox.right - snapshot.contentBox.right;
    assert.ok(Math.abs(leftGutter - rightGutter) < 2, `the column is off centre: ${leftGutter}px of gutter on the left, ${rightGutter}px on the right`);
  });
});
