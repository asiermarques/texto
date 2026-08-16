import * as vscode from 'vscode';
import { clickAt, closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, pasteText, pressKey, requestSnapshot, setSelection, waitFor, waitForText } from './support';

// US-013, US-014, US-015, US-016 (006): producing the composed material
// from the keyboard, with the syntax hidden — Slice 6 of the plan.

suite('US-013: strong/emphasis from the keyboard', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('Cmd/Ctrl+B wraps the selection in "**", and the file contains it', async () => {
    fileUri = await createScratchFile('Un párrafo con texto.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Un párrafo con '.length;
    const to = from + 'texto'.length;
    await setSelection(panel, from, to);

    await pressKey(panel, 'b', { mod: true });

    await waitForText(fileUri, 'Un párrafo con **texto**.');
  });

  test('pressing it again on the same (now wrapped) text removes the markers', async () => {
    fileUri = await createScratchFile('Un párrafo con **texto**.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Un párrafo con **'.length;
    const to = from + 'texto'.length;
    await setSelection(panel, from, to);

    await pressKey(panel, 'b', { mod: true });

    await waitForText(fileUri, 'Un párrafo con texto.');
  });

  test('Cmd/Ctrl+I wraps the selection in a single "*"', async () => {
    fileUri = await createScratchFile('Un párrafo con texto.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Un párrafo con '.length;
    const to = from + 'texto'.length;
    await setSelection(panel, from, to);

    await pressKey(panel, 'i', { mod: true });

    await waitForText(fileUri, 'Un párrafo con *texto*.');
  });
});

suite('US-014: a Link from the keyboard and by pasting', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('Cmd/Ctrl+K wraps the selection as "[selection]()"', async () => {
    fileUri = await createScratchFile('Cita esta fuente ahora.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Cita '.length;
    const to = from + 'esta fuente'.length;
    await setSelection(panel, from, to);

    await pressKey(panel, 'k', { mod: true });

    await waitForText(fileUri, 'Cita [esta fuente]() ahora.');
  });

  test("RISK-002: the Mod-Alt-K fallback works the same way, for when Mod-K is VSCode's own chord prefix", async () => {
    fileUri = await createScratchFile('Cita esta fuente ahora.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Cita '.length;
    const to = from + 'esta fuente'.length;
    await setSelection(panel, from, to);

    await pressKey(panel, 'k', { mod: true, alt: true });

    await waitForText(fileUri, 'Cita [esta fuente]() ahora.');
  });

  test('pasting a URL over a selection produces a Link instead of replacing the words', async () => {
    fileUri = await createScratchFile('Cita esta fuente ahora.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Cita '.length;
    const to = from + 'esta fuente'.length;
    await setSelection(panel, from, to);

    await pasteText(panel, 'https://example.com');

    await waitForText(fileUri, 'Cita [esta fuente](https://example.com) ahora.');
  });

  test('EDGE-007: pasting a URL over an existing Link\'s text replaces only its target', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://old.example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Ver ['.length;
    const to = from + 'este enlace'.length;
    await setSelection(panel, from, to);

    await pasteText(panel, 'https://new.example.com');

    await waitForText(fileUri, 'Ver [este enlace](https://new.example.com) ahora.');
  });

  test('pasting plain text (not a URL) over a selection behaves like an ordinary paste', async () => {
    fileUri = await createScratchFile('Cita esta fuente ahora.');
    const panel = await openInWritingEditor(fileUri);
    const from = 'Cita '.length;
    const to = from + 'esta fuente'.length;
    await setSelection(panel, from, to);

    await pasteText(panel, 'otra cosa');

    await waitForText(fileUri, 'Cita otra cosa ahora.');
  });
});

suite('US-015: Enter continues the list, the Task and the quote', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('continues a bullet list item with the same marker', async () => {
    fileUri = await createScratchFile('- primero');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);
    await setSelection(panel, snapshot.text.length, snapshot.text.length);

    await pressKey(panel, 'Enter');

    await waitForText(fileUri, '- primero\n- ');
  });

  test('continues a Task list item with an empty box', async () => {
    fileUri = await createScratchFile('- [x] hecho');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);
    await setSelection(panel, snapshot.text.length, snapshot.text.length);

    await pressKey(panel, 'Enter');

    await waitForText(fileUri, '- [x] hecho\n- [ ] ');
  });

  test('on an empty item, Enter removes the marker instead of adding a new one', async () => {
    fileUri = await createScratchFile('- primero\n- ');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);
    await setSelection(panel, snapshot.text.length, snapshot.text.length);

    await pressKey(panel, 'Enter');

    await waitForText(fileUri, '- primero\n');
  });

  test('an ordinary Paragraph is unaffected — Enter inserts a plain newline', async () => {
    fileUri = await createScratchFile('Un párrafo.');
    const panel = await openInWritingEditor(fileUri);
    const snapshot = await requestSnapshot(panel);
    await setSelection(panel, snapshot.text.length, snapshot.text.length);

    await pressKey(panel, 'Enter');

    await waitForText(fileUri, 'Un párrafo.\n');
  });
});

suite('US-016: click to toggle a Task', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('clicking the composed box ticks an unchecked Task', async () => {
    fileUri = await createScratchFile('- [ ] tarea sin hacer');
    const panel = await openInWritingEditor(fileUri);
    await waitForComposedTask(panel);

    await clickAt(panel, 3); // inside the "[ ]" marker

    await waitForText(fileUri, '- [x] tarea sin hacer');
  });

  test('clicking again unticks it', async () => {
    fileUri = await createScratchFile('- [x] tarea hecha');
    const panel = await openInWritingEditor(fileUri);
    await waitForComposedTask(panel);

    await clickAt(panel, 3);

    await waitForText(fileUri, '- [ ] tarea hecha');
  });
});

async function waitForComposedTask(panel: vscode.WebviewPanel): Promise<void> {
  await waitFor(async () => {
    const s = await requestSnapshot(panel);
    return s.liveClasses.some((c) => c.startsWith('cm-live-task')) ? true : undefined;
  }, 'the Task to be composed');
}
