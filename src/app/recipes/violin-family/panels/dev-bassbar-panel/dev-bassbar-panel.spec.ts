// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DevBassBarPanel, solveBassBar } from './dev-bassbar-panel';
import { DevGraduationPanel } from '../dev-graduation-panel/dev-graduation-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  PlateContourPanel.seed(p);
  FHolePlacementPanel.seed(p);
  DevGraduationPanel.seed(p);
  DevBassBarPanel.seed(p);
  return p;
};

describe('the bass bar', () => {
  it('seeds once the top is graduated, once only, and solves its seed', () => {
    const q = blank();
    MainBoutsPanel.seed(q);
    DevBassBarPanel.seed(q);
    expect(q.bassBar).toBeUndefined();

    const p = seeded();
    p.bassBar!.length += 7;
    const edited = p.bassBar!.length;
    DevBassBarPanel.seed(p);
    expect(p.bassBar!.length).toBe(edited);
    expect(solveBassBar(p)!.failures).toEqual([]);
  });

  it('never writes to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveBassBar(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('reports a cleared field rather than drawing it', () => {
    for (const key of ['length', 'width', 'height'] as const) {
      const p = seeded();
      (p.bassBar as any)[key] = null;
      expect(solveBassBar(p)!.failures.length, key).toBeGreaterThan(0);
    }
  });
});
