import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, placeCursorAtPoint, requestSnapshot, setCursor, waitFor } from './support';
import type { EditorSnapshot } from '../../src/domain/testProtocol';

// US-001 and US-002 (009): a Table joins the Composed subset. Requirement
// 006 left it out (NOGOAL-001) on the grounds that aligning columns the file
// does not align cannot be expressed as hide/mark/line — it can, once the
// stylesheet is allowed to lay the Rows out as a table (BR-002 of 009).
//
// This is the suite that actually proves it: "the columns line up" is
// geometry, not a class list, so every assertion here is measured off the
// rendered boxes.

const TABLE = ['| Name | Role |', '| --- | --- |', '| Ana | Editor |', '| Beltrán | Translator |'].join('\n');

// Every fixture opens with a Paragraph: the cursor has to have somewhere to
// rest OUTSIDE the Table, or FR-003 reveals it and there is no grid to
// measure. `setCursor(panel, 0)` then means "on the prose", not "in the
// Table".
const PROSE = 'Antes.\n\n';

/** The Chapter these tests measure: prose, the Table, prose. */
function chapterAround(table: string): string {
  return `${PROSE}${table}\n\nDespués.`;
}

async function composedTable(panel: vscode.WebviewPanel): Promise<EditorSnapshot> {
  return await waitFor(async () => {
    const snapshot = await requestSnapshot(panel);
    return snapshot.tableCells.length > 0 && !snapshot.renderedText.includes('|') ? snapshot : undefined;
  }, 'the Table to be composed');
}

/** The Cells of column `index`, in Row order — four Cells per column in TABLE. */
function column(snapshot: EditorSnapshot, index: number) {
  return snapshot.tableCells.filter((_, i) => i % 2 === index);
}

