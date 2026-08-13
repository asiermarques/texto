/**
 * Distinguishes a document change we caused ourselves from one that came
 * from outside the webview (an external edit, undo/redo, a `git checkout`…).
 *
 * VSCode bumps `TextDocument.version` by exactly 1 for every edit it applies,
 * regardless of the source. Before we ask VSCode to apply our own edit, we
 * record the version it will become; when the corresponding change event
 * fires, we recognize it as ours and don't echo it back to the webview
 * (RISK-001 in the implementation plan — the echo loop).
 */
export class EditOriginTracker {
  private readonly pendingVersions = new Set<number>();

  markOwnEdit(expectedVersion: number): void {
    this.pendingVersions.add(expectedVersion);
  }

  /** Consumes the version if it was ours, so it can't be matched twice. */
  isOwnChange(version: number): boolean {
    return this.pendingVersions.delete(version);
  }
}
