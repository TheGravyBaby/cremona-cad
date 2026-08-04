import { defineOffsetArcs, defineOuterPurflingPath, definePurflingPath } from './ceruti-paths';
import { layoutFrom, templateKeys, templateViolin, violinFromRecipe } from './ceruti-fixtures';
import { EnricoCerutiParams } from './ceruti-types';

/**
 * The purfling and channel lines, which are the inner arcs re-solved at a
 * different offset rather than a rendering of the outline.
 *
 * Everything here turns on one property: the result has to close. The arcs are
 * handed to `unifyConnectedSvgPaths` as an unordered bag, and when a pair of
 * ends does not meet it does not throw — it logs and returns the pieces
 * concatenated, so an arc that runs past its neighbour arrives as an extra
 * `M ...` subpath and draws as a whisker off the corner. That is a visual bug
 * with no exception behind it, which is why it is counted here instead.
 */

/** Subpath count. A purfling line is one closed loop, so anything above 1 is an unjoined piece. */
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;

/** Every arc, keyed by the circle it came from — two entries mean one arc was emitted twice. */
function centresEmittedTwice(p: EnricoCerutiParams, offset: number): string[] {
  const seen = new Map<string, number>();
  for (const a of defineOffsetArcs(p, offset, true)) {
    const key = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.r.toFixed(6)}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([key]) => key);
}

/** A solved instrument with the corner styles forced, rather than as the template saved them. */
function withCorners(key: string, uc: boolean, lc: boolean): EnricoCerutiParams {
  const p = templateViolin(key);
  p.options.useViolCornerUC = uc;
  p.options.useViolCornerLC = lc;
  // A viol corner sets the purfling arcs a real distance in from the outline;
  // left at the default the offset works out to zero and the arcs coincide with
  // the inner trace, which is exactly the case that hides an untrimmed end.
  p.purflingOffset = p.rib + p.overhang + 3.8;
  return layoutFrom(p);
}

const CORNER_STYLES: [string, boolean, boolean][] = [
  ['round corners', false, false],
  ['a viol upper corner', true, false],
  ['a viol lower corner', false, true],
  ['viol corners both ends', true, true],
];

describe.each(CORNER_STYLES)('the purfling line with %s', (_label, uc, lc) => {
  it.each(templateKeys())('closes into a single loop on %s', key => {
    const p = withCorners(key, uc, lc);
    const offset = p.overhang + p.rib;

    expect(subpaths(definePurflingPath(p, offset)!)).toBe(1);
    expect(subpaths(defineOuterPurflingPath(p, offset)!)).toBe(1);
  });
});

describe('the arcs behind the purfling line', () => {
  it.each(CORNER_STYLES)('emits each circle once with %s', (_label, uc, lc) => {
    // The flank arc of a viol corner (U4/L4) is itself the arc that reaches the
    // corner tip, so the corner block emits it trimmed to the intersection it
    // just solved. It used to be pushed a second time untrimmed, which is what
    // produced the whisker: same circle, same start, an end 4mm further round.
    const p = withCorners('ravatinMans', uc, lc);
    expect(centresEmittedTwice(p, -3.8)).toEqual([]);
  });

  it('stops the viol flank at the corner, not past it', () => {
    // The end angle has to be the one solved against the neighbouring corner
    // arc. Compared as a point, since the two arcs meet in space and not at any
    // shared angle.
    const p = withCorners('ravatinMans', true, false);
    const arcs = defineOffsetArcs(p, -3.8, true);
    const flank = arcs.filter(a => Math.abs(a.r - (p.bouts.U4!.r - 3.8)) < 1e-9);
    expect(flank).toHaveLength(1);

    const tip = { x: flank[0].x + flank[0].r * Math.cos(flank[0].end), y: flank[0].y + flank[0].r * Math.sin(flank[0].end) };
    const meets = arcs.some(a => a !== flank[0]
      && Math.hypot(a.x + a.r * Math.cos(a.end) - tip.x, a.y + a.r * Math.sin(a.end) - tip.y) < 1e-6);
    expect(meets, 'the viol flank ends where nothing else does').toBe(true);
  });
});

describe('the recipe the whisker was reported from', () => {
  /**
   * The Ravatin cello as it stood in the session that reported this, reduced to
   * what the bug turns on: a viol upper corner, and a purfling offset set well
   * in from the outline. Reproducing it from the nearest template instead would
   * have missed it — every bundled instrument with a viol corner leaves
   * `purflingOffset` at its default, where the offset works out to zero and the
   * untrimmed arc lands exactly on top of the trimmed one.
   */
  const reported = () => violinFromRecipe({
    params: {
      ...templateViolin('ravatinMans'),
      purflingOffset: 10.8,
      purflingChannelDepth: 1.2,
      options: { ...templateViolin('ravatinMans').options, useViolCornerUC: true, useViolCornerLC: false },
    },
  });

  it('draws its purfling as one closed loop', () => {
    const p = reported();
    expect(subpaths(definePurflingPath(p, p.overhang + p.rib)!)).toBe(1);
  });

  it('sets a purfling offset the outline can actually feel', () => {
    // The guard on the fixture above: if this ever came out zero, the test
    // passes while testing nothing.
    const p = reported();
    expect(p.purflingOffset).not.toBe(p.rib + p.overhang);
  });
});
