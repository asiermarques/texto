import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, waitFor } from './support';

// US-019: justified prose, opt-in (DEC-006, amended to add right per Author
// feedback on the settings toolbar — US-021). Values renamed from
// izquierda/derecha/justificado to left/right/justified in US-002 (003).

async function setAlignment(value: 'left' | 'right' | 'justified' | undefined): Promise<void> {
  await vscode.workspace.getConfiguration('texto').update('alignment', value, vscode.ConfigurationTarget.Global);
}

suite('US-019: prosa justificada, opcional', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await setAlignment(undefined);
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('left by default, untouched', async () => {
    fileUri = await createScratchFile('Un párrafo largo con varias palabras para comprobar la alineación por defecto del Capítulo.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);

    assert.notStrictEqual(snapshot.style.textAlign, 'justify');
  });

  test('activating justified straightens both edges of the column, without reloading', async () => {
    fileUri = await createScratchFile('Un párrafo largo con varias palabras para comprobar la alineación justificada del Capítulo entero.');
    const panel = await openInWritingEditor(fileUri);
    const before = await requestSnapshot(panel);

    await setAlignment('justified');

    const after = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'justify' ? s : undefined;
    }, 'the Chapter to become justified');
    assert.strictEqual(after.text, before.text, 'the document should not have reloaded');
  });

  test('justified really straightens the right margin, line by line', async () => {
    // Author report: "no justifica del todo como en Word". `textAlign:
    // justify` computing correctly proves nothing about the rendered edge —
    // this measures every wrapped visual line of one Paragraph against the
    // content box, which is what the Author is actually looking at. It also
    // pins the other half of the rule: the line that *ends* the Paragraph
    // stays ragged, as it does in Word.
    fileUri = await createScratchFile(
      'La casa estaba al final del camino, entre los almendros que su abuela había plantado el mismo año en que nació su madre, ' +
        'y desde la ventana de la cocina se veía el río bajar despacio hacia el pueblo, cargado de hojas y de una luz que no ' +
        'volvería a ver en ninguna otra parte del mundo.'
    );
    await setAlignment('justified');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'justify' && s.lineRects[0]?.visualLines.length > 2 ? s : undefined;
    }, 'the Paragraph to wrap into several justified lines');

    const visualLines = snapshot.lineRects[0].visualLines;
    for (const line of visualLines.slice(0, -1)) {
      assert.ok(
        Math.abs(snapshot.contentBox.right - line.right) < 1,
        `a wrapped line should reach the right margin (${snapshot.contentBox.right}), it ended at ${line.right}`
      );
    }
    const last = visualLines[visualLines.length - 1];
    assert.ok(last.right < snapshot.contentBox.right - 1, 'the last line of a Paragraph should stay ragged, as in any book');
  });

  test('with justified, hyphenation is really applied and not just declared', async () => {
    // The `hyphens: auto` half of DEC-006 only works if the runtime carries
    // the Spanish patterns: without them the declaration is inert and
    // justified prose opens the rivers of white the story set out to avoid.
    // Measured, not assumed: hyphenating fits the same words in fewer lines.
    fileUri = await createScratchFile(
      'Extraordinariamente incomprensiblemente desafortunadamente constitucionalmente responsabilidades ' +
        'extraordinariamente incomprensiblemente desafortunadamente constitucionalmente responsabilidades.'
    );
    const panel = await openInWritingEditor(fileUri);
    const ragged = await requestSnapshot(panel);

    await setAlignment('justified');

    const justified = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'justify' ? s : undefined;
    }, 'the Chapter to become justified');
    assert.ok(
      justified.lineRects[0].visualLines.length < ragged.lineRects[0].visualLines.length,
      `hyphenation should fit the same words in fewer lines (${ragged.lineRects[0].visualLines.length} ragged, ${justified.lineRects[0].visualLines.length} justified)`
    );
  });

  test('activating right right-aligns the column, without hyphenation', async () => {
    fileUri = await createScratchFile('Un párrafo largo con varias palabras para comprobar la alineación a la derecha.');
    const panel = await openInWritingEditor(fileUri);

    await setAlignment('right');

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'right' ? s : undefined;
    }, 'the Chapter to right-align');
    assert.strictEqual(snapshot.style.textAlign, 'right');
    assert.ok(!snapshot.style.hyphens.includes('auto'), `right should not turn on hyphenation, got "${snapshot.style.hyphens}"`);
  });

  test('a Scene break stays centred when the Chapter is right-aligned', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    await setAlignment('right');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-scene-break') ? s : undefined;
    }, 'the Scene break to be composed');
    const sceneBreakLine = snapshot.lineRects.find((l) => l.liveClasses.includes('cm-live-scene-break'));
    assert.ok(sceneBreakLine, 'the Scene break line was not found');
    assert.strictEqual(sceneBreakLine!.textAlign, 'center');
  });

  test('with justified, long words hyphenate instead of opening a gap', async () => {
    fileUri = await createScratchFile('Extraordinariamente largo.');
    await setAlignment('justified');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.style.textAlign === 'justify' ? s : undefined;
    }, 'the Chapter to open already justified');
    assert.ok(snapshot.style.hyphens.includes('auto'), `expected hyphens: auto, got "${snapshot.style.hyphens}"`);
  });

  test('a Scene break stays centred even when the Chapter is justified', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    await setAlignment('justified');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-scene-break') ? s : undefined;
    }, 'the Scene break to be composed');
    const sceneBreakLine = snapshot.lineRects.find((l) => l.liveClasses.includes('cm-live-scene-break'));
    assert.ok(sceneBreakLine, 'the Scene break line was not found');
    assert.strictEqual(sceneBreakLine!.textAlign, 'center');
  });
});
