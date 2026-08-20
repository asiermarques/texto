import { describe, expect, it } from 'vitest';
import { countWords, formatWordCountStatus, type WordCountStrings } from '../../src/domain/wordCount';
import { countWordsInRange } from '../helpers/domainTestHelpers';

describe('countWords — US-020 (F-006): prose, not markdown', () => {
  it('counts an empty Chapter as zero words', () => {
    expect(countWords('')).toBe(0);
  });

  it('counts plain words separated by whitespace', () => {
    expect(countWords('Hola mundo')).toBe(2);
    expect(countWords('Un párrafo con varias palabras seguidas.')).toBe(6);
  });

  it('does not count a heading mark as a word', () => {
    expect(countWords('## Título')).toBe(1);
    expect(countWords('# Un título con varias palabras')).toBe(5);
  });

  it('counts emphasis content as one word, without the asterisks', () => {
    expect(countWords('**negrita**')).toBe(1);
    expect(countWords('Antes **en medio** después')).toBe(4);
    expect(countWords('Antes *en medio* después')).toBe(4);
  });

  it('does not count a Scene break as any words', () => {
    expect(countWords('---')).toBe(0);
    expect(countWords('Primero.\n\n---\n\nSegundo.')).toBe(2);
  });

  it('does not count the blockquote marker', () => {
    expect(countWords('> cita larga')).toBe(2);
  });

  it('does not count list markers', () => {
    expect(countWords('- item uno\n- item dos')).toBe(4);
    expect(countWords('1. primero\n2. segundo')).toBe(2);
  });

  it('FR-007 (006): a Code block\'s contents are not prose words', () => {
    expect(countWords('Antes.\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nDespués.')).toBe(2);
    expect(countWords('Antes.\n\n    indented code\n    second line\n\nDespués.')).toBe(2);
  });

  it("FR-007 (006): a Link's URL is not a prose word, but its text is", () => {
    expect(countWords('Ver [este enlace](https://example.com) ahora.')).toBe(4); // Ver, este, enlace, ahora
    expect(countWords('Ver https://example.com ahora.')).toBe(2); // Ver, ahora
  });

  it("FR-007 (006): a Task's marker is not a prose word", () => {
    expect(countWords('- [ ] tarea sin hacer')).toBe(3);
  });

  it("FR-007 (006): a Footnote's call/label is not a prose word, but its definition's text is", () => {
    expect(countWords('Texto con nota[^1] al pie.')).toBe(5); // Texto, con, nota, al, pie
    expect(countWords('[^1]: La nota completa aquí.')).toBe(4); // La, nota, completa, aquí
  });

  it('FR-007 (006): a whole Reference definition is not prose', () => {
    expect(countWords('[ref]: https://example.com "Un título"')).toBe(0);
  });

  it('matches the count of the same text with markdown marks stripped by hand', () => {
    const withMarkdown = '## Un título\n\nUn párrafo con **negrita** y una *cursiva*.\n\n> Una cita breve.\n\n---\n\n- Un elemento\n- Otro elemento';
    const plain = 'Un título\n\nUn párrafo con negrita y una cursiva.\n\nUna cita breve.\n\nUn elemento\nOtro elemento';
    expect(countWords(withMarkdown)).toBe(countWords(plain));
  });
});

describe('countWordsInRange — US-020: the selection count', () => {
  it('counts only the words inside the given range', () => {
    const text = 'Primero segundo tercero';
    const from = text.indexOf('segundo');
    const to = from + 'segundo'.length;
    expect(countWordsInRange(text, from, to)).toBe(1);
  });

  it('is zero for a collapsed (empty) range', () => {
    expect(countWordsInRange('Primero segundo', 3, 3)).toBe(0);
  });

  it('counts a partial word overlap as a word, matching how selections work in practice', () => {
    const text = 'palabra';
    expect(countWordsInRange(text, 0, 3)).toBe(1);
  });
});

// US-006 (003): the phrase itself, and its singular/plural, is no longer
// hard-coded here — `src/domain/wordCount.ts` stays free of `vscode` as a
// value (ASM-002), so every template arrives already resolved (in English,
// or translated through l10n/bundle.l10n.es.json) from
// `src/infrastructure/wordCountStatusBar.ts`, the only place allowed to call
// `vscode.l10n.t`. Templates carry a literal `{0}` placeholder, the same
// convention `vscode.l10n.t` itself uses, and formatWordCountStatus is the
// one place that substitutes it — distinct strings per key here, same
// reason as editorToolbar.test.ts's fake strings bag, so a mix-up shows up
// as a wrong assertion.
const englishStrings: WordCountStrings = {
  totalSingular: '{0} word',
  totalPlural: '{0} words',
  selectionSingular: '({0} selected)',
  selectionPlural: '({0} selected)',
};

// Spanish agrees the selection participle with a feminine noun
// (seleccionada/seleccionadas, from "palabra") while English does not
// inflect "selected" at all — this is the case the implementation notes
// call out: the selection suffix needs its own singular and plural strings,
// not a noun substituted into a shared skeleton.
const spanishStrings: WordCountStrings = {
  totalSingular: '{0} palabra',
  totalPlural: '{0} palabras',
  selectionSingular: '({0} seleccionada)',
  selectionPlural: '({0} seleccionadas)',
};

describe('formatWordCountStatus — US-020/US-006: the status bar label', () => {
  it('shows only the total when nothing is selected, singular for exactly one word', () => {
    expect(formatWordCountStatus(0, 0, englishStrings)).toBe('0 words');
    expect(formatWordCountStatus(1, 0, englishStrings)).toBe('1 word');
    expect(formatWordCountStatus(42, 0, englishStrings)).toBe('42 words');
  });

  it('adds the selection count, with its own singular/plural, when there is a selection', () => {
    expect(formatWordCountStatus(42, 1, englishStrings)).toBe('42 words (1 selected)');
    expect(formatWordCountStatus(42, 5, englishStrings)).toBe('42 words (5 selected)');
  });

  it("US-006: reads with today's Spanish wordings, unchanged, when given the Spanish strings", () => {
    expect(formatWordCountStatus(0, 0, spanishStrings)).toBe('0 palabras');
    expect(formatWordCountStatus(1, 0, spanishStrings)).toBe('1 palabra');
    expect(formatWordCountStatus(42, 0, spanishStrings)).toBe('42 palabras');
    expect(formatWordCountStatus(42, 1, spanishStrings)).toBe('42 palabras (1 seleccionada)');
    expect(formatWordCountStatus(42, 5, spanishStrings)).toBe('42 palabras (5 seleccionadas)');
  });

  it('US-006: a selection of exactly one word uses the singular for both the total and the selection', () => {
    expect(formatWordCountStatus(1, 1, englishStrings)).toBe('1 word (1 selected)');
    expect(formatWordCountStatus(1, 1, spanishStrings)).toBe('1 palabra (1 seleccionada)');
  });
});
