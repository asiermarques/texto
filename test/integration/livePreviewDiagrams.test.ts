import * as assert from 'assert';
import * as vscode from 'vscode';
import { clickAt, closeAllEditors, createScratchFile, deleteScratchFile, moveCursor, openInWritingEditor, requestSnapshot, setCursor, simulateTyping, waitFor } from './support';
import type { EditorSnapshot } from '../../src/domain/testProtocol';

// Requirement 010: a Diagram joins the Composed subset — a Code block whose
// info string is `mermaid`, composed as the picture its source describes.
//
// This is the suite that matters most of the three levels. The domain half
// (test/unit/diagram.test.ts) proves which blocks are picked and when they
// reveal; everything else about a Diagram is only true inside a real webview:
// the renderer is fetched over a Content Security Policy that admits no
// script and no style without a nonce, and the picture is an SVG whose own
// <style> element that policy is entitled to refuse. A Diagram that draws as
// unstyled black shapes on nothing would pass every assertion that only
// counted elements, which is why `styleHasNonce` is asserted here.

const DIAGRAM = ['```mermaid', 'graph TD', '  A[Escribir] --> B{Revisar}', '  B -->|Sí| C[Publicar]', '  B -->|No| A', '```'].join('\n');

/** Prose before and after, so the cursor has somewhere to rest outside the Diagram. */
function chapterAround(diagram: string): string {
  return `Antes.\n\n${diagram}\n\nDespués.`;
}

/**
 * The renderer is a separate ~1.5MB bundle fetched only once a Chapter turns
 * out to hold a Diagram (ADR 0004), so the first picture in a panel is never
 * there on the first frame — the plate shows the source until the script
 * lands. Every assertion about a drawn Diagram has to wait for that.
 */
async function drawnDiagram(panel: vscode.WebviewPanel): Promise<EditorSnapshot> {
  return await waitFor(async () => {
    const snapshot = await requestSnapshot(panel);
    return snapshot.diagrams.length > 0 && snapshot.diagrams[0].drawn ? snapshot : undefined;
  }, 'the Diagram to be drawn');
}

