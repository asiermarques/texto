import * as fs from 'fs';
import * as path from 'path';

/** A tiny recursive `**\/*.test.js` finder, so we don't need a glob dependency. */
export function findTestFiles(options: { cwd: string }): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        results.push(path.relative(options.cwd, full));
      }
    }
  }

  walk(options.cwd);
  // Local-iteration escape hatch, not used by the closing sequence: filters
  // by filename substring so a slice under development doesn't need the
  // whole suite (a full VSCode boot) on every change.
  const filter = process.env.TEXTO_TEST_FILTER;
  return filter ? results.filter((file) => file.includes(filter)) : results;
}
