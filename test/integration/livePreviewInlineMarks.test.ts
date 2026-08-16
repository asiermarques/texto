import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-002, US-003, US-004 (006): Strikethrough, Inline code and escapes join
// the Composed subset, following the same reveal rule as emphasis (US-006 of
// 001) — hidden while the cursor is elsewhere, revealed while it touches the
// text they mark.

suite('US-002: strikethrough composed', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('is composed struck through with the tildes hidden when the cursor is elsewhere', async () => {
    fileUri = await createScratchFile('Un párrafo con ~~texto cortado~~ de verdad.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-strikethrough') ? s : undefined;
    }, 'the strikethrough to be composed');

    assert.ok(!snapshot.renderedText.includes('~~'), `the tildes should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('texto cortado'));
  });

  test('reveals the tildes while the cursor touches the struck-through text', async () => {
    fileUri = await createScratchFile('Un párrafo con ~~texto cortado~~ de verdad.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 20); // inside "texto cortado"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('~~') ? s : undefined;
    }, 'the tildes to reappear');

    assert.ok(snapshot.renderedText.includes('~~texto cortado~~'));
  });
});

suite('US-003: inline code composed', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('is composed monospaced with the backticks hidden when the cursor is elsewhere', async () => {
    fileUri = await createScratchFile('Ejecuta `npm test` antes de terminar.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-code') ? s : undefined;
    }, 'the inline code to be composed');

    assert.ok(!snapshot.renderedText.includes('`'), `the backticks should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('npm test'));
  });

  test('reveals the backticks while the cursor touches the code text', async () => {
    fileUri = await createScratchFile('Ejecuta `npm test` antes de terminar.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 12); // inside "npm test"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('`') ? s : undefined;
    }, 'the backticks to reappear');

    assert.ok(snapshot.renderedText.includes('`npm test`'));
  });
});

suite('US-004: backslash escapes composed', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('hides the backslash, leaving the escaped character visible', async () => {
    fileUri = await createScratchFile('Un \\* literal, no una lista.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return !s.renderedText.includes('\\') ? s : undefined;
    }, 'the backslash to be hidden');

    assert.ok(snapshot.renderedText.includes('Un * literal'));
  });

  test('reveals the backslash while the cursor touches the escaped character', async () => {
    fileUri = await createScratchFile('Un \\* literal, no una lista.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 4); // on the escaped "*"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('\\*') ? s : undefined;
    }, 'the backslash to reappear');

    assert.ok(snapshot.renderedText.includes('Un \\* literal'));
  });

  test('the file keeps the backslash exactly as written, on save', async () => {
    fileUri = await createScratchFile('Un \\* literal, no una lista.');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), 'Un \\* literal, no una lista.');
  });
});
