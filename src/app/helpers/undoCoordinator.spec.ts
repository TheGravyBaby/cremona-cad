import { UndoCoordinator, Undoable } from './undoCoordinator';

/**
 * Merges two independent undo histories into one chronological timeline. The bug this guards
 * against: a fixed priority between sources (recipe-base used to always defer to the toolbox)
 * that undoes the wrong thing whenever the other source acted more recently — even though the
 * other source also has local history it could technically undo into.
 */

/** A minimal Undoable tracking its own position/length like a real history stack, plus call
 * counters so a test can tell whether the coordinator actually invoked undo()/redo() on it —
 * `canUndo` alone can't show that, since an untouched source can still legitimately report true. */
function fakeSource(id: string) {
  let position = 0;
  let length = 1;
  let undoCalls = 0;
  let redoCalls = 0;
  const source: Undoable & {
    push(): void; readonly position: number; readonly undoCalls: number; readonly redoCalls: number;
  } = {
    id,
    get canUndo() { return position > 0; },
    get canRedo() { return position < length - 1; },
    get position() { return position; },
    get undoCalls() { return undoCalls; },
    get redoCalls() { return redoCalls; },
    push() { length = position + 2; position++; },
    undo() { if (position <= 0) return; position--; undoCalls++; },
    redo() { if (position >= length - 1) return; position++; redoCalls++; },
  };
  return source;
}

describe('UndoCoordinator', () => {
  it('undoes the source that acted most recently, not a fixed priority between sources', () => {
    const coordinator = new UndoCoordinator();
    const a = fakeSource('a');
    const b = fakeSource('b');
    coordinator.register(a);
    coordinator.register(b);

    a.push(); coordinator.notify('a');
    b.push(); coordinator.notify('b');
    a.push(); coordinator.notify('a');
    // b still has its own local history it could undo into (b.canUndo is true) — the coordinator
    // must not prefer it just because it's checked first, the way the old fixed-priority code did.

    coordinator.undo();
    expect(a.undoCalls).toBe(1);
    expect(b.undoCalls).toBe(0);

    coordinator.undo();
    expect(b.undoCalls).toBe(1);
    expect(a.undoCalls).toBe(1); // unchanged
  });

  it('redo replays undone actions in the order they originally happened', () => {
    const coordinator = new UndoCoordinator();
    const a = fakeSource('a');
    const b = fakeSource('b');
    coordinator.register(a);
    coordinator.register(b);

    a.push(); coordinator.notify('a');
    b.push(); coordinator.notify('b');

    coordinator.undo(); // undoes b (most recent)
    coordinator.undo(); // undoes a
    expect(coordinator.canUndo()).toBe(false);

    coordinator.redo();
    expect(a.redoCalls).toBe(1);
    expect(b.redoCalls).toBe(0);

    coordinator.redo();
    expect(b.redoCalls).toBe(1);
  });

  it('a new action clears the global redo log, even for the other source', () => {
    const coordinator = new UndoCoordinator();
    const a = fakeSource('a');
    const b = fakeSource('b');
    coordinator.register(a);
    coordinator.register(b);

    a.push(); coordinator.notify('a');
    coordinator.undo();
    expect(coordinator.canRedo()).toBe(true);

    b.push(); coordinator.notify('b');
    expect(coordinator.canRedo()).toBe(false);
  });

  it('reset drops a source\'s pending tokens without touching its local state — e.g. on file load', () => {
    const coordinator = new UndoCoordinator();
    const a = fakeSource('a');
    const b = fakeSource('b');
    coordinator.register(a);
    coordinator.register(b);

    a.push(); coordinator.notify('a');
    b.push(); coordinator.notify('b');

    coordinator.reset('a');
    coordinator.undo();
    expect(b.undoCalls).toBe(1);
    expect(a.undoCalls).toBe(0);
  });

  it('unregistering drops the source and its pending tokens', () => {
    const coordinator = new UndoCoordinator();
    const a = fakeSource('a');
    a.push();
    const unregister = coordinator.register(a);
    coordinator.notify('a');
    expect(coordinator.canUndo()).toBe(true);

    unregister();
    expect(coordinator.canUndo()).toBe(false);
    coordinator.undo();
    expect(a.undoCalls).toBe(0);
  });

  it('reports no history when nothing has happened, and no-ops safely', () => {
    const coordinator = new UndoCoordinator();
    expect(coordinator.canUndo()).toBe(false);
    expect(coordinator.canRedo()).toBe(false);
    coordinator.undo();
    coordinator.redo();
  });
});
