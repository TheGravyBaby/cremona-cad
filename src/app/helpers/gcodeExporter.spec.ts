// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildGcode, GcodeJob } from './gcodeExporter';

// what a maker would check before loading the file: the bit only travels fast up at the safe
// height, every drop is at plunge feed, nothing goes below the floor, the tabs are left standing
// on the deep passes, and the job ends retracted with the router off

const square = (size: number) => [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }, { x: 0, y: 0 }];

const job = (over: Partial<GcodeJob> = {}): GcodeJob => ({
  notes: ['Z0 = SPOILBOARD'],
  tool: { number: 251, name: '1/4" downcut' },
  spindleRpm: 18000,
  safeZ: 31.7,
  floorZ: -0.2,
  passes: [17.5, 16, 14.5, 13, 11.5, 10, 8.5, 7, 5.5, 4, 2.5, 1, -0.2],
  tabTop: 3,
  cutFeed: 1905,
  plungeFeed: 381,
  cuts: [{ name: 'square', loop: square(100), tabs: [{ from: 40, to: 60 }, { from: 240, to: 260 }] }],
  ...over,
});

interface Move { g: 'G0' | 'G1'; x?: number; y?: number; z?: number; f?: number }

const moves = (text: string): Move[] => text.split('\n').filter(l => /^G[01]\b/.test(l)).map(l => {
  const m: Move = { g: l.startsWith('G0') ? 'G0' : 'G1' };
  for (const [, axis, value] of l.matchAll(/([XYZF])(-?[\d.]+)/g)) (m as any)[axis.toLowerCase()] = +value;
  return m;
});

// the bit's position after each move, feeds carried forward as the controller carries them
const trace = (text: string): (Move & { z: number; f: number })[] => {
  let z = NaN, f = NaN;
  return moves(text).map(m => {
    if (m.z !== undefined) z = m.z;
    if (m.f !== undefined) f = m.f;
    return { ...m, z, f };
  });
};

describe('buildGcode', () => {
  const text = buildGcode(job());
  const path = trace(text);

  it('opens in absolute millimetres and ends retracted with the spindle off', () => {
    const lines = text.trim().split('\n');
    expect(lines.slice(0, 20)).toEqual(expect.arrayContaining(['G90', 'G21']));
    expect(lines.indexOf('M3 S18000')).toBeLessThan(lines.findIndex(l => /^G1\b/.test(l)));
    expect(lines.slice(-3)).toEqual([`G0 Z31.700`, 'M5', 'M2']);
  });

  it('only moves fast at the safe height', () => {
    for (const m of path.filter(m => m.g === 'G0')) {
      if (m.z !== undefined && m.x === undefined) expect(m.z).toBe(31.7);
      else expect(m.z).toBe(31.7);
    }
  });

  it('drops at plunge feed and cuts at cut feed, one axis group per line', () => {
    let f = NaN;
    for (const m of moves(text).filter(m => m.g === 'G1')) {
      if (m.f !== undefined) f = m.f;
      const zOnly = m.z !== undefined && m.x === undefined && m.y === undefined;
      expect(zOnly || (m.z === undefined && m.x !== undefined)).toBe(true);
      expect(f).toBe(zOnly ? 381 : 1905);
    }
  });

  it('never goes below the floor', () => {
    for (const m of path) expect(m.z).toBeGreaterThanOrEqual(-0.2);
    expect(() => buildGcode(job({ passes: [10, -1] }))).toThrow(/floor/);
  });

  it('stays down between passes and plunges once per cut', () => {
    const plunges = moves(text).filter(m => m.g === 'G1' && m.z !== undefined && m.x === undefined);
    const fromSafe = plunges.filter((m, i, all) => i === 0 || all[i - 1].z === undefined);
    expect(fromSafe.length).toBeGreaterThan(0);
    expect(moves(text).filter(m => m.g === 'G0' && m.x !== undefined).length).toBe(1);
  });

  it('lifts over each tab on the passes below it and not above', () => {
    const steps = path.filter(m => m.g === 'G1');
    // the deep passes: a lift to the tab top appears, as many times as there are tabs per pass
    const lifts = steps.filter(m => m.x === undefined && m.z === 3);
    const deepPasses = job().passes.filter(z => z < 3).length;
    expect(lifts.length).toBe(deepPasses * 2);
    // above the tabs nothing is lifted: Z only ever steps down
    const shallow = steps.filter(m => m.x === undefined && m.z > 3);
    for (let i = 1; i < shallow.length; i++) expect(shallow[i].z).toBeLessThan(shallow[i - 1].z);
  });

  it('runs the tab span at the tab top, not the pass depth', () => {
    const cuts = path.filter(m => m.g === 'G1' && m.x !== undefined);
    // the run into the tab's far end: never below the tab top, and exactly there on every deep pass
    const inTab = cuts.filter(m => m.y === 0 && m.x! > 40 && m.x! <= 60);
    const deepPasses = job().passes.filter(z => z < 3).length;
    expect(inTab.filter(m => m.z === 3).length).toBe(deepPasses);
    for (const m of inTab) expect(m.z).toBeGreaterThanOrEqual(3);
    // the run past it goes back to the pass depth
    const pastTab = cuts.filter(m => m.y === 0 && m.x! > 60);
    expect(pastTab.filter(m => m.z < 3).length).toBe(deepPasses);
  });

  it('refuses a safe height that does not clear the work', () => {
    expect(() => buildGcode(job({ safeZ: 10 }))).toThrow(/safe/);
  });
});
