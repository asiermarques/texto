import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createScratchFile,
  deleteScratchFile,
  openInWritingEditor,
  pressKey,
  requestSnapshot,
  setCursor,
  waitFor,
  waitForText,
} from './support';

/**
 * US-005 of 009: writing a **Table** from the keyboard. The unit suite
 * (`test/unit/tableEditing.test.ts`) proves what the skeleton IS; this
 * proves the command and the shortcut both reach it, that the bytes land in
 * the `TextDocument`, and that what lands composes as a grid.
 */

const SKELETON = ['|   |   |', '|---|---|', '|   |   |'].join('\n');

async function snapshotWhen(
  panel: vscode.WebviewPanel,
  predicate: (snapshot: Awaited<ReturnType<typeof requestSnapshot>>) => boolean,
  description: string
) {
  return waitFor(async () => {
    const snapshot = await requestSnapshot(panel);
    return predicate(snapshot) ? snapshot : undefined;
  }, description);
}

suite('US-005 (009): inserting a Table', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('the command writes a valid skeleton at the cursor and leaves it in the first Cell', async () => {
    fileUri = await createScratchFile('');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    await vscode.commands.executeCommand('texto.insertTable');

    await waitForText(fileUri, SKELETON);
    const snapshot = await snapshotWhen(panel, (s) => s.text === SKELETON, 'the webview to hold the skeleton');
    assert.strictEqual(snapshot.selectionHead, 2, 'the cursor is not in the first Cell of the Header row');
  });

  test('the keyboard shortcut inserts the same skeleton as the command', async () => {
    fileUri = await createScratchFile('');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    await pressKey(panel, 't', { mod: true, alt: true });

    await waitForText(fileUri, SKELETON);
  });

  test('inserting from the middle of a Paragraph does not split it into invalid markdown', async () => {
    const text = 'Un párrafo entero.';
    fileUri = await createScratchFile(text);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 3);

    await vscode.commands.executeCommand('texto.insertTable');

    await waitForText(fileUri, `${text}\n\n${SKELETON}`);
  });

  test('the inserted Table composes as a grid once the cursor leaves it', async () => {
    fileUri = await createScratchFile('Antes.\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 7);
    await vscode.commands.executeCommand('texto.insertTable');
    await waitForText(fileUri, `Antes.\n\n${SKELETON}\n\nDespués.`);

    // Out of the Table entirely, so FR-003's whole-Table reveal lets go.
    await setCursor(panel, 0);

    const snapshot = await snapshotWhen(panel, (s) => s.tableCells.length > 0, 'the inserted Table to compose as a grid');
    assert.strictEqual(snapshot.tableCells.length, 4, 'the empty skeleton did not compose four Cells');
    for (const cell of snapshot.tableCells) {
      assert.ok(cell.right - cell.left > 0, 'a composed Cell of the empty skeleton has no width at all');
    }
    assert.ok(!snapshot.renderedText.includes('|'), 'a pipe of the composed skeleton is still visible');
  });
});

/**
 * US-006 of 009: filling a **Table** by typing and tabbing, rather than by
 * aiming the cursor between pipes. The unit suite proves where Tab goes;
 * this proves CM6's own keymap resolves the key before its default
 * handling, and that a **Row** Tab appends reaches the file padded.
 */
suite('US-006 (009): moving between Cells', () => {
  const TABLE = ['| Nombre | Rol          |', '|--------|--------------|', '| Ana    | Protagonista |'].join('\n');
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile(TABLE);
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('Tab moves to the next Cell of the same Row', async () => {
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, TABLE.indexOf('Nombre') + 1);

    await pressKey(panel, 'Tab');

    const snapshot = await snapshotWhen(panel, (s) => s.selectionHead === TABLE.indexOf('Rol'), 'the cursor to reach the next Cell');
    assert.strictEqual(snapshot.selectionHead, TABLE.indexOf('Rol'));
  });

  test('Tab wraps to the first Cell of the next Row, over the Delimiter row', async () => {
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, TABLE.indexOf('Rol') + 1);

    await pressKey(panel, 'Tab');

    await snapshotWhen(panel, (s) => s.selectionHead === TABLE.indexOf('Ana'), 'the cursor to reach the next Row');
  });

  test('Shift-Tab moves back over the Delimiter row to the Row above', async () => {
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, TABLE.indexOf('Ana') + 1);

    await pressKey(panel, 'Tab', { shift: true });

    await snapshotWhen(panel, (s) => s.selectionHead === TABLE.indexOf('Rol'), 'the cursor to reach the Row above');
  });

  test('Tab in the last Cell of the last Row appends a padded Row and lands in it', async () => {
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, TABLE.indexOf('Protagonista') + 1);

    await pressKey(panel, 'Tab');

    const grown = `${TABLE}\n|        |              |`;
    await waitForText(fileUri, grown);
    await snapshotWhen(panel, (s) => s.selectionHead === TABLE.length + 3, 'the cursor to reach the new Row s first Cell');
  });

  test('Shift-Tab in the first Cell of the Header row adds no Row and writes nothing', async () => {
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, TABLE.indexOf('Nombre') + 1);

    await pressKey(panel, 'Tab', { shift: true });
    await snapshotWhen(panel, (s) => s.selectionHead === TABLE.indexOf('Nombre'), 'the cursor to stay in the first Cell');

    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(document.getText(), TABLE, 'Shift-Tab out of the first Cell changed the Chapter');
  });

  test('Tab in a Paragraph outside any Table writes nothing of its own', async () => {
    await deleteScratchFile(fileUri);
    const prose = 'Un párrafo entero.';
    fileUri = await createScratchFile(prose);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 3);

    await pressKey(panel, 'Tab');
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(document.getText(), prose, 'Tab outside a Table changed the Chapter');
  });
});
