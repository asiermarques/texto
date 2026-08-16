import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, placeCursorAtPoint, requestSnapshot, setCursor, waitFor } from './support';

// US-008, US-009, US-010 (006): Code blocks, Tasks and nested lists join the
// Composed subset as blocks, consistent with Focus mode, Text alignment and
// Word count.

suite('US-008: fenced Code blocks composed as a block', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('every line of the block is composed, the fence hidden when the cursor is elsewhere', async () => {
    fileUri = await createScratchFile('Antes.\n\n```js\nconst a = 1;\n```\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-codeblock') ? s : undefined;
    }, 'the code block to be composed');

    assert.ok(!snapshot.renderedText.includes('```'), `the fence should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('const a = 1;'));
    const codeLines = snapshot.lineRects.filter((l) => l.liveClasses.includes('cm-live-codeblock'));
    assert.strictEqual(codeLines.length, 3, 'the opening fence, the content and the closing fence should all be composed');
  });

  test('reveals the fence while the cursor is on its line', async () => {
    fileUri = await createScratchFile('```js\nconst a = 1;\n```');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 2); // on the opening fence's line
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('```js') ? s : undefined;
    }, 'the opening fence to reappear');

    assert.ok(snapshot.renderedText.includes('```js'));
  });

  test('reveals the fence when the Author clicks on its line, which renders empty', async () => {
    // The test above places the cursor at a position no click can produce:
    // the fence line is hidden whole, so it renders empty and CodeMirror
    // resolves a click anywhere along it to the line's END. Reaching that
    // line with the mouse is the Author's only way back to a fence they
    // need to fix, so it is measured here through CM6's own hit-test.
    fileUri = await createScratchFile('Antes.\n\n```js\nconst a = 1;\n```\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const composed = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-codeblock') && !s.renderedText.includes('```js') ? s : undefined;
    }, 'the fence to be hidden');

    const fenceLine = composed.lineRects.filter((l) => l.liveClasses.includes('cm-live-codeblock'))[0];
    assert.strictEqual(fenceLine.text, '', 'the fence line should render empty — that is what makes it hard to click into');
    await placeCursorAtPoint(
      panel,
      (composed.contentBox.left + composed.contentBox.right) / 2,
      fenceLine.top + fenceLine.height / 2
    );

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('```js') ? s : undefined;
    }, 'the opening fence to reappear after clicking on its line');

    assert.ok(snapshot.renderedText.includes('```js'));
  });

  test('an unclosed fence still composes to the end, and stays visible enough to fix (EDGE-005)', async () => {
    fileUri = await createScratchFile('```js\nconst a = 1;');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 100);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-codeblock') ? s : undefined;
    }, 'the unclosed block to still compose');

    assert.ok(snapshot.renderedText.includes('const a = 1;'));
  });

  test('the file keeps the fence and the code exactly as written, on save', async () => {
    fileUri = await createScratchFile('```js\nconst a = 1;\n```');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), '```js\nconst a = 1;\n```');
  });
});

suite('US-008: indented Code blocks composed as a block', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('is composed without hiding anything', async () => {
    fileUri = await createScratchFile('Antes.\n\n    indented code\n    second line\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-codeblock') ? s : undefined;
    }, 'the indented block to be composed');

    assert.ok(snapshot.renderedText.includes('indented code'));
    assert.ok(snapshot.renderedText.includes('second line'));
  });
});

suite('US-008: Focus mode treats a Code block as one unit (FR-006)', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('the whole block dims or focuses together, never half-dimmed', async () => {
    fileUri = await createScratchFile('Antes.\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0); // in "Antes."
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length > 0 ? s : undefined;
    }, 'the code block to be dimmed while the cursor is elsewhere');

    const dimmed = snapshot.dimmedText.join('\n');
    assert.ok(dimmed.includes('const a = 1;'), 'the block should be dimmed as a whole');
    assert.ok(dimmed.includes('console.log(a);'), 'the block should be dimmed as a whole, not line by line');
  });
});

suite('US-009: composed task lists', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('shows a composed box instead of the raw marker, for both an unchecked and a checked Task', async () => {
    fileUri = await createScratchFile('- [ ] tarea sin hacer\n- [x] tarea hecha');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-task-unchecked') && s.liveClasses.includes('cm-live-task-checked') ? s : undefined;
    }, 'both tasks to be composed');

    assert.ok(!snapshot.renderedText.includes('• [ ]'), 'a Task must not read as "• [ ] task"');
    assert.ok(snapshot.renderedText.includes('tarea sin hacer'));
    assert.ok(snapshot.renderedText.includes('tarea hecha'));
  });

  test('the box stays composed even with the cursor on the Task line (DEC-002: it must be clickable there too)', async () => {
    fileUri = await createScratchFile('- [ ] tarea sin hacer');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 10); // inside "tarea sin hacer", on the Task's own line
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-task-unchecked') ? s : undefined;
    }, 'the box to stay composed with the cursor on its line');

    assert.ok(snapshot.liveClasses.includes('cm-live-task-unchecked'));
  });

  test('the file keeps the raw marker exactly as written, on save', async () => {
    fileUri = await createScratchFile('- [ ] tarea sin hacer');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), '- [ ] tarea sin hacer');
  });
});

suite('US-010: nested lists indented by depth', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('each nesting level gets its own depth class', async () => {
    fileUri = await createScratchFile('- uno\n  - anidado\n    - doble anidado');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-list-depth-3') ? s : undefined;
    }, 'the deepest item to carry a depth-3 class');

    assert.ok(snapshot.liveClasses.includes('cm-live-list-depth-1'));
    assert.ok(snapshot.liveClasses.includes('cm-live-list-depth-2'));
    assert.ok(snapshot.liveClasses.includes('cm-live-list-depth-3'));
  });
});
