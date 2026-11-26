// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { solveMainBouts } from '../panels/main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../panels/corners-panel/corners-panel';
import { solvePlateContour } from '../panels/plate-contour-panel/plate-contour-panel';
import { solveFholeContours } from '../panels/fhole-contours-panel/fhole-contours-panel';
import { solveLongArching } from '../panels/long-arching-panel/long-arching-panel';
import { solveMould } from '../panels/mould-panel/mould-panel';
import { solveNeck } from '../panels/neck-panel/neck-panel';
import { solveStringSetup } from '../panels/string-setup-panel/string-setup-panel';
import { VIOLIN_FAMILY_PANEL_IDS } from '../violin-family-types';
import { normalizeViolinFamilyRecipe, recipeFormat } from './violin-family-normalizer';
import amati from './fixtures/0.9.0/amati-violin-brookings-2022560097.json';

// A file as 0.9.0 wrote it: that release's served Amati. The Ceruti files have their own spec
const file090 = (): any => JSON.parse(JSON.stringify(amati));

describe('a 0.9.0 file', () => {
  it('is recognised by its version, and solves at every stage the release changed', () => {
    expect(recipeFormat(amati)).toBe('0.9.0');
    const p = normalizeViolinFamilyRecipe(file090())!.params;
    for (const solve of [solveMainBouts, solveCorners, solvePlateContour, solveFholeContours, solveLongArching, solveMould, solveNeck, solveStringSetup]) {
      expect(solve(p)!.failures.map(f => f.message), solve.name).toEqual([]);
    }
  });

  it('keeps the join arcs it drew, on the bouts and level, and nothing of them on the corners', () => {
    const p = normalizeViolinFamilyRecipe(file090())!.params;
    expect(p.bouts).toMatchObject({ U2R: amati.params.corners.U2R, L2R: amati.params.corners.L2R, UJoinY: 0, LJoinY: 0 });
    for (const key of ['U2R', 'L2R', 'U2Y', 'L2Y']) expect(p.corners).not.toHaveProperty(key);
  });

  it('seeds the join arcs where the file stopped before the corners', () => {
    const file = file090();
    for (const stage of Object.keys(file.params)) if (!['body', 'bouts'].includes(stage)) delete file.params[stage];
    const p = normalizeViolinFamilyRecipe(file)!.params;
    expect(solveMainBouts(p)!.failures).toEqual([]);
  });

  it('turns the clamp box toggle into the choice it stood for', () => {
    const on = normalizeViolinFamilyRecipe(file090())!.params.mould!;
    expect(on.clampBox).toBe('windows');
    expect(on.windowInset).toBeGreaterThan(Math.max(on.neckBlock.height, on.endBlock.height));
    const off = file090();
    off.params.mould.clampBox = false;
    expect(normalizeViolinFamilyRecipe(off)!.params.mould!.clampBox).toBe('none');
  });

  it('shows on Main Bouts what was listed for the Center Bout, and leaves no scope naming a panel that is gone', () => {
    const file = file090();
    const img = (id: string, scope?: object) => ({ id, href: `/${id}.png`, x: 0, y: 0, width: 1, height: 1, scope });
    file.referenceImages = [
      img('only center', { only: ['centerBout'] }),
      img('both', { only: ['mainBouts', 'centerBout', 'corners'] }),
      img('off center', { except: ['centerBout'] }),
      img('off both', { except: ['centerBout', 'mainBouts'] }),
      img('elsewhere', { only: ['neck'] }),
    ];
    file.toolboxState = { layers: [{ id: 'l', name: 'L', scope: { only: ['centerBout'] } }], shapes: [] };
    const d = normalizeViolinFamilyRecipe(file)!;
    expect(Object.fromEntries(d.referenceImages!.map(i => [i.id, i.scope]))).toEqual({
      'only center': { only: ['mainBouts'] },
      both: { only: ['mainBouts', 'corners'] },
      'off center': undefined,
      'off both': { except: ['mainBouts'] },
      elsewhere: { only: ['neck'] },
    });
    expect((d.toolboxState as any).layers[0].scope).toEqual({ only: ['mainBouts'] });
    const named = [...d.referenceImages!, ...(d.toolboxState as any).layers].flatMap(i => i.scope?.only ?? i.scope?.except ?? []);
    for (const id of named) expect(VIOLIN_FAMILY_PANEL_IDS).toContain(id);
  });

  it('is left alone once it is in this release\'s shape, whatever version it says', () => {
    const once = normalizeViolinFamilyRecipe(file090())!;
    once.params.stringSetup!.bridgeWidth += 3;
    once.params.mould!.clampBox = 'holes';
    once.params.bouts!.UJoinY = 4;
    const twice = normalizeViolinFamilyRecipe(JSON.parse(JSON.stringify(once)))!;
    expect(twice).toEqual(JSON.parse(JSON.stringify(once)));
  });

  it('is not written on by the step', () => {
    const file = file090();
    normalizeViolinFamilyRecipe(file);
    expect(file).toEqual(file090());
  });
});
