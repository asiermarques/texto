import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// US-004: everything VSCode renders from package.json (Settings UI text,
// command titles, the Writing editor's displayName) resolves through
// package.nls.json / package.nls.es.json instead of being a literal string.
// RISK-002: the test host has no Spanish language pack (it launches with
// --disable-extensions), so the only language this suite can assert
// end-to-end is the host's own — stable, and always English in CI. The
// Spanish bundle is covered by test/unit/packageNls.test.ts's key-parity
// check instead.

const EXTENSION_ID = 'asiermarques.texto';

function loadedExtension(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) {
    throw new Error(`The extension "${EXTENSION_ID}" is not loaded in the test host.`);
  }
  return extension;
}

function contributedPackageJson(): Record<string, unknown> {
  return loadedExtension().packageJSON as Record<string, unknown>;
}

// Read straight off the source file, the same way runTest.ts resolves the
// fixtures directory: this test file runs from out/test/integration/, and
// tsc does not copy package.nls.json there, but `extensionPath` is the real
// (unbundled) repository root in dev-mode launches (RISK-002).
function englishBundleFromDisk(): Record<string, string> {
  const raw = fs.readFileSync(path.join(loadedExtension().extensionPath, 'package.nls.json'), 'utf8');
  return JSON.parse(raw) as Record<string, string>;
}

suite('US-004: the manifest speaks both languages', () => {
  test('no %key% placeholder survives into what VSCode actually loaded', () => {
    const raw = JSON.stringify(contributedPackageJson());
    assert.ok(!/%[\w.]+%/.test(raw), `an unresolved %key% placeholder remains in the loaded manifest: ${raw.match(/%[\w.]+%/)}`);
  });

  test("the Writing editor's displayName resolves to the English bundle's wording", () => {
    const englishBundle = englishBundleFromDisk();
    const packageJson = contributedPackageJson();
    const customEditors = (packageJson.contributes as Record<string, unknown>).customEditors as Array<Record<string, unknown>>;
    assert.strictEqual(customEditors[0].displayName, englishBundle['writing-editor.displayName']);
  });

  test('every command title resolves to the English bundle exactly', () => {
    const englishBundle = englishBundleFromDisk();
    const packageJson = contributedPackageJson();
    const commands = (packageJson.contributes as Record<string, unknown>).commands as Array<Record<string, string>>;
    const expected: Record<string, string> = {
      'texto.toggleFocusMode': 'command.toggleFocusMode.title',
      'texto.increaseTextSize': 'command.increaseTextSize.title',
      'texto.decreaseTextSize': 'command.decreaseTextSize.title',
      'texto.resetTextSize': 'command.resetTextSize.title',
      'texto.toggleRawMarkdown': 'command.toggleRawMarkdown.title',
      'texto.toggleFrontmatter': 'command.toggleFrontmatter.title',
      'texto.insertTable': 'command.insertTable.title',
      'texto.showVersion': 'command.showVersion.title',
      'texto.openWithTexto': 'command.openWithTexto.title',
      'texto.openAsMarkdown': 'command.openAsMarkdown.title',
    };
    for (const command of commands) {
      const nlsKey = expected[command.command];
      assert.ok(nlsKey, `unexpected command in the manifest: ${command.command}`);
      assert.strictEqual(command.title, englishBundle[nlsKey]);
    }
  });

  test("every texto.* setting's description resolves to the English bundle", () => {
    const englishBundle = englishBundleFromDisk();
    const packageJson = contributedPackageJson();
    const configuration = (packageJson.contributes as Record<string, unknown>).configuration as Record<string, unknown>;
    const properties = configuration.properties as Record<string, Record<string, unknown>>;
    assert.strictEqual(properties['texto.focusMode'].description, englishBundle['configuration.focusMode.description']);
    assert.strictEqual(properties['texto.theme'].description, englishBundle['configuration.theme.description']);
    assert.deepStrictEqual(properties['texto.theme'].enumDescriptions, [
      englishBundle['configuration.theme.enumDescriptions.light'],
      englishBundle['configuration.theme.enumDescriptions.dark'],
      englishBundle['configuration.theme.enumDescriptions.vscode'],
    ]);
    assert.strictEqual(properties['texto.textSize'].description, englishBundle['configuration.textSize.description']);
    assert.strictEqual(properties['texto.alignment'].description, englishBundle['configuration.alignment.description']);
    assert.deepStrictEqual(properties['texto.alignment'].enumDescriptions, [
      englishBundle['configuration.alignment.enumDescriptions.left'],
      englishBundle['configuration.alignment.enumDescriptions.right'],
      englishBundle['configuration.alignment.enumDescriptions.justified'],
    ]);
  });

  test('the "open with" context menu entries are contributed for markdown files', () => {
    const packageJson = contributedPackageJson();
    const menus = (packageJson.contributes as Record<string, unknown>).menus as Record<string, Array<Record<string, string>>>;
    for (const location of ['explorer/context', 'editor/title/context']) {
      const commands = menus[location].map((entry) => entry.command);
      assert.ok(commands.includes('texto.openWithTexto'), `${location} is missing texto.openWithTexto`);
      assert.ok(commands.includes('texto.openAsMarkdown'), `${location} is missing texto.openAsMarkdown`);
    }
  });
});
