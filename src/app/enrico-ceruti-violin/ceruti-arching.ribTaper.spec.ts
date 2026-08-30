import {
  defaultArchingParams, maxRibTaperMm, normalizeArchingParams, ribHeightAt, solveRibTaper,
} from './ceruti-arching';
import { buildPlateSurfaceModel } from './ceruti-surface';
import { templateViolin } from './ceruti-fixtures';
import { ArchingParams, EnricoCerutiParams } from './ceruti-types';

// The ribs taper toward the upper block, so the top plate's gluing plane tilts
// where the back's does not. Two things are worth pinning: that the plane the
// panels draw actually passes through the two numbers a maker entered, and that
// entering the same number twice leaves every other output exactly where an
// untapered recipe already had it.

const BODY = 355;
const OVERHANG = 3;

function params(lower: number, upper: number): EnricoCerutiParams {
  return {
    height: BODY,
    overhang: OVERHANG,
    arching: { ...defaultArchingParams(BODY), ribHeightLower: lower, ribHeightUpper: upper },
  } as unknown as EnricoCerutiParams;
}

describe('solveRibTaper', () => {
  it('solves the tilt from the two perpendicular measurements', () => {
    const t = solveRibTaper(params(32, 30));
    // w_lower − w_upper = L·sinθ, over the run from the body datum to the rib's
    // upper end. Closed form, not an iteration.
    expect(Math.sin(t.angle)).toBeCloseTo(2 / (BODY - OVERHANG), 12);
    expect(t.angle * 180 / Math.PI).toBeCloseTo(0.3253, 3);
  });

  it('reads the entered heights as perpendicular, so the vertical rise is fractionally more', () => {
    const t = solveRibTaper(params(32, 30));
    expect(t.zLower).toBeGreaterThan(32);
    expect(t.zUpper).toBeGreaterThan(30);
    // A violin's worth of taper puts this half a micron above the entered
    // number. It is the definition being right, not a number anyone will cut to.
    expect(t.zLower - 32).toBeLessThan(0.001);
  });

  it('lies flat when the ribs do not taper', () => {
    const t = solveRibTaper(params(31, 31));
    expect(t.angle).toBe(0);
    expect(t.zLower).toBe(31);
    expect(t.zUpper).toBe(31);
  });

  it('holds an angle rather than a NaN when the taper outruns the body', () => {
    const t = solveRibTaper(params(500, 1));
    expect(Number.isFinite(t.angle)).toBe(true);
    expect(Number.isFinite(t.zLower)).toBe(true);
  });
});

describe('ribHeightAt', () => {
  it('passes through both entered heights at the stations they were measured at', () => {
    const p = params(32, 30);
    const t = solveRibTaper(p);
    // Perpendicular in, vertical out — so the entered value comes back scaled
    // by cos of the tilt, which is what the plate is actually drawn against.
    expect(ribHeightAt(p, 0)).toBeCloseTo(32 / Math.cos(t.angle), 12);
    expect(ribHeightAt(p, BODY - OVERHANG)).toBeCloseTo(30 / Math.cos(t.angle), 12);
  });

  it('is a plane — linear in y, and running on past both anchors', () => {
    const p = params(32, 30);
    const at = (y: number) => ribHeightAt(p, y);
    const step = (a: number, b: number) => (at(b) - at(a)) / (b - a);
    expect(step(0, 50)).toBeCloseTo(step(200, 300), 12);
    // The plate overhangs the rib at each end, so the plane has to answer past
    // where it was measured rather than clamping to the last rib.
    expect(at(BODY)).toBeLessThan(at(BODY - OVERHANG));
    expect(at(-10)).toBeGreaterThan(at(0));
  });

  it('is flat everywhere for an untapered rib', () => {
    const p = params(31, 31);
    for (const y of [0, 100, BODY / 2, BODY]) expect(ribHeightAt(p, y)).toBeCloseTo(31, 12);
  });
});

