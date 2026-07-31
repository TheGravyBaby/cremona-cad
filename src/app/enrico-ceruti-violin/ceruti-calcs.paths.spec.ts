import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs, ensureOuterTracePaths } from './ceruti-calcs';
import { defaultArchingParams } from './ceruti-arching';
import { defaultGougedFlutingParams } from './ceruti-gouged';
import { DefaultParams, EnricoCerutiParams, PathEntry } from './ceruti-types';

/**
 * The shared path cache is what the plan-view sheets are drawn and exported
 * from, so the channel entries in it are the export. A template failure shows
 * up as a wrong shape on screen; a missing cache entry shows up as a sheet that
 * silently omits the channel, which is the harder one to notice.
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
  it('emits the outline and purfling with or without arching', () => {
    const p = laidOut();
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);
    for (const key of ['top', 'back', 'purfling', 'outerPurfling']) {
      expect(find(paths, key)).toBeTruthy();
    }
  });

  it('leaves out the channel until the plate has a gouge to cut it with', () => {
    const p = laidOut();
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);
    expect(find(paths, 'channelAreaTop')).toBeUndefined();
    expect(find(paths, 'channelAreaBack')).toBeUndefined();
  });

  it('emits a fillable area and its bounding lines per plate', () => {
    const p = laidOut();
    p.arching = defaultArchingParams(p.height);
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);

    for (const key of ['channelAreaTop', 'channelAreaBack', 'channelLineTop', 'channelLineBack']) {
      expect(find(paths, key)).toBeTruthy();
    }
    // The area is two nested loops for an even-odd fill, so it carries two
    // subpaths — one loop would fill the whole plate rather than a channel.
    expect(find(paths, 'channelAreaTop')!.match(/M/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('draws each plate its own channel rather than one for both', () => {
    const p = laidOut();
    p.arching = defaultArchingParams(p.height);
    // A visibly different tool on the back: half the sweep at the same depth,
    // so it cuts a narrower channel and its inner edge sits further out.
    p.arching.top.gougedFluting = defaultGougedFlutingParams(p);
    p.arching.bottom.gougedFluting = { ...defaultGougedFlutingParams(p), sweepRadius: 1.2 };
    const paths: PathEntry[] = [];
    ensureOuterTracePaths(p, paths);
    expect(find(paths, 'channelAreaTop')).not.toEqual(find(paths, 'channelAreaBack'));
  });

  it('bounds the region at the land edge when the corners are gouged, and at the channel when they are not', () => {
    const p = laidOut();
    p.arching = defaultArchingParams(p.height);
    const region = (cornerGouge: boolean): string => {
      p.arching!.top.gougedFluting = { ...defaultGougedFlutingParams(p), cornerGouge };
      const paths: PathEntry[] = [];
      ensureOuterTracePaths(p, paths);
      return find(paths, 'channelAreaTop')!;
    };
    // With the corner pass on, the outer bound is the land edge — which runs
    // *round* the corners — so it reaches further out than the channel's own
    // outer loop, which bypasses them.
    expect(region(true)).not.toEqual(region(false));
  });
});
