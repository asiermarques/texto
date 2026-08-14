import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-013: the composition does not move when the cursor moves (DEC-003).
//
// Entering the line of a heading, a list, a blockquote or a Scene break
// reveals its markdown marker and nothing else: the composition class (the
// one that fixes the look — heading size, indent, rail, reserved height)
// stays applied whether or not the cursor is on it; only the marker
// substitute (the bullet and the "⁂") depends on the real marker being
// hidden.

suite('US-013: the composition does not move when the cursor moves', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('a heading keeps its composition class with the cursor inside', async () => {
    fileUri = await createScratchFile('## Un título\n\nUn párrafo cualquiera.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 20); // in the paragraph, outside the heading
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-heading-2') ? true : undefined), 'the heading to be composed');

    await setCursor(panel, 5); // inside "## Un título"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('##') ? s : undefined;
    }, 'the hash to reappear');

    assert.ok(snapshot.liveClasses.includes('cm-live-heading-2'), 'the heading lost its weight/size when the cursor entered');
  });

  test('a blockquote keeps its rail with the cursor inside', async () => {
    fileUri = await createScratchFile('> Una cita.\n\nUn párrafo.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 20); // in the paragraph, outside the blockquote
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-blockquote') ? true : undefined), 'the blockquote to be composed');

    await setCursor(panel, 3); // inside the blockquote
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('>') ? s : undefined;
    }, 'the ">" marker to reappear');

    assert.ok(snapshot.liveClasses.includes('cm-live-blockquote'), 'the blockquote lost its rail when the cursor entered');
  });

  test('a list item keeps its indent with the cursor inside, and does not show the marker and the bullet at once', async () => {
    fileUri = await createScratchFile('- único elemento\n\nUn párrafo.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 25); // in the paragraph, outside the list
    const away = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-list-bullet-mark') ? s : undefined;
    }, 'the bullet to be composed');
    assert.ok(away.liveClasses.includes('cm-live-list-bullet'), 'the indent class is missing with the bullet composed');

    await setCursor(panel, 3); // inside "único elemento"
    const active = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('- único elemento') ? s : undefined;
    }, 'the dash to reappear');

    assert.ok(active.liveClasses.includes('cm-live-list-bullet'), 'the indent disappeared when the cursor entered');
    assert.ok(!active.liveClasses.includes('cm-live-list-bullet-mark'), 'the real dash and the composed bullet are both visible');
  });

  test('a Scene break keeps its place with the cursor inside, and does not show the dashes and the "⁂" at once', async () => {
    fileUri = await createScratchFile('Primera escena.\n\n---\n\nSegunda escena.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0); // in the first Scene, outside the break
    const away = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-scene-break-mark') ? s : undefined;
    }, 'the "⁂" to be composed');
    assert.ok(away.liveClasses.includes('cm-live-scene-break'), 'the class reserving the break\'s place is missing');

    await setCursor(panel, 18); // on the "---" line
    const active = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('---') ? s : undefined;
    }, 'the dashes to reappear');

    assert.ok(active.liveClasses.includes('cm-live-scene-break'), 'the Scene break lost its reserved place when the cursor entered');
    assert.ok(!active.liveClasses.includes('cm-live-scene-break-mark'), 'the real dashes and the composed "⁂" are both visible');
  });
});
