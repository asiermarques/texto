import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, getExtensionApi, openInWritingEditor, requestSnapshot } from './support';

// US-001: opening a Chapter in the Writing editor.

suite('US-001: opening a Chapter in the Writing editor', () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Un párrafo de prueba.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('opening with "Reopen Editor With…" shows the Chapter\'s content in the webview', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.text, 'Un párrafo de prueba.');
  });

  test('opening a markdown file without asking for the Writing editor uses the normal code editor', async () => {
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);

    const api = await getExtensionApi();
    assert.strictEqual(api.panelFor(fileUri), undefined);
    assert.ok(vscode.window.activeTextEditor, 'a normal text editor was expected to be active');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), fileUri.toString());
  });

  test('the open Chapter has no gutter and no line numbers', async () => {
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.hasGutter, false);
  });

  test('an empty Chapter opens without error and with the cursor ready to write', async () => {
    await deleteScratchFile(fileUri);
    fileUri = await createScratchFile('');

    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.strictEqual(snapshot.text, '');
    assert.strictEqual(snapshot.selectionHead, 0);
  });

  // The Writing surface is the whole window, not just the strip the text
  // already occupies: a click on the blank space under the last line has to
  // land in the Chapter. It did not — `.cm-content` is the only box a click
  // can reach, and it was only as tall as the text already written — so a
  // blank Chapter, whose strip is a single empty line at the very top, could
  // not be written in at all: there was nowhere left to click. The cause was
  // two layers up, in `EditorView.cspNonce` (src/webview/main.ts): without it
  // the webview's Content Security Policy silently dropped every style
  // CodeMirror injects at runtime, `.cm-content`'s own `min-height: 100%`
  // among them.
  test('a blank Chapter is writable over the whole Writing surface, not just its first line', async () => {
    await deleteScratchFile(fileUri);
    fileUri = await createScratchFile('');

    const panel = await openInWritingEditor(fileUri);
    const { writingSurface } = await requestSnapshot(panel);

    assert.ok(writingSurface.visibleHeight > 0, 'the Writing surface should have a visible height at all');
    assert.ok(
      writingSurface.clickableHeight >= writingSurface.visibleHeight,
      `a click should reach the Chapter anywhere on the Writing surface: it is ${writingSurface.visibleHeight}px tall ` +
        `but only ${writingSurface.clickableHeight}px of it respond`
    );
  });
});
