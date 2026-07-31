import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs, ensureOuterTracePaths } from './ceruti-calcs';
import { defaultArchingParams } from './ceruti-arching';
import { DefaultParams, EnricoCerutiParams, PathEntry } from './ceruti-types';

/**
 * The shared path cache is what the plan-view sheets are drawn and exported
 * from, so what it holds *is* the export. A wrong shape shows up on screen; a
 * cache entry that quietly appears or disappears shows up as a sheet carrying
 * geometry it shouldn't, or missing geometry it should — the harder one to
 * notice, and the reason this is tested at the cache rather than at the sheet.
 */
function laidOut(): EnricoCerutiParams {
  const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
  calculateMainBouts(p);
  calculateCorners(p);
  calculateCenterBout(p);
  calculateOuterArcs(p);
  return p;
}

const find = (paths: PathEntry[], key: string): string | undefined =>
  paths.find(e => e.key === key)?.path;

describe('ensureOuterTracePaths', () => {
  it('emits the outline and purfling', () => {
    const p = laidOut();
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);
    for (const key of ['top', 'back', 'purfling', 'outerPurfling']) {
      expect(find(paths, key)).toBeTruthy();
    }
  });

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

  it('rewrites entries in place rather than appending a second copy', () => {
    // Every export path calls this before reading, so a run that appended would
    // leave `find` returning whichever copy landed first — stale geometry on a
    // sheet, with the correct path sitting unused further down the array.
    const p = laidOut();
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);
    const first = paths.length;
    ensureOuterTracePaths(p, paths);
    expect(paths.length).toBe(first);
  });
});
