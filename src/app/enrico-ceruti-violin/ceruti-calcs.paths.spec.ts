// @vitest-environment node
import { ensureCenterBoutInnerPath, ensureOuterTracePaths, getPath, upsertPathEntry } from './ceruti-calcs';
import { defaultArchingParams } from './ceruti-arching';
import { defaultViolin, layoutFrom } from './ceruti-fixtures';
import { PathEntry } from './ceruti-types';

/**
 * The shared path cache is what the plan-view sheets are drawn and exported
 * from, so what it holds *is* the export. A wrong shape shows up on screen; a
 * cache entry that quietly appears or disappears shows up as a sheet carrying
 * geometry it shouldn't, or missing geometry it should — the harder one to
 * notice, and the reason this is tested at the cache rather than at the sheet.
 */
const laidOut = defaultViolin;

describe('ensureOuterTracePaths', () => {
  it('keeps the channel off the plan sheets, arching or not', () => {
    // In plan the channel is only a pair of rims — nothing between them says how
    // deep it goes or what section it is cut to, and the arching templates state
    // all of that exactly. A plate with arching fully configured is the case
    // worth pinning: that is where a channel entry would reappear if the cache
    // ever started emitting one again.
    const p = laidOut();
    const bare: PathEntry[] = [];
    ensureOuterTracePaths(p, bare);
    p.arching = defaultArchingParams(p.height);
    const arched: PathEntry[] = [];
    ensureOuterTracePaths(p, arched);

    for (const paths of [bare, arched]) {
      expect(paths.map(e => e.key).filter(k => /channel/i.test(k))).toEqual([]);
    }
  });
});

describe('the cache accessors', () => {
  // These replaced four hand-rolled copies of `.find(...)!` across the panels.
  it('upsertPathEntry replaces a key in place, keeping its position', () => {
    const paths: PathEntry[] = [];
    upsertPathEntry(paths, 'inner', 'M 0 0');
    upsertPathEntry(paths, 'top', 'M 1 1');
    upsertPathEntry(paths, 'inner', 'M 2 2');

    expect(paths.map(e => e.key)).toEqual(['inner', 'top']);
    expect(getPath(paths, 'inner')).toBe('M 2 2');
  });

  it('the two ensure* functions share one cache without clobbering each other', () => {
    // Panels call both — the mould panel needs the inner path and the outline in
    // the same array — so a second ensure* must not drop the first one's work.
    const p = laidOut();
    const paths: PathEntry[] = [];
    ensureCenterBoutInnerPath(p, paths);
    ensureOuterTracePaths(p, paths);

    for (const key of ['inner', 'top', 'back'] as const) {
      expect(getPath(paths, key), `${key} missing`).toBeTruthy();
    }
  });
});

describe('the cache across a whole session', () => {
  it('never accumulates a second entry for a key', () => {
    // Recipes exist carrying the same key three times over, each a snapshot of
    // the outline at a different moment. Only the first is ever refreshed —
    // `upsertPathEntry` matches by key and stops there — so the rest sit frozen
    // in every saved file, invisible on screen and contradictory in a dump.
    //
    // They are not reachable from this code, and this is what says so: the
    // ensure* functions re-run across the edits that change which arcs the
    // outline is even built from (a viol corner swaps U2/U3 out for U4), with a
    // save/load round trip between each, which is where a second array could
    // enter. Any future write path that can append belongs behind this test.
    let paths: PathEntry[] = [];
    const p = laidOut();

    for (const uc of [false, true, false]) {
      for (const lc of [false, true]) {
        p.options.useViolCornerUC = uc;
        p.options.useViolCornerLC = lc;
        layoutFrom(p);
        ensureCenterBoutInnerPath(p, paths);
        ensureOuterTracePaths(p, paths);
        paths = JSON.parse(JSON.stringify(paths));
      }
    }

    expect(paths.map(e => e.key)).toEqual([...new Set(paths.map(e => e.key))]);
  });
});
