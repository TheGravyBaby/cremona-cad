// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { dist, TURN } from '../../../../helpers/math/simpleGeometry';
import { FHolePlacementPanel, fholeBounds, fholeNotches, solveFholePlacementRatios, stemEdgeAt, stemEdgePoints, stemRun } from './fhole-placement-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { Pt } from '../../../../models/types';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FHOLE_SEED_RATIOS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const withPlates = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  OuterContourPanel.seed(p);
  return p;
};

const placed = (p = blank()): ViolinFamilyParams => {
  withPlates(p);
  FHolePlacementPanel.seed(p);
  return p;
};

describe('the f-hole placement', () => {
  it('seeds nothing until the plate has solved, and once only', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    CornersPanel.seed(q);
    FHolePlacementPanel.seed(q);
    expect(q.fHoles).toBeUndefined();

    const p = placed();
    p.fHoles!.URise += 1;
    const edited = JSON.stringify(p);
    FHolePlacementPanel.seed(p);
    expect(JSON.stringify(p)).toBe(edited);
  });

  it('seeds the eyes on the treble side, the lower just under the lower corner and the smaller upper one in toward the waist, with the stem between them', () => {
    const p = placed();
    const f = p.fHoles!;
    const k = p.corners!;
    const C0 = solveCenterBout(p)!.C0!;
    expect(f.LEye.x).toBeGreaterThan(0);
    expect(f.LEye.x).toBeLessThan(k.LCr.x);
    expect(f.LEye.y).toBeLessThan(k.LCr.y);
    expect(f.LEye.y).toBeGreaterThan(k.LCr.y * 0.9);
    expect(f.UEye.r).toBeLessThan(f.LEye.r);
    expect(f.UEye.x).toBeLessThan(f.LEye.x);
    expect(f.UEye.y).toBeGreaterThan(f.LEye.y);
    // the upper eye sits inside the waist, where the hole has to fit
    expect(f.UEye.x + f.UEye.r).toBeLessThan(C0.x - C0.r);
    expect(f.stem.center.x).toBeGreaterThan(f.UEye.x);
    expect(f.stem.center.x).toBeLessThan(f.LEye.x + f.LEye.r);
    expect(f.stem.center.y).toBeGreaterThan(f.LEye.y);
    expect(f.stem.center.y).toBeLessThan(f.UEye.y);
    expect(f.stem.width).toBeGreaterThan(0);
    expect(f.URise).toBeGreaterThan(f.UEye.r);
    expect(f.LRise).toBeGreaterThan(f.LEye.r);
    for (const v of [f.UEye.x, f.UEye.y, f.URise, f.stem.center.x, f.stem.width]) expect(Math.round(v * 100) / 100).toBe(v);
  });

  it('carves the box out of the eyes and their rises, taller than it is wide', () => {
    const f = placed().fHoles!;
    const box = fholeBounds(f);
    expect(box.Pt1.x).toBeCloseTo(f.UEye.x - f.UEye.r, 9);
    expect(box.Pt1.y).toBeCloseTo(f.UEye.y + f.UEye.r + f.URise, 9);
    expect(box.Pt2.x).toBeCloseTo(f.LEye.x + f.LEye.r, 9);
    expect(box.Pt2.y).toBeCloseTo(f.LEye.y - f.LEye.r - f.LRise, 9);
    expect(box.height!).toBeGreaterThan(box.width!);
  });

  it('leans the stem by its angle: upright runs straight, past upright its top leans toward the upper eye', () => {
    expect(stemRun({ center: { x: 0, y: 0 }, width: 6, angle: 90 })).toBeCloseTo(0, 9);
    expect(stemRun({ center: { x: 0, y: 0 }, width: 6, angle: 92 })).toBeLessThan(0);
  });

  it('measures the stem square across itself, half the width either side of the centre', () => {
    const stem = { center: new Pt(40, 160), width: 6, angle: 94 };
    const { inner, outer } = stemEdgePoints(stem);
    expect(dist(inner, outer)).toBeCloseTo(stem.width, 9);
    expect((inner.x + outer.x) / 2).toBeCloseTo(stem.center.x, 9);
    expect((inner.y + outer.y) / 2).toBeCloseTo(stem.center.y, 9);
    // square to the stem's own direction, so the edges measured along x stand wider than the width
    const angle = stem.angle * TURN.degree;
    expect((outer.x - inner.x) * Math.cos(angle) + (outer.y - inner.y) * Math.sin(angle)).toBeCloseTo(0, 9);
    expect(stemEdgeAt(stem, outer, stem.center.y).x - stemEdgeAt(stem, inner, stem.center.y).x).toBeGreaterThan(stem.width);
  });

  it('cuts a notch into each stem edge off the perpendicular through the stem centre, the inner below it and the outer above, sized by the stem width', () => {
    const p = placed();
    const f = p.fHoles!;
    f.stem.angle = 94;
    const angle = f.stem.angle * TURN.degree;
    const along = (a: Pt, b: Pt) => (b.x - a.x) * Math.cos(angle) + (b.y - a.y) * Math.sin(angle);
    const across = (a: Pt, b: Pt) => (b.x - a.x) * Math.sin(angle) - (b.y - a.y) * Math.cos(angle);
    const mid = (n: { top: Pt; bottom: Pt }) => new Pt((n.top.x + n.bottom.x) / 2, (n.top.y + n.bottom.y) / 2);
    const depthOf = (n: { top: Pt; apex: Pt; bottom: Pt }) => across(mid(n), n.apex);
    const { inner, outer } = fholeNotches(f);
    // one corner of each mouth is where the perpendicular through the centre meets its edge
    const edges = stemEdgePoints(f.stem);
    expect(dist(inner.top, edges.inner)).toBeLessThan(1e-9);
    expect(dist(outer.bottom, edges.outer)).toBeLessThan(1e-9);
    // the inner notch hangs below the perpendicular, the outer stands above it
    expect(along(inner.top, inner.bottom)).toBeLessThan(0);
    expect(along(outer.bottom, outer.top)).toBeGreaterThan(0);
    expect(dist(outer.top, outer.bottom)).toBeCloseTo(dist(inner.top, inner.bottom), 9);
    for (const [n, side] of [[inner, -1], [outer, 1]] as const) {
      // the mouth runs along the edge, the apex midway along it and square out into the wood
      expect(across(n.top, n.bottom)).toBeCloseTo(0, 9);
      expect(along(mid(n), n.apex)).toBeCloseTo(0, 9);
      expect(side * depthOf(n)).toBeGreaterThan(0);
      // shallow: well under half as deep as the mouth is long
      expect(Math.abs(depthOf(n))).toBeLessThan(dist(n.top, n.bottom) / 2);
    }
    expect(depthOf(outer)).toBeCloseTo(-depthOf(inner), 9);

    const depth = depthOf(outer);
    f.UEye.r *= 2;
    expect(depthOf(fholeNotches(f).outer)).toBeCloseTo(depth, 9);
    f.stem.width *= 2;
    expect(depthOf(fholeNotches(f).outer)).toBeCloseTo(2 * depth, 9);
  });

  it('reads the eyes against the body and each other', () => {
    const p = placed();
    const r = solveFholePlacementRatios(p);
    expect(r.LEyetoW).toBeCloseTo(p.fHoles!.LEye.r / p.body.width, 12);
    expect(r.UEyetoLEye).toBeCloseTo(p.fHoles!.UEye.r / p.fHoles!.LEye.r, 12);
    expect(solveFholePlacementRatios(blank())).toEqual({});
  });

  // the seed rounds each value to a hundredth, so a fresh draft reads back its seed fractions to
  // within that rounding and no further
  it('reads a fresh draft back at its seed fractions', () => {
    const r = solveFholePlacementRatios(placed());
    for (const key of ['UEyetoLEye', 'URisetoUEye', 'LRisetoLEye', 'StemXtoFrame', 'StemYtoFrame', 'StemWtoUEye', 'LEyeXtoLCX', 'LEyeYtoLCY', 'EyeSpantoWaist'] as const)
      expect(r[key], key).toBeCloseTo(FHOLE_SEED_RATIOS[key], 1);
    expect(r.UEyeGuidetoWaist!).toBeCloseTo(FHOLE_SEED_RATIOS.UEyeGuidetoWaist, 1);
  });
});