suite('Requirement 010: a Diagram composed as a picture', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('draws the picture in place of the Code block, with the source gone from the Writing surface', async function () {
    this.timeout(30000);
    fileUri = await createScratchFile(chapterAround(DIAGRAM));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await drawnDiagram(panel);

    assert.strictEqual(snapshot.diagrams.length, 1);
    assert.ok(snapshot.diagrams[0].width > 0 && snapshot.diagrams[0].height > 0, `the picture should have a size: ${JSON.stringify(snapshot.diagrams[0])}`);
    assert.ok(!snapshot.renderedText.includes('```'), `no fence should be visible: ${snapshot.renderedText}`);
    assert.ok(!snapshot.renderedText.includes('graph TD'), `the source should be gone: ${snapshot.renderedText}`);
    // The prose around it is untouched — a Diagram replaces its own lines
    // and nothing else.
    assert.ok(snapshot.renderedText.includes('Antes.'));
    assert.ok(snapshot.renderedText.includes('Después.'));
  });

  test('the file on disk is exactly what the Author wrote — the picture is drawn, never inserted', async function () {
    this.timeout(30000);
    const chapter = chapterAround(DIAGRAM);
    fileUri = await createScratchFile(chapter);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await drawnDiagram(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    assert.strictEqual(document.getText(), chapter);
  });

  test('carries the nonce on the SVG style, without which the Content Security Policy strips the diagram of every colour', async function () {
    this.timeout(30000);
    fileUri = await createScratchFile(chapterAround(DIAGRAM));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await drawnDiagram(panel);

    assert.strictEqual(snapshot.diagrams[0].styleHasNonce, true);
  });

  test('reveals the whole Diagram as its own source once the cursor walks into it', async function () {
    this.timeout(30000);
    const chapter = chapterAround(DIAGRAM);
    fileUri = await createScratchFile(chapter);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await drawnDiagram(panel);

    // Onto the Diagram's first character: the fence line's own start.
    await setCursor(panel, chapter.indexOf('```mermaid'));

    const revealed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.diagrams.length === 0 ? snapshot : undefined;
    }, 'the Diagram to reveal');

    assert.ok(revealed.renderedText.includes('graph TD'), `the source should be back: ${revealed.renderedText}`);
    assert.ok(revealed.liveClasses.includes('cm-live-codeblock'), 'it should read as the Code block it is written as');
  });

  test('composes again as soon as the cursor leaves', async function () {
    this.timeout(30000);
    const chapter = chapterAround(DIAGRAM);
    fileUri = await createScratchFile(chapter);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, chapter.indexOf('graph TD'));
    await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.renderedText.includes('graph TD') ? snapshot : undefined;
    }, 'the Diagram to be revealed first');

    await setCursor(panel, 0);

    const snapshot = await drawnDiagram(panel);
    assert.strictEqual(snapshot.diagrams.length, 1);
  });

  test('a click on the picture is the way in — it is the only affordance the mouse has', async function () {
    this.timeout(30000);
    const chapter = chapterAround(DIAGRAM);
    fileUri = await createScratchFile(chapter);
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await drawnDiagram(panel);

    // `clickAt` resolves a document position to a point on screen; the
    // Diagram's own start is the point the picture occupies.
    await clickAt(panel, chapter.indexOf('```mermaid'));

    const revealed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.diagrams.length === 0 ? snapshot : undefined;
    }, 'the click to reveal the Diagram');

    assert.ok(revealed.renderedText.includes('graph TD'), `the source should be back: ${revealed.renderedText}`);
  });

  test('an arrow key steps into the Diagram rather than over it — unlike a hidden marker, it is not atomic', async function () {
    this.timeout(30000);
    const chapter = chapterAround(DIAGRAM);
    fileUri = await createScratchFile(chapter);
    const panel = await openInWritingEditor(fileUri);
    // On the blank line right before the fence, so one step right lands on it.
    await setCursor(panel, chapter.indexOf('```mermaid') - 1);
    await drawnDiagram(panel);

    await moveCursor(panel, 'right');

    const revealed = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.diagrams.length === 0 ? snapshot : undefined;
    }, 'the arrow key to reveal the Diagram');

    assert.ok(revealed.renderedText.includes('graph TD'));
  });

  test('shows the source, not an error, when the diagram cannot be drawn', async function () {
    this.timeout(30000);
    const broken = ['```mermaid', 'esto no describe ningún diagrama', '```'].join('\n');
    fileUri = await createScratchFile(chapterAround(broken));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await waitFor(async () => {
      const current = await requestSnapshot(panel);
      return current.diagrams.length > 0 && current.diagrams[0].fallbackSource !== '' ? current : undefined;
    }, 'the fallback source to be shown');

    assert.strictEqual(snapshot.diagrams[0].drawn, false);
    assert.ok(snapshot.diagrams[0].fallbackSource.includes('esto no describe ningún diagrama'), `the Author should see what they wrote: ${snapshot.diagrams[0].fallbackSource}`);
  });

  test('the picture never bleeds past the measure, however wide the diagram is', async function () {
    this.timeout(30000);
    const wide = ['```mermaid', 'graph LR', '  A[Un nodo con un rótulo muy largo] --> B[Otro rótulo igual de largo] --> C[Y un tercero para rematar] --> D[Y todavía uno más]', '```'].join('\n');
    fileUri = await createScratchFile(chapterAround(wide));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    const snapshot = await drawnDiagram(panel);

    // The plate is inside the measure, and the picture is inside the plate:
    // a diagram wider than the column is scaled down, never bled into the
    // margins — the answer OQ-001 of 009 gave a wide Table, adapted to
    // something that cannot reflow.
    assert.ok(
      snapshot.diagrams[0].right <= snapshot.contentBox.right + 1,
      `the plate (${snapshot.diagrams[0].right}) should stay within the measure (${snapshot.contentBox.right})`
    );
    // And the picture itself, measured rather than inferred: the plate is a
    // full-width block whatever happens inside it, so its own box would say
    // nothing about whether `max-width: 100%` actually scaled the SVG down.
    const measure = snapshot.contentBox.right - snapshot.contentBox.left;
    assert.ok(
      snapshot.diagrams[0].width <= measure + 1,
      `the picture (${snapshot.diagrams[0].width}) should be scaled to the measure (${measure})`
    );
  });

  test('a Diagram typed into a Chapter composes as soon as its fence is closed', async function () {
    this.timeout(30000);
    fileUri = await createScratchFile('Antes.\n\nDespués.');
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);

    await simulateTyping(panel, [{ from: 8, to: 8, insert: `${DIAGRAM}\n\n` }]);
    await setCursor(panel, 0);

    const snapshot = await drawnDiagram(panel);
    assert.strictEqual(snapshot.diagrams.length, 1);
  });

  test('Raw markdown view shows the Diagram as the Code block it is on disk', async function () {
    this.timeout(30000);
    fileUri = await createScratchFile(chapterAround(DIAGRAM));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await drawnDiagram(panel);

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');

    const raw = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.diagrams.length === 0 ? snapshot : undefined;
    }, 'raw markdown to put the source back');

    assert.ok(raw.renderedText.includes('```mermaid'), `the fence should be visible: ${raw.renderedText}`);
    assert.ok(raw.renderedText.includes('graph TD'));

    await vscode.commands.executeCommand('texto.toggleRawMarkdown');
  });
});

suite('Requirement 010: a Diagram follows the Editor theme', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await vscode.workspace.getConfiguration('texto').update('theme', undefined, vscode.ConfigurationTarget.Global);
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('redraws the picture when the theme changes — its palette is baked into the SVG, not read from CSS', async function () {
    this.timeout(30000);
    fileUri = await createScratchFile(chapterAround(DIAGRAM));
    const panel = await openInWritingEditor(fileUri);
    await setCursor(panel, 0);
    await drawnDiagram(panel);

    await vscode.workspace.getConfiguration('texto').update('theme', 'dark', vscode.ConfigurationTarget.Global);

    const dark = await waitFor(async () => {
      const snapshot = await requestSnapshot(panel);
      return snapshot.themeAttribute === 'dark' && snapshot.diagrams.length > 0 && snapshot.diagrams[0].drawn ? snapshot : undefined;
    }, 'the Diagram to be redrawn in Dark');

    // Still one drawn picture after the switch: the widget is rebuilt rather
    // than left showing the light one, and rebuilt into a picture rather
    // than into the fallback.
    assert.strictEqual(dark.diagrams.length, 1);
    assert.strictEqual(dark.diagrams[0].drawn, true);
    assert.ok(dark.diagrams[0].width > 0);
  });
});
