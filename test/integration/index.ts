import * as path from 'path';
import Mocha from 'mocha';
import { findTestFiles } from './glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const testsRoot = path.resolve(__dirname);

  const files = findTestFiles({ cwd: testsRoot });
  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

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
