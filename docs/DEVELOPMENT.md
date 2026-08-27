# Development

Building the extension, running it from source, and the test suites. The
shape of the code — the layers, the two bundles, the conventions — is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Build

```sh
npm install
npm run build        # bundles the extension and the webview into dist/
npm run watch        # same, in watch mode
npm run typecheck    # tsc --noEmit over the whole project
```

To try it without installing anything: open this folder in VSCode and press
`F5` (*Run and Debug → Run Extension*) — a second window opens with the
extension loaded from source.

To install a build in your own VSCode, package it and install the `.vsix`:

```sh
npx @vscode/vsce package
```

Then Extensions panel → `…` menu → **Install from VSIX…**, and reload any
window already open (`Developer: Reload Window`), since only new windows
pick it up.

## Tests

```sh
npm run test:unit          # vitest — the pure logic in src/domain
npm run test:performance   # vitest — Operation count + bundle bytes vs a committed baseline
npm run report:performance # prints current measurements next to the baseline; writes nothing
npm run test:integration   # @vscode/test-electron — a real VSCode, end to end
npm test                   # all three
```

The first `test:integration` run downloads a copy of VSCode into
`.vscode-test/` (not distributed, only used to run the tests).

`test:performance` builds first and compares a handful of deterministic
metrics (full parses per keystroke and per cursor move, decorations built,
bundle bytes) against `test/performance/baseline.json`, failing on any
difference — a regression or an unrecorded improvement alike. It also runs
from a versioned pre-commit hook (enabled automatically on `npm install`)
and as a step in CI, so a skipped hook still gets caught.

`TEXTO_TEST_FILTER=<substring> npm run test:integration` runs only the
integration files whose name contains `<substring>` — faster than a full
VSCode boot on every change. Unset, it runs the whole suite, which CI and
any task's closing check always use.

## Releasing

Tagged releases are published to the VS Code Marketplace and to the Open VSX
Registry from CI; the version in the `.vsix`'s name comes from
`package.json`.
