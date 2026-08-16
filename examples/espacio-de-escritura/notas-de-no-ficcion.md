# Notas sobre cómo escribo software

Notas de trabajo, no ficción — el tipo de texto que el requisito 006 añadió
al **Subconjunto compuesto**. Ábrelo en el Editor de escritura para ver cada
construcción compuesta a la vez.

## El editor, en una frase

Un editor a medida dentro de VSCode, con **markdown oculto** y la referencia
de trato tipográfico de [iA Writer](https://ia.net/writer). Algunas
decisiones ~~se descartaron~~ se mantuvieron desde el primer día — ajustes
como `texto.focusMode` se explican en `docs/ARCHITECTURE.md`.

```ts
export function countWords(text: string): number {
  return countWordsInRange(text, 0, text.length);
}
```

Pendiente antes de publicar:

- [x] Componer los enlaces y el código en línea
- [ ] Revisar la medida con un capítulo largo de verdad
  - [x] Medir `computeLivePreviewInstructions`
  - [ ] Repetir la medición en otra máquina

Todo esto se apoya en una extensión al analizador que no existía antes de
este requisito[^footnote-parser].

[^footnote-parser]: Ver `src/domain/footnotes.ts` — la única dependencia nueva del requisito 006 (BR-003).
