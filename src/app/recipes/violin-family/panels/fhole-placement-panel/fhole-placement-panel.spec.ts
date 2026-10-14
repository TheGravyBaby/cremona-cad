// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FHolePlacementPanel, fholeBounds, solveFholePlacementRatios, stemRun } from './fhole-placement-panel';
import { OuterContourPanel } from '../outer-contour-panel/outer-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FHOLE_SEED_RATIOS, ViolinFamilyParams } from '../../violin-family-types';

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
