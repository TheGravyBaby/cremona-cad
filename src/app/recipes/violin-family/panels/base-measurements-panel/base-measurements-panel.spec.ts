// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { solveBody, solveBodyRatios } from './base-measurements-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

describe('the body', () => {
  it('boxes the body on the centreline from y = 0 to the height', () => {
    const p = blank();
    const { outer } = solveBody(p);
    expect(outer.Pt1.x).toBeCloseTo(-outer.Pt2.x, 9);
    expect(Math.min(outer.Pt1.y, outer.Pt2.y)).toBeCloseTo(0, 9);
    expect(outer.height).toBeCloseTo(p.body.height, 9);
    expect(outer.width).toBeCloseTo(p.body.width, 9);
  });

  it('insets the rib box by the overhang and the rib on every side', () => {
    const p = blank();
    const { outer, ribBox, inset } = solveBody(p);
    expect(inset).toBeCloseTo(p.body.overhang + p.body.rib, 9);
    expect(outer.width! - ribBox.width!).toBeCloseTo(2 * inset, 9);
    expect(outer.height! - ribBox.height!).toBeCloseTo(2 * inset, 9);
  });

  it('reports a measurement out of range instead of clamping it, and draws no box', () => {
    const p = blank();
    p.body.overhang = 0.5;
    const body = solveBody(p);
    expect(body.failures.map(f => f.unsolved)).toEqual([['overhang']]);
    expect(body.failures[0].message).toContain('at least 1mm');
    expect(body.outer).toBeNull();
    expect(p.body.overhang).toBe(0.5);
  });

  it('asks for a cleared measurement rather than drawing NaN', () => {
    const p = blank();
    (p.body as any).height = null;
    const body = solveBody(p);
    expect(body.failures[0].message).toBe('Height needs a value.');
    expect(body.ribBox).toBeNull();
  });

  it('reads its height to width ratio off the params', () => {
    const p = blank();
    expect(solveBodyRatios(p).HtoW).toBeCloseTo(p.body.height / p.body.width, 12);
  });
});
