import { EditorView } from '@codemirror/view';

/**
 * US-012 (DEC-001): no focus ring at all on the Writing surface — the
 * blinking cursor is the only signal of focus.
 *
 * Two sources paint an outline that `styles.css` alone cannot beat:
 *  - CodeMirror's own base theme, which sets `&.cm-focused { outline: 1px
 *    dotted #212121 }` on the editor root (`@codemirror/view`'s
 *    `baseTheme$1`). It is registered with `Prec.lowest`, so any
 *    `EditorView.theme` (this one) is injected after it and wins on the tied
 *    specificity.
 *  - The browser's own focus ring on the focused `.cm-content` (it is
 *    `contenteditable`), tinted by VSCode with the active theme's
 *    `focusBorder` — this is what produced the yellow ring and the "pills"
 *    around list bullets in the feedback capture (`outline-style: auto`
 *    draws a segment around every overflowing fragment, and the bullet is
 *    pushed outside its box on purpose by `text-indent: -1.4em`). A linked
 *    stylesheet rule cannot be trusted to load after whatever sets this, so
 *    it is silenced here too, with `!important` to also beat an inline style.
 */
export const noFocusRingTheme = EditorView.theme({
  '&': { outline: 'none !important' },
  '&.cm-focused': { outline: 'none !important' },
  '&:focus, &:focus-visible': { outline: 'none !important' },
  '.cm-content': { outline: 'none !important' },
  '.cm-content:focus, .cm-content:focus-visible': { outline: 'none !important' },
});
