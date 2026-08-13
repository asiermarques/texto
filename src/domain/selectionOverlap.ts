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
