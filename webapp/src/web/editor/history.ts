// history.ts - undo/redo for the whole editor (drawing, text, photo, border...).
// Each entry is a snapshot of the editor *before* a change. Pure, unit tested.

export class History<S> {
  private undos: S[] = [];
  private redos: S[] = [];
  private lastAt = 0;
  private lastKey = "";

  constructor(private limit = 60, private mergeMs = 800) {}

  /** Remember `before` (the state just before a change). Starting any change clears redo. */
  push(before: S) {
    this.undos.push(before);
    if (this.undos.length > this.limit) this.undos.shift();
    this.redos = [];
    this.lastKey = "";
  }

  /**
   * Like push, but quick successive edits of the same kind (typing, dragging a slider) become
   * one undo step: only the first of a burst is remembered.
   */
  pushMerged(before: S, key: string, now = Date.now()) {
    const merge = key === this.lastKey && now - this.lastAt < this.mergeMs;
    if (!merge) this.push(before);
    this.lastKey = key;
    this.lastAt = now;
  }

  /** Forget the latest entry (a change that turned out to be nothing, e.g. Esc on a selection). */
  dropLast() { this.undos.pop(); this.lastKey = ""; }

  undo(current: S): S | null {
    const s = this.undos.pop();
    if (s === undefined) return null;
    this.redos.push(current);
    this.lastKey = "";
    return s;
  }

  redo(current: S): S | null {
    const s = this.redos.pop();
    if (s === undefined) return null;
    this.undos.push(current);
    this.lastKey = "";
    return s;
  }

  clear() { this.undos = []; this.redos = []; this.lastKey = ""; }
  get canUndo() { return this.undos.length > 0; }
  get canRedo() { return this.redos.length > 0; }
}

/**
 * Photo zoom slider: -5..5, 0 = fit. Positive zooms in (5 = 6x), negative zooms out (-5 = 1/6).
 * The doc stores the scale factor (zoom, 1 = fit), as older messages did.
 */
export const zoomToLevel = (zoom: number) => (zoom >= 1 ? zoom - 1 : 1 - 1 / zoom);
export const levelToZoom = (level: number) => (level >= 0 ? 1 + level : 1 / (1 - level));
