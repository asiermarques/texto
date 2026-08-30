import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, simulateTyping, undoCommandsCanRun, waitFor, waitForText } from './support';

// US-002: writing, saving, undoing and redoing.

suite('US-002: writing, saving, undoing and redoing', () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Texto inicial.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('writing a paragraph marks the tab as modified', async () => {
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Más.' }]);

    const document = await waitFor(async () => {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      return doc.isDirty ? doc : undefined;
    }, 'the TextDocument to be marked as modified');
    assert.strictEqual(document.isDirty, true);
    assert.strictEqual(document.getText(), 'Texto inicial. Más.');
  });

  test('saving writes valid markdown to disk', async () => {
    const panel = await openInWritingEditor(fileUri);
    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Guardado.' }]);
    await waitForText(fileUri, 'Texto inicial. Guardado.');

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();

    const onDisk = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.strictEqual(onDisk, 'Texto inicial. Guardado.');
    assert.strictEqual(document.isDirty, false);
  });

  // What makes VSCode's undo work at all, and the half of it no window
  // manager can take away: the edit has to reach the Chapter as one
  // `WorkspaceEdit` on the real `TextDocument`. Writing the file behind
  // VSCode's back, or splitting one keystroke across two edits, moves these
  // numbers — and each of those would show up as a broken undo long before
  // anything else noticed.
  test('a keystroke reaches the Chapter as one change on the document itself — one undo step', async () => {
    const panel = await openInWritingEditor(fileUri);
    const document = await vscode.workspace.openTextDocument(fileUri);
    const versionBefore = document.version;
    const collected: vscode.TextDocumentContentChangeEvent[][] = [];
    const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
      // Only events that actually changed something: VSCode also fires this
      // with an empty `contentChanges` when a document's dirty state moves,
      // and `WritingEditorProvider` ignores those for the same reason.
      if (event.document.uri.toString() === fileUri.toString() && event.contentChanges.length > 0) {
        collected.push([...event.contentChanges]);
      }
    });

    try {
      await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Añadido.' }]);
      await waitForText(fileUri, 'Texto inicial. Añadido.');
    } finally {
      subscription.dispose();
    }

    assert.strictEqual(collected.length, 1, `one keystroke should be one document change, not ${collected.length}`);
    assert.strictEqual(document.version - versionBefore, 1, 'one document change should be one version, which is one undo step');
  });

  test('undo reverts the last edit and redo applies it again', async function () {
    const panel = await openInWritingEditor(fileUri);
    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Añadido.' }]);
    await waitForText(fileUri, 'Texto inicial. Añadido.');

    // The undo stack itself is asserted by the test above, which needs no
    // focus; this is the round trip through VSCode's own commands, and they
    // only reach a Chapter through a really-focused editor.
    if (!(await undoCommandsCanRun(panel))) {
      console.log('    (skipped: VSCode\'s window is not frontmost, so undo/redo cannot be routed to the Chapter — see undoCommandsCanRun)');
      this.skip();
    }

    await vscode.commands.executeCommand('undo');
    await waitForText(fileUri, 'Texto inicial.');

    await vscode.commands.executeCommand('redo');
    await waitForText(fileUri, 'Texto inicial. Añadido.');
  });

  test('writing at one point keeps the rest of the Chapter intact', async () => {
    await deleteScratchFile(fileUri);
    fileUri = await createScratchFile('Primer párrafo.\n\nSegundo párrafo con [un enlace](https://example.com).');
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 15, to: 15, insert: ' Extra.' }]);
    await waitForText(fileUri, 'Primer párrafo. Extra.\n\nSegundo párrafo con [un enlace](https://example.com).');

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    const onDisk = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.ok(onDisk.includes('[un enlace](https://example.com)'), 'the markdown outside the subset was not kept intact');
  });

  test('opening and closing without writing leaves no changes in the file', async () => {
    const before = await fs.promises.readFile(fileUri.fsPath, 'utf8');

    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel); // confirms the webview actually loaded
    await closeAllEditors();

    const after = await fs.promises.readFile(fileUri.fsPath, 'utf8');
    assert.strictEqual(after, before);
  });

  test('a burst of keystrokes reaches the Chapter whole — none of them dropped, none misplaced', async function () {
    this.timeout(30000);
    const panel = await openInWritingEditor(fileUri);

    // One message per keystroke, handed to the host together: the Author
    // typing at speed, which is what broke. A `TextChange`'s offsets are into
    // the document as the webview knows it, and `applyChanges` resolves them
    // with `document.positionAt`, read synchronously — so a batch that starts
    // before its predecessor is in the document measures against the wrong
    // one. VSCode then refuses it and the keystroke is gone, or it lands at an
    // offset that no longer means what the webview meant by it and the two
    // documents drift apart for good.
    //
    // Long rather than a handful of characters, and posted without awaiting
    // each one: the race needs two batches to overlap, and a warm host can
    // finish a short burst one edit at a time. At this length it reproduced
    // on every run before the queue existed.
    const typed = Array.from({ length: 120 }, (_unused, index) => String.fromCharCode(97 + (index % 26))).join('');
    await Promise.all(Array.from(typed, (character, index) => simulateTyping(panel, [{ from: 14 + index, to: 14 + index, insert: character }])));

    const expected = `Texto inicial.${typed}`;
    const document = await waitFor(
      async () => {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        return doc.getText() === expected ? doc : undefined;
      },
      'the whole burst to reach the TextDocument'
      // Deliberately asserted below rather than only here: a timeout says
      // "it never arrived", and what a dropped or misplaced keystroke needs
      // to show is WHAT arrived instead.
    ).catch(async () => await vscode.workspace.openTextDocument(fileUri));
    const landed = document.getText();
    assert.strictEqual(
      landed === expected,
      true,
      `every keystroke should be in the Chapter, in order: got ${JSON.stringify(landed)}`
    );

    // And the two halves still agree: a keystroke that lands at the wrong
    // offset leaves the Chapter plausible and the webview out of step with
    // it, after which every later edit is applied in the wrong place. That
    // silent drift is the damage, not the single lost character.
    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.text === expected, true, 'the Writing surface and the Chapter should hold the same text');
  });

  test('an edit of our own is not sent back as if it were an external change (no duplicated text)', async () => {
    const panel = await openInWritingEditor(fileUri);

    await simulateTyping(panel, [{ from: 14, to: 14, insert: ' Único.' }]);
    await waitForText(fileUri, 'Texto inicial. Único.');

    // If the extension echoed its own change back to the webview, the same
    // insertion would be applied a second time and the text would duplicate
    // or corrupt — give it time to (wrongly) arrive, then check it didn't.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const snapshot = await requestSnapshot(panel);
    assert.strictEqual(snapshot.text, 'Texto inicial. Único.');
  });
});