suite('US-001 (009): a Table composed as a grid', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('hides every pipe and the Delimiter row, keeping the Cells as real text', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);

    assert.ok(!snapshot.renderedText.includes('|'), `no pipe should be visible: ${snapshot.renderedText}`);
    assert.ok(!snapshot.renderedText.includes('---'), 'the Delimiter row should not be visible');
    assert.deepStrictEqual(
      snapshot.tableCells.map((c) => c.text),
      ['Name', 'Role', 'Ana', 'Editor', 'Beltrán', 'Translator']
    );
    const delimiterLine = snapshot.lineRects.find((l) => l.liveClasses.includes('cm-live-table-delimiter'));
    assert.ok(delimiterLine, 'the Delimiter row should carry its own line class');
    assert.strictEqual(delimiterLine.height, 0, 'the Delimiter row should take no vertical space at all');
  });

  test('lines the columns up: every Cell of a column shares one left edge', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);

    for (const index of [0, 1]) {
      const cells = column(snapshot, index);
      assert.strictEqual(cells.length, 3, `column ${index} should have one Cell per Row`);
      const [first, ...rest] = cells;
      for (const cell of rest) {
        assert.ok(
          Math.abs(cell.left - first.left) < 1,
          `column ${index}: "${cell.text}" starts at ${cell.left}, "${first.text}" at ${first.left}`
        );
      }
    }
    // …and the second column starts after the first one ends, rather than
    // both collapsing onto the same edge.
    assert.ok(column(snapshot, 1)[0].left > column(snapshot, 0)[0].right - 1, 'the columns should not overlap');
  });

  test('each Row occupies one line of its own, in document order', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const tops = column(snapshot, 0).map((c) => c.top);

    assert.deepStrictEqual([...tops].sort((a, b) => a - b), tops, 'the Rows should stack downwards in order');
    assert.ok(new Set(tops).size === tops.length, 'no two Rows should share a line');
    assert.ok(
      snapshot.tableCells[0].top === snapshot.tableCells[1].top,
      'the two Cells of the Header row should sit on the same line'
    );
  });

  test('sets the Header row apart from the body', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);

    const headerWeight = Number(snapshot.tableCells[0].fontWeight);
    const bodyWeight = Number(snapshot.tableCells[2].fontWeight);
    assert.ok(headerWeight > bodyWeight, `the Header row should be heavier than the body (${headerWeight} vs ${bodyWeight})`);
  });

  test('is ruled like a table in a book: top, under the Header row, bottom — and nowhere else', async () => {
    // The booktabs convention (US-001, refined): three horizontal rules, no
    // rule between body Rows, and never a vertical one.
    const threeRows = ['| Name | Role |', '| --- | --- |', '| Ana | Editor |', '| Beltrán | Translator |', '| Ada | Reader |'].join('\n');
    fileUri = await createScratchFile(chapterAround(threeRows));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const rows = snapshot.lineRects.filter((l) => l.liveClasses.includes('cm-live-table-row'));
    const [head, middle, , last] = rows;

    assert.ok(head.borderTopWidth > 0, 'the Table should open with a rule');
    assert.ok(head.borderBottomWidth > 0, 'the Header row should be ruled off from the body');
    assert.strictEqual(middle.borderTopWidth, 0, 'no rule between body Rows');
    assert.strictEqual(middle.borderBottomWidth, 0, 'no rule between body Rows');
    assert.ok(last.borderBottomWidth > 0, 'the Table should close with a rule');
    for (const cell of snapshot.tableCells) {
      assert.strictEqual(cell.borderLeftWidth, 0, `"${cell.text}": a table is never ruled vertically`);
      assert.strictEqual(cell.borderRightWidth, 0, `"${cell.text}": a table is never ruled vertically`);
    }
    // One rule is one unbroken line: the Rows carry them, so a Cell whose
    // prose wraps cannot turn the closing rule into a flight of steps.
    for (const row of rows) {
      assert.ok(Math.abs(row.width - head.width) < 1, 'every rule should span the same width — the Table\'s own');
    }
    // …and the Table is as wide as it needs to be, not as wide as the page.
    assert.ok(head.width < snapshot.contentBox.right - snapshot.contentBox.left, 'a Table narrower than the measure should not stretch to it');
  });

  test('keeps its columns square when the Rows hold very different amounts of text', async () => {
    // The Author's own README table: a Row of two-word Cells sits under a
    // Row whose Cells run to a full line. Every Row must still be one
    // width, and every column one column — the failure this guards against
    // sized each Row to its own text, so the columns drifted and the rule
    // under the Header row stopped where the titles happened to end.
    const uneven = [
      '| Construct | Written as | Reads as |',
      '| --- | --- | --- |',
      '| Escape | `\\*` | The literal character, backslash hidden |',
      '| Link (inline, reference, autolink, bare URL) | `[text](url)`, `[text][ref]`, `<url>`, a bare URL | Underlined text, target hidden (hover or Cmd-click to follow it) |',
      '| Image | `![alt](url)` | Its alternative text |',
    ].join('\n');
    fileUri = await createScratchFile(chapterAround(uneven));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const columnCount = 3;
    const columnOf = (index: number) => snapshot.tableCells.filter((_, i) => i % columnCount === index);

    for (const index of [0, 1, 2]) {
      const cells = columnOf(index);
      const [first, ...rest] = cells;
      for (const cell of rest) {
        assert.ok(
          Math.abs(cell.left - first.left) < 1,
          `column ${index}: "${cell.text}" starts at ${cell.left}, "${first.text}" at ${first.left}`
        );
        assert.ok(
          Math.abs(cell.right - first.right) < 1,
          `column ${index}: "${cell.text}" ends at ${cell.right}, "${first.text}" at ${first.right}`
        );
      }
    }

    // …and every rule spans the whole Table, not just the Row that carries it.
    const rows = snapshot.lineRects.filter((l) => l.liveClasses.includes('cm-live-table-row'));
    for (const row of rows) {
      assert.ok(Math.abs(row.width - rows[0].width) < 1, `every Row should be one width (${row.width} vs ${rows[0].width})`);
    }
  });

  test('sets its rules close to the type they rule off, not floating away from it', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const rows = snapshot.lineRects.filter((l) => l.liveClasses.includes('cm-live-table-row'));
    const header = rows.find((l) => l.liveClasses.includes('cm-live-table-header'));
    const last = rows.find((l) => l.liveClasses.includes('cm-live-table-last-row'));
    const middle = rows.find((l) => !l.liveClasses.includes('cm-live-table-header') && !l.liveClasses.includes('cm-live-table-last-row'));

    assert.ok(header && last && middle, 'the Header row, a body Row and the closing Row should all be composed');
    // The ruled Rows are taller than a plain one — that difference is the
    // gap between the rule and the type, and it stays a gap rather than
    // becoming a gulf: a rule drawn a whole line away from its Table reads
    // as a Scene break, not as a table.
    assert.ok(header.height > middle.height, 'the Header row should carry the gap under its rule');
    assert.ok(last.height > middle.height, 'and the closing Row the gap above its own');
    assert.ok(header.height < middle.height * 1.8, `the rule should sit close to the Table, not float away from it (${header.height} vs ${middle.height})`);
    assert.ok(last.height < middle.height * 1.8, `the closing rule should sit close to the Table (${last.height} vs ${middle.height})`);
  });

  test('sets the Header row in small caps and a numeric column in tabular figures', async () => {
    // The Chapter's prose is set with oldstyle figures; a right-aligned
    // column is where numbers live, and numbers in a column have to line up.
    const numeric = ['| Concepto | Importe |', '| :--- | ---: |', '| Traducción | 1200 |', '| Revisión | 90 |'].join('\n');
    fileUri = await createScratchFile(chapterAround(numeric));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const [head] = snapshot.tableCells;
    const amounts = column(snapshot, 1).slice(1);

    assert.strictEqual(head.fontVariantCaps, 'all-small-caps', 'the Header row should be set in small caps');
    for (const cell of amounts) {
      assert.ok(
        cell.fontVariantNumeric.includes('tabular-nums'),
        `"${cell.text}" should be set in tabular figures, not the prose's oldstyle ones (${cell.fontVariantNumeric})`
      );
    }
    // The prose around the Table keeps its oldstyle figures.
    assert.ok(!snapshot.style.fontVariantNumeric.includes('tabular-nums'));
  });

  test('reveals the WHOLE Table as raw markdown while the cursor is inside it', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await composedTable(panel);

    // Cursor on the LAST Row: the Header row, three lines up, has to come
    // back too (FR-003).
    await setCursor(panel, PROSE.length + TABLE.length - 3);
    const revealed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.renderedText.includes('| Name | Role |') ? snapshot : undefined;
    }, 'the whole Table to reveal');

    assert.ok(revealed.renderedText.includes('| --- | --- |'), 'the Delimiter row should be back');
    assert.strictEqual(revealed.tableCells.length, 0, 'nothing should still be composed as a Cell');

    // …and it composes again on the way out.
    await setCursor(panel, 0);
    const recomposed = await composedTable(panel);
    assert.strictEqual(recomposed.tableCells.length, 6);
  });

  test('never breaks a title, whatever it costs in width (OQ-001, revised on Author feedback)', async () => {
    // Originally this locked in "a wide Table wraps inside the measure".
    // Seen on a real Chapter, that answer cut "Personaje" into "Per/son/aje"
    // — so the rule changed: a column is never narrower than its own title,
    // and a Table that still does not fit reaches into the margins rather
    // than breaking words.
    const wide = [
      '| Personaje | Papel en la novela | Notas del editor | Estado |',
      '| --- | --- | --- | --- |',
      '| Beltrán | Traductor literario de una obra extensa | Revisó el capítulo entero durante el invierno | Pendiente |',
    ].join('\n');
    fileUri = await createScratchFile(chapterAround(wide));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const titles = snapshot.tableCells.slice(0, 4);

    for (const title of titles) {
      // On one line: a title that had wrapped would be taller than the
      // single-line box its own column reserves for it.
      assert.strictEqual(title.textAlign, 'left');
      assert.ok(
        title.textRight <= title.right - title.paddingRight + 1,
        `the title "${title.text}" should fit inside its own column, not spill into the next (text ends at ${title.textRight}, column at ${title.right - title.paddingRight})`
      );
    }
    // Every Cell of a Row sits on that Row's own line — no Cell dropped
    // onto a line of its own to make the Table fit.
    const bodyTop = snapshot.tableCells[4].top;
    for (const cell of snapshot.tableCells.slice(4)) {
      assert.strictEqual(cell.top, bodyTop, `"${cell.text}" should stay on its Row's line`);
    }
  });

  test('keeps a Table that fits inside the measure', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);

    for (const cell of snapshot.tableCells) {
      assert.ok(cell.right <= snapshot.contentBox.right + 1, `"${cell.text}" should stay within the measure`);
      assert.ok(cell.left >= snapshot.contentBox.left - 1, `"${cell.text}" should start within the measure`);
    }
  });

  test('lets the Author click into a composed Cell, which reveals the Table (RISK-003)', async () => {
    // The Cells are the Author's own text, so CodeMirror's hit-test can
    // resolve a click inside one — the only way into a Table with the
    // mouse, and the reason the grid is decorations and not a widget.
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    const composed = await composedTable(panel);

    const editorCell = composed.tableCells.find((c) => c.text === 'Editor');
    assert.ok(editorCell, 'the Cell to click into should be composed');
    await placeCursorAtPoint(panel, editorCell.textLeft + 2, editorCell.top + 4);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('| Ana | Editor |') ? s : undefined;
    }, 'the Table to reveal after clicking a Cell');

    const table = snapshot.text.indexOf('| Name');
    assert.ok(
      snapshot.selectionHead > table && snapshot.selectionHead < table + TABLE.length,
      `the cursor should have landed inside the Table (at ${snapshot.selectionHead})`
    );
  });

  test('keeps the whole Table undimmed as one block under Focus mode', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);

    // Cursor in the last Row: every other Row has to stay undimmed with it.
    await setCursor(panel, PROSE.length + TABLE.length - 3);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.dimmedText.length > 0 ? s : undefined;
    }, 'the prose around the Table to dim');

    const dimmed = snapshot.dimmedText.join(' ');
    assert.ok(dimmed.includes('Antes.'), 'the Paragraph before the Table should be dimmed');
    assert.ok(!dimmed.includes('Name'), `no Row of the focused Table should be dimmed: ${dimmed}`);
    assert.ok(!dimmed.includes('Ana'), `no Row of the focused Table should be dimmed: ${dimmed}`);
  });

  test('shows the markdown in place under Raw markdown view, like every other composition', async () => {
    fileUri = await createScratchFile(chapterAround(TABLE));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await composedTable(panel);

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');

    const raw = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.tableCells.length === 0 ? s : undefined;
    }, 'the grid to go away under Raw markdown view');
    assert.ok(raw.renderedText.includes('| --- | --- |'), 'the Delimiter row should be visible as markdown');

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');
    const recomposed = await composedTable(panel);
    assert.strictEqual(recomposed.tableCells.length, 6);
  });

  test('leaves a half-written Table exactly as typed', async () => {
    fileUri = await createScratchFile(chapterAround('| a | b\n| 1 | 2 |'));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('| a | b') ? s : undefined;
    }, 'the half-written Table to stay as typed');

    assert.strictEqual(snapshot.tableCells.length, 0);
  });
});

