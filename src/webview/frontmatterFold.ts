import { type Text, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { detectFrontmatter, MAX_FRONTMATTER_LINES } from '../domain/frontmatter';

/**
 * Folds the **Frontmatter** out of the Writing surface entirely: no
 * placeholder, no marker, no blank line where it was — the Chapter simply
 * begins at its first paragraph (Author's choice). The toolbar's Frontmatter
 * button is the affordance that brings it back, and the only one.
 *
 * The text is never touched. This is one `Decoration.replace({block: true})`
 * over the block's lines, so what is on disk and what `countWords` sees are
 * unaffected — only what is drawn.
 */

/**
 * The lines to fold: the block itself, plus whatever blank lines separate it
 * from the prose. Swallowing those is what makes the fold invisible rather
 * than merely empty — leaving them would open the Chapter on a stray blank
 * line that the Author cannot explain, having never seen what it separates.
 */
function foldedRange(doc: Text): { from: number; to: number } | undefined {
  const limit = Math.min(doc.lines, MAX_FRONTMATTER_LINES);
  const head: string[] = [];
  for (let line = 1; line <= limit; line += 1) {
    head.push(doc.line(line).text);
  }

  const block = detectFrontmatter(head);
  if (!block) {
    return undefined;
  }

  // `closeLine` is 0-based; CodeMirror numbers lines from 1.
  let last = block.closeLine + 1;
  while (last < doc.lines && doc.line(last + 1).text.trim() === '') {
    last += 1;
  }

  // A Chapter that is nothing but Frontmatter would fold away to an empty
  // Writing surface, which reads as a broken editor rather than as a folded
  // block. Leave it visible: the Author has nothing else to look at.
  if (last >= doc.lines) {
    return undefined;
  }

  return { from: 0, to: doc.line(last).to };
}

function build(doc: Text): DecorationSet {
  const range = foldedRange(doc);
  if (!range) {
    return Decoration.none;
  }
  return Decoration.set([Decoration.replace({ block: true }).range(range.from, range.to)]);
}

const foldField = StateField.define<DecorationSet>({
  create: (state) => build(state.doc),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.state.doc) : value),
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Whether the cursor would land inside the folded block — asked by
 * `main.ts` before folding, so a cursor left in there is moved out first.
 * `atomicRanges` keeps the cursor from *entering* a fold, but it cannot
 * evict one that was already inside when the fold appeared.
 */
export function foldedFrontmatterEnd(doc: Text): number {
  return foldedRange(doc)?.to ?? 0;
}

/**
 * The fold, plus the `atomicRanges` that make it behave as one unit: the
 * cursor steps over it instead of into it, and a Backspace at the start of
 * the first paragraph cannot eat an invisible line (the same pairing
 * `livePreviewPlugin.ts` uses for hidden markers).
 */
export const frontmatterFold = [foldField, EditorView.atomicRanges.of((view) => view.state.field(foldField))];
