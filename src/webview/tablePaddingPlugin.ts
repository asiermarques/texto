import { EditorState, type Extension } from '@codemirror/state';
import { computeTablePadding, tableRangeAt } from '../domain/tablePadding';
import { treeField } from './treeField';

/**
 * US-003 of 009: the padding of the **Table** the **Author** is writing in,
 * carried by the keystroke's own transaction rather than dispatched after
 * it.
 *
 * This is RISK-002, and a `transactionFilter` is the only shape that
 * answers it. The webview's changes reach the `TextDocument` as one
 * `WorkspaceEdit` per `edit` message (`writingEditorProvider.ts`), and one
 * `WorkspaceEdit` is one undo step — so a padding edit dispatched
 * separately would be a second undo step by construction, and a single undo
 * would leave a half-padded **Table** behind (BR-001 of 009). Returning two
 * specs from a filter combines them into ONE transaction, exactly as
 * `EditorState.update` combines its arguments, and `sequential: true` says
 * the padding's offsets are into the document the keystroke just produced.
 *
 * The tree comes from `startState` — the keystroke's own, already computed
 * — and the **Table**'s range is mapped through the change rather than
 * looked up again: reading `transaction.state` here would force a state
 * CodeMirror then throws away and rebuilds, i.e. a second **Tree update**
 * per keystroke on the one path PD-002 is least forgiving about (RISK-001).
 * Nothing here parses, and `test/performance/measure.ts` measures this very
 * extension per commit (US-004) rather than a copy of it.
 *
 * `isApplyingExternalChange` is EDGE-005: a change we did not originate (a
 * `git checkout` arriving while the cursor sits in a **Table**) rebuilds the
 * grid, and must not be answered as if the **Author** had typed —
 * NOGOAL-005, nothing pads on open, on save, or on an external change.
 */
export function tablePadding(isApplyingExternalChange: () => boolean): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged || isApplyingExternalChange()) {
      return transaction;
    }
    const startState = transaction.startState;
    const table = tableRangeAt(startState.field(treeField), startState.selection.main.head);
    if (!table) {
      return transaction;
    }
    const moved = {
      from: transaction.changes.mapPos(table.from, 1),
      to: transaction.changes.mapPos(table.to, 1),
    };
    // Null when the Table is already padded, and null when the keystroke
    // just stopped it being a Table at all (BR-004) — so this cannot loop,
    // however the returned transaction is resolved.
    const padding = computeTablePadding(transaction.newDoc.toString(), moved, transaction.newSelection.main.head);
    if (!padding) {
      return transaction;
    }
    return [transaction, { changes: padding.changes, selection: { anchor: padding.cursor }, sequential: true }];
  });
}
