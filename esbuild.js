// Bundles the extension host code and the webview code, and copies the
// webview's static assets (stylesheet, bundled font) into dist/media.
//
// Two separate bundles because they run in different worlds: extension.js
// runs under Node inside the extension host (vscode module is external,
// resolved at runtime by VSCode); webview.js runs in a browser-like webview
// context and must be fully self-contained (no Node globals).

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');
const distDir = path.join(__dirname, 'dist');
const mediaDir = path.join(distDir, 'media');

function copyMediaAssets() {
  fs.mkdirSync(mediaDir, { recursive: true });

  fs.copyFileSync(
    path.join(__dirname, 'src', 'webview', 'styles.css'),
    path.join(mediaDir, 'styles.css')
  );

  const fontFilesDir = path.join(
    __dirname,
    'node_modules',
    '@fontsource-variable',
    'literata',
    'files'
  );
  const fontFiles = [
    'literata-latin-wght-normal.woff2',
    'literata-latin-wght-italic.woff2',
  ];
  for (const file of fontFiles) {
    fs.copyFileSync(path.join(fontFilesDir, file), path.join(mediaDir, file));
  }

  const fontsCss = `/* Subconjunto latino de Literata Variable, empaquetado localmente. */
/* Fuente: @fontsource-variable/literata (SIL Open Font License 1.1). */
@font-face {
  font-family: 'Literata Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 200 900;
  src: url(./literata-latin-wght-normal.woff2) format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

@font-face {
  font-family: 'Literata Variable';
  font-style: italic;
  font-display: swap;
  font-weight: 200 900;
  src: url(./literata-latin-wght-italic.woff2) format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
`;
  fs.writeFileSync(path.join(mediaDir, 'fonts.css'), fontsCss);
}

async function main() {
  // US-005 (008): `npm run build` (and therefore `vscode:prepublish` and the
  // release pipeline) ships minified, source-map-free bundles — half the
  // JavaScript for V8 to parse at activation and at every panel open.
  // `npm run watch`, used while developing, keeps today's unminified,
  // source-mapped output, so debugging stays unchanged. RISK-003: the byte
  // metrics in test/performance/baseline.json now track the minifier's
  // output as well as the code — an esbuild version bump can move them for a
  // reason that isn't a regression, and that's accepted deliberately.
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: watch,
    minify: !watch,
    logLevel: 'info',
  });

  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    sourcemap: watch,
    minify: !watch,
    logLevel: 'info',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    copyMediaAssets();
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    copyMediaAssets();
    await extensionCtx.dispose();
    await webviewCtx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
