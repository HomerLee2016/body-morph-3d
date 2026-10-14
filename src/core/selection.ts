/**
 * The joints the user has selected, in the order they were picked. Pure data (no DOM or three.js),
 * so the selection rules can be tested in node; the viewer draws and moves whatever is in here.
 */
export class JointSelection {
  private readonly ids = new Set<string>();

  get size(): number {
    return this.ids.size;
  }

  has(jointId: string): boolean {
    return this.ids.has(jointId);
  }

  list(): string[] {
    return [...this.ids];
  }

  /** Replaces the selection with this one joint, or clears it with `null`. Returns whether anything changed. */
  set(jointId: string | null): boolean {
    const next = jointId ? [jointId] : [];
    const same = next.length === this.ids.size && next.every((id) => this.ids.has(id));
    if (same) return false;
    this.ids.clear();
    for (const id of next) this.ids.add(id);
    return true;
  }

  /** Adds the joint to the selection, or removes it if it is already selected. */
  toggle(jointId: string): void {
    if (this.ids.has(jointId)) this.ids.delete(jointId);
    else this.ids.add(jointId);
  }
}