suite('US-002 (009): Column alignment', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  const ALIGNED = ['| Concepto | Importe |', '| :--- | ---: |', '| Traducción | 1200 |', '| Revisión | 90 |'].join('\n');

  test('puts a "---:" column’s text against the right edge of its own column', async () => {
    fileUri = await createScratchFile(chapterAround(ALIGNED));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);
    const amounts = column(snapshot, 1);

    for (const cell of amounts) {
      assert.strictEqual(cell.textAlign, 'right', `"${cell.text}" should compute to text-align: right`);
      // Against the column's inner edge: the gutter that separates it from
      // the next column is part of the Cell's own box.
      assert.ok(
        Math.abs(cell.textRight - (cell.right - cell.paddingRight)) < 2,
        `"${cell.text}" should sit against its column's inner right edge (text ends at ${cell.textRight}, column at ${cell.right - cell.paddingRight})`
      );
    }
    // The two amounts have different widths, so right alignment is the only
    // thing that can make their right edges agree.
    assert.ok(Math.abs(amounts[1].textRight - amounts[2].textRight) < 2, 'the amounts should line up on the right');
    assert.ok(Math.abs(amounts[1].textLeft - amounts[2].textLeft) > 2, '…and not on the left, which is what left alignment would do');
  });

  test('leaves an unmarked column left-aligned even when the Author justifies the Chapter', async () => {
    fileUri = await createScratchFile(chapterAround(ALIGNED));
    const panel = await openInWritingEditor(fileUri);
    await vscode.workspace.getConfiguration('texto').update('alignment', 'justified', vscode.ConfigurationTarget.Global);
    try {
      await setCursor(panel, 0);
      const snapshot = await waitFor(async () => {
        const s = await requestSnapshot(panel);
        return s.alignAttribute === 'justified' && s.tableCells.length > 0 ? s : undefined;
      }, 'the justified Chapter with a composed Table');

      for (const cell of column(snapshot, 0)) {
        assert.strictEqual(cell.textAlign, 'left', `"${cell.text}" should stay left-aligned`);
      }
      for (const cell of column(snapshot, 1)) {
        assert.strictEqual(cell.textAlign, 'right', `"${cell.text}" should stay right-aligned`);
      }
    } finally {
      await vscode.workspace.getConfiguration('texto').update('alignment', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test('centres a ":-:" column', async () => {
    fileUri = await createScratchFile(chapterAround('| a | b |\n| :-: | --- |\n| 1 | 2 |'));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await composedTable(panel);

    assert.strictEqual(snapshot.tableCells[0].textAlign, 'center');
    assert.strictEqual(snapshot.tableCells[1].textAlign, 'left');
  });
});
