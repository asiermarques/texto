import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, simulateTyping, waitFor, waitForText } from './support';

// US-004 (008): the Writing surface owns its tree, updated incrementally.
// RISK-001 is silent — a tree that has drifted from the text does not
// throw, it composes the WRONG characters — so this asserts composed state
// after a SEQUENCE of edits (typing at several positions, a large paste, a
// backspace, an external change), not just after one edit from a clean
// parse. Each step keeps the cursor away from every construct it touches,
// so every marker composes exactly the way `livePreview.test.ts`'s "cursor
// elsewhere" cases already prove for a single parse — the only new thing
// under test here is that a chain of incremental updates gets there too.

suite('US-004 (008): the incremental tree stays in sync across a sequence of edits', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('composition stays correct through typing at both ends, a large paste, a backspace and an external change', async () => {
    const initial = '## Título\n\nUn párrafo con **negrita** y un [enlace](https://example.com).';
    fileUri = await createScratchFile(initial);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-heading-2') ? true : undefined), 'the heading to compose first');

    // 1. Type at the very start — before the heading's own text, after its "## ".
    await simulateTyping(panel, [{ from: 3, to: 3, insert: 'Uno ' }]);
    await waitForText(fileUri, '## Uno Título\n\nUn párrafo con **negrita** y un [enlace](https://example.com).');

    // 2. Type right after the heading, before the blank line.
    const afterHeading = '## Uno Título'.length;
    await simulateTyping(panel, [{ from: afterHeading, to: afterHeading, insert: ' Dos' }]);
    let text = '## Uno Título Dos\n\nUn párrafo con **negrita** y un [enlace](https://example.com).';
    await waitForText(fileUri, text);

    // 3. A large paste at the very end — EDGE-002: a large edit, still correct.
    const pastedWord = 'palabra';
    const pastedParagraph = `\n\nOtro párrafo añadido con ${Array(60).fill(pastedWord).join(' ')} final.`;
    await simulateTyping(panel, [{ from: text.length, to: text.length, insert: pastedParagraph }]);
    text += pastedParagraph;
    await waitForText(fileUri, text);

    // 4. A backspace, removing the trailing period.
    await simulateTyping(panel, [{ from: text.length - 1, to: text.length, insert: '' }]);
    const textAfterBackspace = text.slice(0, -1);
    await waitForText(fileUri, textAfterBackspace);

    // 5. A change from OUTSIDE the Writing editor (a git checkout, same
    // shape as externalChanges.test.ts) restores the trailing period —
    // reaches the webview as an externalUpdate, flowing through the same
    // incremental treeField update as a keystroke, not a fresh full parse.
    await fs.promises.writeFile(fileUri.fsPath, text, 'utf8');
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await waitForText(fileUri, text);

    // Cursor away from every construct: the heading, the bold span and the
    // link should all be composed exactly as a single, clean parse of this
    // final text would compose them — proving the chain of incremental
    // updates never drifted from what the text actually is.
    await setCursor(panel, text.indexOf('palabra'));
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text === text ? s : undefined;
    }, 'the webview to settle on the final text');

    assert.strictEqual(snapshot.text, text);
    assert.ok(!snapshot.renderedText.includes('##'), 'the heading mark should be hidden');
    assert.ok(!snapshot.renderedText.includes('**'), 'the bold marks should be hidden');
    assert.ok(!snapshot.renderedText.includes('https://example.com'), "the link's URL should stay hidden");
    assert.ok(!snapshot.renderedText.includes('['), "the link's brackets should be hidden");
    assert.ok(snapshot.renderedText.includes('Uno Título Dos'), 'the two typed insertions at the start should both be present');
    assert.ok(snapshot.renderedText.includes('negrita'), 'the bold content should stay visible');
    assert.ok(snapshot.renderedText.includes('enlace'), "the link's text should stay visible");
    assert.ok(snapshot.renderedText.includes('Otro párrafo añadido'), 'the pasted paragraph should be present');
    assert.ok(snapshot.renderedText.trimEnd().endsWith('final.'), 'the external change should have restored the trailing period');
    assert.ok(snapshot.liveClasses.includes('cm-live-heading-2'), 'the heading should still be composed as a heading');
  });

  test('composition stays correct across a raw-markdown toggle in the middle of a sequence of edits', async () => {
    const initial = 'Primer párrafo.\n\nSegundo párrafo con **negrita**.';
    fileUri = await createScratchFile(initial);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-strong') ? true : undefined), 'the bold span to compose first');

    await simulateTyping(panel, [{ from: 0, to: 0, insert: 'Uno. ' }]);
    let text = `Uno. ${initial}`;
    await waitForText(fileUri, text);

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.length === 0 ? true : undefined), 'the raw view to activate');

    // Typing continues while the markdown is showing — the tree still has
    // to track it (US-004's risk note: toggling must not force a full
    // reparse or fall out of sync on the way back).
    await simulateTyping(panel, [{ from: text.length, to: text.length, insert: ' Tres.' }]);
    text += ' Tres.';
    await waitForText(fileUri, text);

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-strong') ? s : undefined;
    }, 'the composition to come back');

    assert.strictEqual(snapshot.text, text);
    assert.ok(!snapshot.renderedText.includes('**'), 'the bold marks should be hidden again after the toggle back');
    assert.ok(snapshot.renderedText.includes('negrita'));
    assert.ok(snapshot.renderedText.includes('Uno.'));
    assert.ok(snapshot.renderedText.trimEnd().endsWith('Tres.'));
  });
});
