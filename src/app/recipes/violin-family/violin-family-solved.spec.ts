// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { updateSolved } from './violin-family-solved';
import { PlateContourPanel, solvePlateContour, solvedPlateContour } from './panels/plate-contour-panel/plate-contour-panel';
import { CornersPanel } from './panels/corners-panel/corners-panel';
import { MainBoutsPanel } from './panels/main-bouts-panel/main-bouts-panel';
import { FlutingPanel, solveFluting, solvedFluting } from './panels/fluting-panel/fluting-panel';
import { FHolePlacementPanel } from './panels/fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel } from './panels/fhole-contours-panel/fhole-contours-panel';
import { LongArchingPanel } from './panels/long-arching-panel/long-arching-panel';
import { solvedCrossArching } from './panels/cross-arching-panel/cross-arching-panel';
import { DevGraduationPanel, gridPoints, solveGraduation, solvedGraduation, solvedThicknessField } from './panels/dev-graduation-panel/dev-graduation-panel';
import { DevBassBarPanel, solveBassBar } from './panels/dev-bassbar-panel/dev-bassbar-panel';
import { MouldPanel } from './panels/mould-panel/mould-panel';
import { ViolinFamilyParams } from './violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from './violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  FlutingPanel.seed(p);
  return p;
};

const graduated = (): ViolinFamilyParams => {
  const p = seeded();
  FHolePlacementPanel.seed(p);
  FHoleContoursPanel.seed(p);
  LongArchingPanel.seed(p);
  DevGraduationPanel.seed(p);
  MouldPanel.seed(p);
  return p;
};

describe('the solves held on the params', () => {
  it('stand until a param they read moves', () => {
    const p = seeded();
    updateSolved(p);
    const contour = solvedPlateContour(p)!;
    const fluting = solvedFluting(p)!;
    expect(contour).toEqual(solvePlateContour(p));
    expect(fluting).toEqual(solveFluting(p));

    updateSolved(p);
    expect(solvedPlateContour(p)).toBe(contour);
    expect(solvedFluting(p)).toBe(fluting);
  });

  it('clear a stage when its own params move, and leave its parent standing', () => {
    const p = seeded();
    updateSolved(p);
    const contour = solvedPlateContour(p)!;
    const fluting = solvedFluting(p)!;

    p.fluting!.top.width += 1;
    updateSolved(p);
    expect(p.solved!.fluting.solve).toBeUndefined();
    expect(p.solved!.plateContour.solve).toBe(contour);
    expect(solvedFluting(p)).not.toBe(fluting);
    expect(solvedFluting(p)).toEqual(solveFluting(p));
  });

  it('clear a stage and its children together', () => {
    const p = seeded();
    updateSolved(p);
    const contour = solvedPlateContour(p)!;
    const fluting = solvedFluting(p)!;

    p.body.overhang += 0.5;
    updateSolved(p);
    expect(p.solved!.plateContour.solve).toBeUndefined();
    expect(p.solved!.fluting.solve).toBeUndefined();
    expect(solvedPlateContour(p)).not.toBe(contour);
    expect(solvedFluting(p)).not.toBe(fluting);
    expect(solvedFluting(p)).toEqual(solveFluting(p));
  });

  it('hold the plates apart, so one plate\'s arch leaves the other\'s surface standing', () => {
    const p = graduated();
    const before = solvedCrossArching(p)!;
    expect(before.top).not.toBeNull();
    expect(before.back).not.toBeNull();

    p.arching!.top.long.height += 0.5;
    let after = solvedCrossArching(p)!;
    expect(after.top).not.toBe(before.top);
    expect(after.back).toBe(before.back);

    p.fluting!.back.depth += 0.1;
    after = solvedCrossArching(p)!;
    expect(after.back).not.toBe(before.back);
  });

  it('leave the graduation\'s boundary standing through a point edit, and clear it on a mould edit', () => {
    const p = graduated();
    const boundary = solvedGraduation(p)!;
    p.graduation!.top.points.push({ x: 10, y: p.body.height / 2, thickness: 3 });
    expect(solvedGraduation(p)).toBe(boundary);

    p.mould!.neckBlock.width += 10;
    expect(solvedGraduation(p)).not.toBe(boundary);
    expect(solvedGraduation(p)).toEqual(solveGraduation(p));
  });

  it('clear a plate\'s thickness field on a reading, leaving its land and the other plate standing', () => {
    const p = graduated();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    p.graduation!.back.points = gridPoints(p, 30, 'back').map(pt => ({ ...pt, thickness: 4 }));
    const top = solvedThicknessField(p, 'top')!;
    const back = solvedThicknessField(p, 'back')!;
    const land = p.solved!.landTop.solve;
    expect(land).toBeTruthy();

    p.graduation!.top.points[0].thickness += 0.5;
    expect(solvedThicknessField(p, 'top')).not.toBe(top);
    expect(solvedThicknessField(p, 'back')).toBe(back);
    expect(p.solved!.landTop.solve).toBe(land);

    p.arching!.top.long.height += 0.5;
    solvedThicknessField(p, 'top');
    expect(p.solved!.landTop.solve).not.toBe(land);
    expect(solvedThicknessField(p, 'back')).toBe(back);
  });

  it('leave the bar\'s contact with the top standing through a depth edit, and clear it when the bar moves', () => {
    const p = graduated();
    p.graduation!.top.points = gridPoints(p, 30, 'top').map(pt => ({ ...pt, thickness: 3 }));
    DevBassBarPanel.seed(p);
    expect(solveBassBar(p)!.failures).toEqual([]);
    const contact = p.solved!.bassBarContact.solve;
    expect(contact).toBeTruthy();

    p.bassBar!.points[0].h += 0.5;
    solveBassBar(p);
    expect(p.solved!.bassBarContact.solve).toBe(contact);

    p.bassBar!.xOffset += 1;
    solveBassBar(p);
    expect(p.solved!.bassBarContact.solve).not.toBe(contact);
  });

  it('hold a stage with no answer as null, not as cleared', () => {
    const p = blank();
    updateSolved(p);
    expect(solvedFluting(p)).toBeNull();
    expect(p.solved!.fluting.solve).toBeNull();
  });

  it('follow an edit at the next read, without being told of it', () => {
    const p = seeded();
    const fluting = solvedFluting(p)!;
    expect(solvedFluting(p)).toBe(fluting);
    p.plateContour!.U3Cutoff += 1;
    expect(solvedFluting(p)).not.toBe(fluting);
    expect(solvedFluting(p)).toEqual(solveFluting(p));
  });

  it('never reach a file, an undo entry or a copy of the params', () => {
    const p = seeded();
    const written = JSON.stringify(p);
    updateSolved(p);
    solvedFluting(p);
    expect(JSON.stringify(p)).toBe(written);
    expect({ ...p }.solved).toBeUndefined();
    expect(JSON.parse(JSON.stringify(p)).solved).toBeUndefined();
  });
});
