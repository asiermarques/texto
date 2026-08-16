import { describe, expect, it } from 'vitest';
import { computeDimmedRanges } from '../../src/domain/focusMode';
import { computeLivePreviewInstructions } from '../../src/domain/livePreview';

/**
 * US-017 (RISK-001): "measure first" — a Chapter using every construct this
 * requirement added (Links, Code blocks, Tasks, Footnotes, nested lists,
 * setext headings…), timed the way a real keystroke costs it: one
 * `computeLivePreviewInstructions` call and one `computeDimmedRanges` call,
 * both re-parsing the whole Chapter, exactly as
 * src/webview/livePreviewPlugin.ts and src/webview/focusModePlugin.ts do on
 * every `docChanged`/`selectionSet` update.
 *
 * The budget: 40ms combined, well past the ~16ms a single 60fps frame
 * allows and further still past the ~100ms past which a keystroke starts
 * reading as laggy — deliberately loose, because this suite runs this test
 * alongside everything else in test/unit/, sharing the machine's CPU with
 * transform/collect work vitest is doing at the same time (measured in
 * isolation, both fixtures come in under 11ms; sharing the run with the
 * rest of the suite pushes that as high as ~19ms). The budget only needs
 * to catch a real, order-of-magnitude regression — a flaky pass/fail on
 * system noise would defeat the point of measuring at all. Repeated 20
 * times and taking the median rather than a single sample, so one slow
 * tick (GC, OS scheduling) doesn't decide the result either.
 *
 * Result (see the console output when this test runs): comfortably inside
 * budget at both sizes tried. RISK-001's mitigation (sharing a single
 * parse between Live preview and Focus mode) is NOT taken here, per the
 * plan: "worth its own requirement rather than a rushed slice" if a future
 * measurement ever asks for it.
 */
function buildFixture(sections: number): string {
  const paragraphs: string[] = [];
  paragraphs.push('# Un ensayo de prueba');
  paragraphs.push(
    'Este es un párrafo de apertura con **negrita**, *cursiva*, ~~texto tachado~~ y `código en línea`, además de un [enlace](https://example.com) y una imagen ![alt](https://example.com/foto.png).'
  );
  for (let section = 1; section <= sections; section++) {
    paragraphs.push(`## Sección ${section}`);
    for (let p = 0; p < 6; p++) {
      paragraphs.push(
        `Párrafo ${p} de la sección ${section}, con texto suficiente para simular prosa real de un capítulo largo, incluyendo una nota al pie[^${section}-${p}] y una referencia a [otro sitio][ref-${section}].`
      );
    }
    paragraphs.push('- Un elemento de lista\n  - Un elemento anidado\n    - Un elemento doblemente anidado\n- [ ] Una tarea pendiente\n- [x] Una tarea hecha');
    paragraphs.push('> Una cita relevante para esta sección, con varias palabras de contexto.');
    paragraphs.push('```js\nfunction ejemplo() {\n  return "código de ejemplo";\n}\n```');
    paragraphs.push('Título de subsección\n--------------------');
  }
  for (let section = 1; section <= sections; section++) {
    for (let p = 0; p < 6; p++) {
      paragraphs.push(`[^${section}-${p}]: Texto de la nota al pie para la sección ${section}, párrafo ${p}.`);
    }
    paragraphs.push(`[ref-${section}]: https://example.com/seccion-${section}`);
  }
  return paragraphs.join('\n\n');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(text: string): number {
  const cursor = { from: Math.floor(text.length / 2), to: Math.floor(text.length / 2) };
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    computeLivePreviewInstructions(text, cursor);
    computeDimmedRanges(text, cursor);
    samples.push(performance.now() - start);
  }
  return median(samples);
}

const BUDGET_MS = 40;

describe('Live preview / Focus mode latency — US-017 (RISK-001)', () => {
  it('stays under budget on a typical-length Chapter (~3,000 words)', () => {
    const text = buildFixture(12);
    const medianMs = measure(text);
    // eslint-disable-next-line no-console
    console.log(`~3,000 words (${text.length} chars): median ${medianMs.toFixed(2)}ms over 20 runs (budget ${BUDGET_MS}ms).`);
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });

  it('stays under budget on a long Chapter (~6,000 words)', () => {
    const text = buildFixture(24);
    const medianMs = measure(text);
    // eslint-disable-next-line no-console
    console.log(`~6,000 words (${text.length} chars): median ${medianMs.toFixed(2)}ms over 20 runs (budget ${BUDGET_MS}ms).`);
    expect(medianMs).toBeLessThan(BUDGET_MS);
  });
});
