// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CORPUS_TEMPLATES } from './corpus';
import { VIOLIN_FAMILY_PANEL_IDS, VIOLIN_FAMILY_RECIPE_NAME, VIOLIN_FAMILY_SCHEMA_VERSION } from '../violin-family-types';
import { solveMainBouts } from '../panels/main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../panels/corners-panel/corners-panel';
import { solveCenterBout } from '../panels/center-bout-panel/center-bout-panel';
import { solveOuterContour } from '../panels/outer-contour-panel/outer-contour-panel';
import { solveFluting } from '../panels/fluting-panel/fluting-panel';
import { solveFholeContours } from '../panels/fhole-contours-panel/fhole-contours-panel';
import { solveLongArching } from '../panels/long-arching-panel/long-arching-panel';
import { solveCrossArching } from '../panels/cross-arching-panel/cross-arching-panel';
import { solveNeck } from '../panels/neck-panel/neck-panel';
import { solveStringSetup } from '../panels/string-setup-panel/string-setup-panel';
import { solveScroll } from '../panels/scroll-panel/scroll-panel';
import { solveScrollWidths } from '../panels/scroll-widths-panel/scroll-widths-panel';

// the served set, and the only spec that reads it: a file here is re-saved from the app whenever an
// instrument is retraced, so anything else would pin work that touched nothing near it
describe('CORPUS_TEMPLATES', () => {
  it('are Violin Family recipes, each distinguishable by key', () => {
    expect(CORPUS_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of CORPUS_TEMPLATES) {
      expect(t.recipeName, t.key).toBe(VIOLIN_FAMILY_RECIPE_NAME);
      expect(t.version, t.key).toBe(VIOLIN_FAMILY_SCHEMA_VERSION);
    }
    const keys = CORPUS_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(k => k.length > 0)).toBe(true);
  });

  it('cite a record, and every reference image its holder', () => {
    for (const t of CORPUS_TEMPLATES) {
      expect(t.source, `${t.key} source`).toBeTruthy();
      for (const img of t.referenceImages ?? []) expect(img.credit, `${t.key} ${img.id} credit`).toBeTruthy();
    }
  });

  // a mistyped or retired panel id means the image is never drawn, silently
  it('scope every reference image to panels that exist', () => {
    const valid = new Set<string>(VIOLIN_FAMILY_PANEL_IDS);
    const bad = CORPUS_TEMPLATES.flatMap(t =>
      (t.referenceImages ?? []).flatMap(img =>
        (img.scope ? 'only' in img.scope ? img.scope.only : img.scope.except : [])
          .filter(id => !valid.has(id)).map(id => `${t.key}: ${id}`)));
    expect(bad).toEqual([]);
  });

  // arching values come off a side profile; without one they would be invented for a real instrument
  it('carry arching only beside a profile image to read it from', () => {
    const bad = CORPUS_TEMPLATES.filter(t => t.params.arching &&
      !(t.referenceImages ?? []).some(img => img.scope && 'only' in img.scope && img.scope.only.includes('longArching')));
    expect(bad.map(t => t.key)).toEqual([]);
  });

  it('solve at every stage they carry, with nothing left unsolved', () => {
    for (const t of CORPUS_TEMPLATES) {
      const p = t.params;
      type Stage = [string, { failures: { message: string }[] } | null];
      const stages: Stage[] = [
        ['main bouts', solveMainBouts(p)],
        ['corners', solveCorners(p)],
        ['center bout', solveCenterBout(p)],
        ['outer contour', solveOuterContour(p)],
      ];
      if (p.fluting) stages.push(['fluting', solveFluting(p)]);
      if (p.fHoleContours) stages.push(['f-hole contours', solveFholeContours(p)]);
      if (p.arching) stages.push(['long arching', solveLongArching(p)], ['cross arching', solveCrossArching(p)]);
      if (p.neck) stages.push(['neck', solveNeck(p)]);
      if (p.stringSetup) stages.push(['string setup', solveStringSetup(p)]);
      if (p.scroll) stages.push(['scroll', solveScroll(p)], ['scroll widths', solveScrollWidths(p)]);
      const failed = stages.flatMap(([name, solve]) =>
        solve ? solve.failures.map(f => `${t.key} ${name}: ${f.message}`) : [`${t.key} ${name}: no solve`]);
      expect(failed).toEqual([]);
    }
  });
});
