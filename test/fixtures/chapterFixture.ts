/**
 * A synthetic **Chapter** using every construct requirement 006 added
 * (Links, Code blocks, Tasks, Footnotes, nested lists, setext headings…),
 * parameterised by section count so a caller can pick a typical-length or a
 * long **Chapter**.
 *
 * Originally private to `test/unit/livePreviewLatency.test.ts` (US-017);
 * extracted for requirement 007 (ASM-003) so the performance check
 * (`test/performance/performanceCheck.test.ts`) measures the same Chapter
 * the latency guard already does, rather than a second, silently-diverging
 * fixture.
 */
export function buildChapterFixture(sections: number): string {
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
