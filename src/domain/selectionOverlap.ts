export interface SelectionRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Whether `selection` "touches" `target` closely enough to count as active.
 * A collapsed cursor (from === to) counts as touching when it sits anywhere
 * from `target.from` up to, but NOT including, `target.to`. A real
 * (non-collapsed) selection uses a standard half-open range overlap.
 */
export function touches(selection: SelectionRange, target: SelectionRange): boolean {
  if (selection.from === selection.to) {
    return selection.from >= target.from && selection.from < target.to;
  }
  return selection.from < target.to && selection.to > target.from;
}

/**
 * Like `touches`, but a collapsed cursor resting exactly on `target.to` counts
 * as inside: writing happens at the end of a sentence, and the block that ends
 * there is the one the Author is working on. Live preview keeps the half-open
 * rule on purpose (a cursor just past a hidden marker must not reveal it), so
 * this end-inclusive variant is only for whole-block reasoning like Focus mode.
 */
export function touchesBlock(selection: SelectionRange, target: SelectionRange): boolean {
  if (selection.from === selection.to) {
    return selection.from >= target.from && selection.from <= target.to;
  }
  return touches(selection, target);
}

/**
 * How far `selection` sits from `target`, 0 when they touch. Used to pick the
 * block the cursor belongs to when it rests outside every block (a blank line).
 */
export function distance(selection: SelectionRange, target: SelectionRange): number {
  if (touchesBlock(selection, target)) {
    return 0;
  }
  return selection.from > target.to ? selection.from - target.to : target.from - selection.to;
}
