import * as assert from 'assert';
import * as vscode from 'vscode';
import { clickAt, closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor, requestSnapshot, setCursor, waitFor } from './support';

// US-005, US-006, US-007 (006): Links and Images join the Composed subset,
// and a composed Link is followable with Cmd/Ctrl+click (BR-004/DEC-001).

suite('US-005: links composed as their text', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('an inline link reads as its text, with the target hidden', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-link') ? s : undefined;
    }, 'the link to be composed');

    assert.ok(!snapshot.renderedText.includes('https://example.com'), `the target should not be visible: ${snapshot.renderedText}`);
    assert.ok(!snapshot.renderedText.includes('['));
    assert.ok(snapshot.renderedText.includes('este enlace'));
  });

  test('reveals the raw syntax while the cursor touches the link text', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 8); // inside "este enlace"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('[este enlace](https://example.com)') ? s : undefined;
    }, 'the raw link syntax to reappear');

    assert.ok(snapshot.renderedText.includes('[este enlace](https://example.com)'));
  });

  test('stays revealed while the cursor is inside the target — typing the URL must not collapse the Link mid-edit', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 25); // inside "https://example.com"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.renderedText.includes('https://example.com') ? s : undefined;
    }, 'the raw link syntax to stay visible while editing the target');

    assert.ok(snapshot.renderedText.includes('[este enlace](https://example.com)'));
  });

  test('collapses once the cursor moves past the Link — e.g. the space typed right after finishing it', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 39); // one past the closing ")"
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return !s.renderedText.includes('https://example.com') ? s : undefined;
    }, 'the link to collapse once the cursor moves past it');

    assert.ok(!snapshot.renderedText.includes('https://example.com'));
  });

  test('a bare URL is composed distinctly from prose without hiding anything', async () => {
    fileUri = await createScratchFile('Ver https://example.com ahora.');
    const panel = await openInWritingEditor(fileUri);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-link') ? s : undefined;
    }, 'the bare URL to be composed');

    assert.ok(snapshot.renderedText.includes('https://example.com'));
  });

  test('the file keeps the markdown link syntax exactly as written, on save', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);
    await requestSnapshot(panel);

    const document = await vscode.workspace.openTextDocument(fileUri);
    await document.save();
    assert.strictEqual(document.getText(), 'Ver [este enlace](https://example.com) ahora.');
  });
});

suite('US-006: images composed as their alternative text', () => {
  let fileUri: vscode.Uri;

  teardown(async () => {
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('reads as its alternative text, marked distinctly from a Link', async () => {
    fileUri = await createScratchFile('Ver ![una foto](https://example.com/foto.png) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-image') ? s : undefined;
    }, 'the image to be composed');

    assert.ok(!snapshot.liveClasses.includes('cm-live-link'), 'an Image must not also read as a Link');
    assert.ok(!snapshot.renderedText.includes('!['));
    assert.ok(snapshot.renderedText.includes('una foto'));
  });

  test('an empty alt text does not break composition for the rest of the Chapter (Author-reported regression)', async () => {
    // Decoration.mark throws on a zero-length range; an empty alt text
    // ("![](url)") used to produce exactly that, and the throw took down
    // every OTHER decoration in the document with it — a heading and a
    // Link both stayed raw, not just the broken Image.
    const content = '# Título\n\nUn enlace [aa](https://example.com) y una imagen ![](image.png) vacía.';
    fileUri = await createScratchFile(content);
    const panel = await openInWritingEditor(fileUri);
    // Away from position 0 — a fresh panel's cursor starts there by default,
    // which would keep whatever sits at the very start of the Chapter
    // revealed (the heading, here) regardless of this regression.
    await setCursor(panel, content.length);

    const snapshot = await waitFor(async () => {
      const s = await requestSnapshot(panel);
      return s.liveClasses.includes('cm-live-link') ? s : undefined;
    }, 'the rest of the Chapter to compose despite the empty alt text');

    assert.ok(snapshot.liveClasses.includes('cm-live-heading-1'), 'the heading should still compose');
    assert.ok(snapshot.liveClasses.includes('cm-live-link'), 'the Link should still compose');
    assert.ok(!snapshot.renderedText.includes('# Título'), 'the heading hash should be hidden');
    assert.ok(!snapshot.renderedText.includes('https://example.com'), "the Link's target should be hidden");
    // The empty Image is left raw on purpose (nothing to compose from no alt text).
    assert.ok(snapshot.renderedText.includes('![](image.png)'));
  });
});

suite('US-007: following a composed Link', () => {
  let fileUri: vscode.Uri;
  let originalOpenExternal: typeof vscode.env.openExternal;
  let openedUri: vscode.Uri | undefined;

  setup(() => {
    originalOpenExternal = vscode.env.openExternal;
    openedUri = undefined;
    // The webview never navigates itself (BR-004) — the extension host is
    // the one that calls vscode.env.openExternal, a real (and disruptive,
    // if left unstubbed) outward action; stubbing it here proves the
    // message reaches the host with the right target, without actually
    // launching a browser during the test run.
    (vscode.env as { openExternal: typeof vscode.env.openExternal }).openExternal = async (uri) => {
      openedUri = uri;
      return true;
    };
  });

  teardown(async () => {
    (vscode.env as { openExternal: typeof vscode.env.openExternal }).openExternal = originalOpenExternal;
    await closeAllEditors();
    await deleteScratchFile(fileUri);
  });

  test('Cmd/Ctrl+click on the composed link text opens its target', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-link') ? true : undefined), 'the link to be composed');

    await clickAt(panel, 8, { meta: true, ctrl: true }); // inside "este enlace"

    await waitFor(() => (openedUri ? true : undefined), 'the extension host to receive the link');
    assert.strictEqual(openedUri?.toString(), 'https://example.com/');
  });

  test('a plain click, without the modifier, does not open the target', async () => {
    fileUri = await createScratchFile('Ver [este enlace](https://example.com) ahora.');
    const panel = await openInWritingEditor(fileUri);

    await setCursor(panel, 0);
    await waitFor(async () => ((await requestSnapshot(panel)).liveClasses.includes('cm-live-link') ? true : undefined), 'the link to be composed');

    await clickAt(panel, 8);

    // No event to wait for here — asserting a negative, so a short grace
    // period stands in for "nothing happened".
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.strictEqual(openedUri, undefined);
  });
});
