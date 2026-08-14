import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, simulateTyping, waitFor, waitForText } from './support';

// US-003: external changes reflected in the open editor.

async function applyExternalEdit(uri: vscode.Uri, range: vscode.Range, text: string): Promise<void> {
  // Applied directly against the TextDocument, bypassing the webview's own
  // message flow entirely — from the editor's point of view this is
  // indistinguishable from any other change it didn't originate itself
  // (a file-watcher-triggered reload after `git checkout`, another
  // extension, …), which is exactly the case FR-005/EDGE-001 describe.
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, text);
  const applied = await vscode.workspace.applyEdit(edit);
  assert.ok(applied, 'the test external edit could not be applied');
}

suite('US-003: external changes reflected in the open editor', () => {
  let fileUri: vscode.Uri;

  setup(async () => {
    fileUri = await createScratchFile('Uno. Dos. Tres.');
  });

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('a change that does not come from the webview is reflected without duplicating or losing text', async () => {
    const panel = await openInWritingEditor(fileUri);

    await applyExternalEdit(fileUri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 4)), 'Primero.');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text === 'Primero. Dos. Tres.' ? s : undefined;
    }, 'the webview to reflect the external change');
    assert.strictEqual(snapshot.text, 'Primero. Dos. Tres.');
  });

  test('a git checkout (change on disk + reload) leaves the Chapter exactly as it is in that Draft', async () => {
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel); // ensure handshake is settled before mutating on disk

    await fs.promises.writeFile(fileUri.fsPath, 'Contenido de otro Borrador.', 'utf8');
    await vscode.commands.executeCommand('workbench.action.files.revert');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text === 'Contenido de otro Borrador.' ? s : undefined;
    }, 'the webview to reflect the Draft reloaded from disk');
    assert.strictEqual(snapshot.text, 'Contenido de otro Borrador.');
  });

  test('a far-away external change does not move the cursor from where the writing was happening', async () => {
    const panel = await openInWritingEditor(fileUri);
    // Place the cursor by typing at the very end — CM6 puts the selection
    // right after what was just inserted.
    await simulateTyping(panel, [{ from: 15, to: 15, insert: ' Cuatro.' }]);
    // Wait for the TextDocument itself (not just the webview's own local
    // state, which updates on keystroke before the round trip completes) to
    // have the edit applied — otherwise the next direct edit below races it.
    await waitForText(fileUri, 'Uno. Dos. Tres. Cuatro.');
    const beforeExternalChange = await requestSnapshot(panel);
    const cursorBefore = beforeExternalChange.selectionHead;

    // A far-away external change: 7 characters prepended at the very start.
    await applyExternalEdit(fileUri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)), 'Lejano ');

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.text.startsWith('Lejano ') ? s : undefined;
    }, 'the far-away external change to reach the webview');

    assert.strictEqual(after.selectionHead, cursorBefore + 'Lejano '.length);
  });
});
