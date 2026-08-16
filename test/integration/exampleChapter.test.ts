import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { closeAllEditors, deleteScratchFile, openInWritingEditor, requestSnapshot, scrollToEnd, waitFor } from './support';

// US-018: the example Chapter is a real fixture, not just prose about the
// feature — opening it must show every construct the extended Composed
// subset added actually composed, not just present in the file.

suite('US-018: examples/espacio-de-escritura/ composes the whole extended subset', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
  });

  test('opens with every new construct composed', async () => {
    const sourcePath = path.join(__dirname, '..', '..', '..', 'examples', 'espacio-de-escritura', 'notas-de-no-ficcion.md');
    const content = await fs.promises.readFile(sourcePath, 'utf8');
    // A scratch copy, not the real file: opening it must not risk writing
    // back to the example itself if a change event fires during the test.
    const scratchDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'texto-example-'));
    fileUri = vscode.Uri.file(path.join(scratchDir, 'notas-de-no-ficcion.md'));
    await fs.promises.writeFile(fileUri.fsPath, content, 'utf8');

    const panel = await openInWritingEditor(fileUri);
    const top = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.length > 5 ? s : undefined;
    }, 'the example Chapter to finish composing');
    await scrollToEnd(panel);
    const bottom = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-apparatus') ? s : undefined;
    }, 'the end of the Chapter (the Footnote definition) to scroll into view');

    // CodeMirror only renders lines near the viewport: scrolling to the end
    // to see the Footnote definition can legitimately push the heading back
    // out of the DOM, so no single snapshot is guaranteed to contain every
    // class — the union of "top of the Chapter" and "bottom of the Chapter"
    // is what actually covers the whole file.
    const seenClasses = new Set([...top.liveClasses, ...bottom.liveClasses]);
    const expectedClasses = [
      'cm-live-heading-1',
      'cm-live-heading-2',
      'cm-live-strong',
      'cm-live-strikethrough',
      'cm-live-link',
      'cm-live-code',
      'cm-live-codeblock',
      'cm-live-task-checked',
      'cm-live-task-unchecked',
      'cm-live-list-depth-1',
      'cm-live-list-depth-2',
      'cm-live-footnote-ref',
      'cm-live-apparatus',
    ];
    for (const cls of expectedClasses) {
      assert.ok(seenClasses.has(cls), `expected ${cls} to be composed somewhere in the example Chapter — got: ${[...seenClasses].join(', ')}`);
    }

    await deleteScratchFile(fileUri);
  });
});
