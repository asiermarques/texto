import * as path from 'path';
import Mocha from 'mocha';
import { findTestFiles } from './glob';
import { closeAllEditors, createScratchFile, deleteScratchFile, openInWritingEditor } from './support';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname);

  const files = findTestFiles({ cwd: testsRoot });
  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  // The first Writing editor opened in a run pays for what none of the
  // others do: activating the extension host, loading and JIT-ing the
  // webview bundle, the webview's first paint. Measured on a GitHub Actions
  // runner that cold start alone approached the 20s per-test budget, while
  // every subsequent test in the same file finished in ~150ms — so whichever
  // test happened to run first failed on cost that was never its own.
  //
  // Paying it here, in a root hook with its own budget, keeps the per-test
  // timeout tight (a genuinely hung test still fails fast) and makes the
  // cold start visible as itself rather than as a mystery failure in an
  // unrelated assertion about typography.
  mocha.suite.beforeAll('warm up the extension host and the webview', async function () {
    this.timeout(120000);
    const uri = await createScratchFile('Calentando el host de la extensión.');
    try {
      await openInWritingEditor(uri);
    } finally {
      await closeAllEditors();
      await deleteScratchFile(uri);
    }
  });

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