describe('maxRibTaperMm', () => {
  // The rib's top edge is the hypotenuse over the run between the two
  // measurements, so tilting it lengthens it. The bound is where it has grown
  // longer than the instrument it belongs to.
  it('stops exactly where the rib line reaches the body length', () => {
    // Asserted through the solver rather than off the returned number, because
    // the bound is a difference in perpendicular widths and the hypotenuse is
    // built from the vertical rise — the two differ by cos of the tilt, which
    // is exactly the conversion the solver exists to do.
    const max = maxRibTaperMm(params(32, 30));
    const t = solveRibTaper(params(32, 32 - max));
    const run = t.yUpper - t.yLower;
    expect(Math.hypot(run, t.zLower - t.zUpper)).toBeCloseTo(BODY, 9);
  });

  it('is a bound on the entered pair, so the panel can check it against the fields', () => {
    const p = params(32, 30);
    const max = maxRibTaperMm(p);
    // Just inside solves; just outside is what the panel refuses.
    expect(solveRibTaper(params(32, 32 - max * 0.999)).angle).toBeLessThan(Math.PI / 2);
    expect(max).toBeLessThan(BODY - OVERHANG);
  });

  it('leaves any taper a maker would plane well inside it', () => {
    // A violin's 2mm, and a cello's 4, are nowhere near — this is a guard on
    // the impossible, not an opinion about how much ribs taper.
    expect(maxRibTaperMm(params(32, 30))).toBeGreaterThan(20);
  });

  it('scales with the instrument', () => {
    const cello = { height: 750, overhang: 4, arching: defaultArchingParams(750) } as unknown as EnricoCerutiParams;
    expect(maxRibTaperMm(cello)).toBeGreaterThan(maxRibTaperMm(params(32, 30)));
  });

  it('allows no taper at all where there is no run to tilt over', () => {
    const flat = { height: 10, overhang: 10, arching: defaultArchingParams(10) } as unknown as EnricoCerutiParams;
    expect(maxRibTaperMm(flat)).toBe(0);
  });

  it('holds a finite plane at the bound rather than a degenerate one', () => {
    const p = params(32, 32 - maxRibTaperMm(params(32, 30)));
    const t = solveRibTaper(p);
    expect(Number.isFinite(t.angle)).toBe(true);
    expect(Number.isFinite(ribHeightAt(p, BODY))).toBe(true);
    // At the bound the tilt is real but the plane is still a plane.
    expect(t.angle).toBeGreaterThan(0);
    expect(t.angle).toBeLessThan(Math.PI / 2);
  });
});

describe('rib heights on load', () => {
  // A recipe from before the split carries the single field and neither half of
  // the pair, so the fixture has to drop what the defaults would otherwise seed.
  const legacy = (ribHeight: number): EnricoCerutiParams => {
    const arching = { ...defaultArchingParams(BODY), ribHeight } as ArchingParams & { ribHeight: number };
    delete (arching as Partial<ArchingParams>).ribHeightLower;
    delete (arching as Partial<ArchingParams>).ribHeightUpper;
    return { height: BODY, overhang: OVERHANG, arching } as unknown as EnricoCerutiParams;
  };

  it('splits a single ribHeight into an untapered pair', () => {
    const p = legacy(29);
    normalizeArchingParams(p);
    expect(p.arching!.ribHeightLower).toBe(29);
    expect(p.arching!.ribHeightUpper).toBe(29);
    expect('ribHeight' in p.arching!).toBe(false);
  });

  it('does not invent a taper — a saved instrument must load as it was drawn', () => {
    const p = legacy(29);
    normalizeArchingParams(p);
    expect(solveRibTaper(p).angle).toBe(0);
  });

  it('is idempotent', () => {
    const p = legacy(29);
    normalizeArchingParams(p);
    const once = JSON.parse(JSON.stringify(p.arching));
    normalizeArchingParams(p);
    expect(p.arching).toEqual(once);
  });

  it('leaves a current-format pair alone', () => {
    const p = params(32, 30);
    normalizeArchingParams(p);
    expect(p.arching!.ribHeightLower).toBe(32);
    expect(p.arching!.ribHeightUpper).toBe(30);
  });

  it('mirrors a half-written pair rather than leaving the plane undefined', () => {
    const p = {
      height: BODY,
      overhang: OVERHANG,
      arching: { ...defaultArchingParams(BODY), ribHeightUpper: undefined } as unknown as ArchingParams,
    } as unknown as EnricoCerutiParams;
    normalizeArchingParams(p);
    expect(p.arching!.ribHeightUpper).toBe(p.arching!.ribHeightLower);
  });
});

describe('the taper is a placement fact, not a carving one', () => {
  // The acceptance property for the whole change: a plate is carved against its
  // own gluing plane, so nothing the surface model, the templates or the STL
  // produce may move when the ribs tilt. Only where the plate *sits* does.
  it('leaves the top plate\'s own frame alone when the ribs tilt', () => {
    const flat = templateViolin('ceruti-new', true);
    flat.arching!.ribHeightLower = 32;
    flat.arching!.ribHeightUpper = 32;
    const tapered = JSON.parse(JSON.stringify(flat)) as EnricoCerutiParams;
    tapered.arching!.ribHeightUpper = 30;

    const a = buildPlateSurfaceModel(flat, 'top')!;
    const b = buildPlateSurfaceModel(tapered, 'top')!;
    // Both plates are the same object, referenced off the rib height at the
    // body datum — which the taper leaves where it was, to within the
    // perpendicular correction.
    expect(b.zBase - a.zBase).toBeLessThan(0.001);
    expect(b.arch).toEqual(a.arch);
  });

  it('never moves the back plate, which glues to a plane the taper does not touch', () => {
    const p = templateViolin('ceruti-new', true);
    const before = buildPlateSurfaceModel(p, 'bottom')!.zBase;
    p.arching!.ribHeightUpper = p.arching!.ribHeightLower - 6;
    expect(buildPlateSurfaceModel(p, 'bottom')!.zBase).toBe(before);
  });
});
