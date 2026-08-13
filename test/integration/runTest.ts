import * as path from 'path';
import { runTests } from '@vscode/test-electron';

const vscodeUri = (fsPath: string): string => `file://${encodeURI(fsPath)}`;

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './index');
  // Resolved against the *sources*, not against `__dirname`: this file runs
  // from `out/test/integration/`, and tsc does not copy the fixtures
  // directory there. Pointing at the non-existent compiled path made VSCode
  // open an empty window instead, which is why no test could reach a
  // Writing space's own `.vscode/settings.json`.
  const workspacePath = path.resolve(extensionDevelopmentPath, 'test/integration/fixtures');

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // `--folder-uri`, not a bare positional path: only the former actually
      // opens the fixtures directory as a workspace folder, which is what
      // lets a test exercise a Writing space's own
      // `.vscode/settings.json` (folder-scoped preferences) instead of only
      // Global-scoped ones.
      launchArgs: [`--folder-uri=${vscodeUri(workspacePath)}`, '--disable-extensions'],
    });
  } catch (err) {
    console.error('The integration test run failed.', err);
    process.exit(1);
  }
}

void main();
