import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-011, US-012 (006): setext headings compose like their ATX equivalents
// (with the Scene break's own "---" reading unaffected), and Footnotes and
// Reference definitions join the Composed subset as the text's apparatus.

suite('US-011: setext headings compose like ATX headings', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('a title written in setext style composes as a heading, with the underline hidden', async () => {
    fileUri = await createScratchFile('Título\n======\n\nUn párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 30); // in the paragraph, away from the heading
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-heading-1') ? s : undefined;
    }, 'the setext heading to be composed');

    assert.ok(!snapshot.renderedText.includes('======'), `the underline should not be visible: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('Título'));
  });

  test('reveals the underline while the cursor is on its own line', async () => {
    fileUri = await createScratchFile('Título\n======');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 9); // on the "======" line
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('======') ? s : undefined;
    }, 'the underline to reappear');

    // CodeMirror's contentDOM renders each source line as its own block
    // element, so textContent joins them without a literal "\n" — check
    // each line's text separately rather than the two joined by one.
    assert.ok(snapshot.renderedText.includes('Título'));
    assert.ok(snapshot.renderedText.includes('======'));
  });

  test('DEC-003: a Scene break written with a blank line above it is unaffected', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-scene-break') ? s : undefined;
    }, 'the Scene break to stay composed as a Scene break');

    assert.ok(!snapshot.liveClasses.includes('cm-live-heading-2'), 'a real Scene break must not read as a setext H2');
  });

  test('the file keeps the setext underline exactly as written, on save', async () => {
    fileUri = await createScratchFile('Título\n======');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), 'Título\n======');
  });
});

suite('US-012: footnotes composed', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('the call reads as a superscript, its definition as a discreet block apart from the prose', async () => {
    fileUri = await createScratchFile('Texto con nota[^1] al pie.\n\n[^1]: La nota completa aquí.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-footnote-ref') && s.liveClasses.includes('cm-live-apparatus') ? s : undefined;
    }, 'both the call and the definition to be composed');

    // The call's own marks hide, so it reads as "nota1 al pie" — but the
    // definition's marker ("[^1]:") stays visible by design (it is the only
    // label the Author has for which note this is, see livePreview.ts).
    assert.ok(snapshot.renderedText.includes('nota1 al pie'), `the call should compose with its marks hidden: ${snapshot.renderedText}`);
    assert.ok(snapshot.renderedText.includes('[^1]: La nota completa aquí.'));
  });

  test('the definition composes its own text inline (bold, links…), same as a Paragraph', async () => {
    fileUri = await createScratchFile('[^1]: Una nota con **negrita**.');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-strong') ? s : undefined;
    }, "the definition's own bold to compose");

    assert.ok(!snapshot.renderedText.includes('**'));
  });

  test('the file keeps the call and the definition exactly as written, on save', async () => {
    fileUri = await createScratchFile('Texto con nota[^1] al pie.\n\n[^1]: La nota completa aquí.');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), 'Texto con nota[^1] al pie.\n\n[^1]: La nota completa aquí.');
  });
});

suite('US-012: reference definitions composed', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('composes as a discreet block, without hiding the label or the URL', async () => {
    fileUri = await createScratchFile('Ver [este enlace][ref] ahora.\n\n[ref]: https://example.com');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-apparatus') ? s : undefined;
    }, 'the reference definition to be composed');

    assert.ok(snapshot.renderedText.includes('[ref]'));
    assert.ok(snapshot.renderedText.includes('https://example.com'));
  });
});
