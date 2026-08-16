import type { SelectionRange } from './selectionOverlap';
import type { TextChange } from './textChange';

/** What a formatting command produces: the edit, and where the cursor/selection should land once it is applied. */
export interface FormattingResult {
  readonly changes: readonly TextChange[];
  readonly selection: { readonly anchor: number; readonly head: number };
}

/**
 * US-013: `Cmd`/`Ctrl`+`B` and `Cmd`/`Ctrl`+`I` — wraps the selection in
 * `marker` (`**` for strong, `*` for emphasis), or removes it when the
 * selection is already wrapped by it. Writes through the same
 * `TextChange`/edit bridge every keystroke already uses (the plan's
 * decision for this whole slice), so undo and the Draft history need
 * nothing special — this is a pure function; `src/webview/main.ts` is the
 * only place that turns its result into a real `view.dispatch`.
 */
export function toggleInlineWrap(text: string, selection: SelectionRange, marker: string): FormattingResult {
  const { from, to } = selection;
  const before = text.slice(Math.max(0, from - marker.length), from);
  const after = text.slice(to, to + marker.length);

  if (before === marker && after === marker) {
    return {
      changes: [
        { from: from - marker.length, to: from, insert: '' },
        { from: to, to: to + marker.length, insert: '' },
      ],
      selection: { anchor: from - marker.length, head: to - marker.length },
    };
  }

  if (from === to) {
    return {
      changes: [{ from, to, insert: marker + marker }],
      selection: { anchor: from + marker.length, head: from + marker.length },
    };
  }

  return {
    changes: [
      { from, to: from, insert: marker },
      { from: to, to, insert: marker },
    ],
    selection: { anchor: from + marker.length, head: to + marker.length },
  };
}
