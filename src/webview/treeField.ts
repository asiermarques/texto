import { StateField, type ChangeSet } from '@codemirror/state';
import { Tree, TreeFragment, type ChangedRange } from '@lezer/common';
import { parser } from '../domain/markdownParser';

/**
 * US-004 (008): the Writing surface's own parse, owned as `EditorState` and
 * updated incrementally per transaction instead of being re-parsed by every
 * reader. `livePreviewPlugin.ts` and `focusModePlugin.ts` both read
 * `state.field(treeField)` (FR-003: one tree, two readers), and a
 * selection-only transaction (`docChanged` false) leaves it untouched
 * entirely (FR-002) — there is nothing to reparse, so only the traversal
 * runs.
 *
 * `TreeFragment.applyChanges` + `parser.parse(text, fragments)` is the
 * supported incremental-reparse shape (ADR 0001): the previous tree's
 * fragments are trimmed to the parts the edit didn't touch, and the parser
 * reuses them instead of walking the whole document again. Measured by the
 * ADR at near-constant cost regardless of Chapter length — O(edit), not
 * O(document).
 */
export const treeField = StateField.define<Tree>({
  create(state) {
    return parser.parse(state.doc.toString());
  },
  update(tree, transaction) {
    if (!transaction.docChanged) {
      return tree;
    }
    return reparseIncrementally(tree, transaction.state.doc.toString(), transaction.changes);
  },
});

function reparseIncrementally(previousTree: Tree, text: string, changes: ChangeSet): Tree {
  const changedRanges: ChangedRange[] = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => void changedRanges.push({ fromA, toA, fromB, toB }));
  const fragments = TreeFragment.applyChanges(TreeFragment.addTree(previousTree), changedRanges);
  return parser.parse(text, fragments);
}
