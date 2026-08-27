/**
 * The **Table** every section carries (US-004 of 009): several **Rows**,
 * uneven column widths, and — deliberately — already padded. A keystroke
 * measured in an unpadded **Table** would pay the one-off cost of aligning
 * a sloppy one; what US-004 guards is the steady-state cost, what typing in
 * a **Table** that is already aligned costs on every keystroke.
 */
const SECTION_TABLE = [
  '| Escena | Personaje | Estado    |',
  '|--------|-----------|-----------|',
  '| 1      | Ana       | Pendiente |',
  '| 2      | Beto      | Revisada  |',
  '| 3      | Carmen    | Terminada |',
].join('\n');

/**
 * The **Cell** a measured keystroke lands at the end of
 * (`test/performance/measure.ts`): the widest **Cell** of its column, so
 * one character widens the column and every other **Row** has to follow —
 * the case the padding actually costs something.
 */
export const MEASURED_TABLE_CELL = 'Personaje';

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
 * fixture. US-004 of 009 added the **Table** every section carries.
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
    paragraphs.push(SECTION_TABLE);
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
