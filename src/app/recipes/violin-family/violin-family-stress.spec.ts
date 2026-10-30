// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FAMILY_STANDARDS, familyStandards, SEED_RATIOS } from './violin-family-seed';
import { BodyParams, ViolinFamilyParams } from './violin-family-types';
import { SolveFailure } from '../../helpers/validators';
import { MainBoutsPanel, solveMainBouts } from './panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel, solveCorners } from './panels/corners-panel/corners-panel';
import { solveCenterBout } from './panels/center-bout-panel/center-bout-panel';
import { PlateContourPanel, solvePlateContour } from './panels/plate-contour-panel/plate-contour-panel';
import { FlutingPanel, solveFluting } from './panels/fluting-panel/fluting-panel';
import { FHolePlacementPanel } from './panels/fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel, solveFholeContours } from './panels/fhole-contours-panel/fhole-contours-panel';
import { LongArchingPanel, solveLongArching } from './panels/long-arching-panel/long-arching-panel';
import { solveCrossArching } from './panels/cross-arching-panel/cross-arching-panel';
import { NeckPanel, solveNeck } from './panels/neck-panel/neck-panel';
import { VolutePanel } from './panels/volute-panel/volute-panel';
import { solveScroll } from './panels/scroll-panel/scroll-panel';
import { solveScrollWidths } from './panels/scroll-widths-panel/scroll-widths-panel';
import { StringSetupPanel, solveStringSetup } from './panels/string-setup-panel/string-setup-panel';
import { MouldPanel, solveMould } from './panels/mould-panel/mould-panel';

// Stress tests for the recipe as a system: a design is seeded whole, then one number at a time
// is nudged and every stage that could read it is re-solved. Nothing here judges the shape; the
// oracles are the ones a solver can't argue with. A stage that returns null or a failure for a
// design near the default, a throw (which solveSection turns into a generic message), or a NaN in
// the output. A finding prints as the path nudged and the value set, so it can be applied to the
// default in the app and looked at.

interface Stage {
  id: string;
  solve: (p: ViolinFamilyParams) => { failures: SolveFailure[] } | null;
}

// bench order. A later stage reads earlier ones through their solvers, so the stages after an
// edit's first reader are what the edit can break
const CHAIN: Stage[] = [
  { id: 'mainBouts', solve: solveMainBouts },
  { id: 'corners', solve: solveCorners },
  { id: 'centerBout', solve: solveCenterBout },
  { id: 'plateContour', solve: solvePlateContour },
  { id: 'fluting', solve: solveFluting },
  { id: 'fHoleContours', solve: solveFholeContours },
  { id: 'longArching', solve: solveLongArching },
  { id: 'crossArching', solve: solveCrossArching },
  { id: 'neck', solve: solveNeck },
  { id: 'stringSetup', solve: solveStringSetup },
  { id: 'scroll', solve: solveScroll },
  { id: 'scrollWidths', solve: solveScrollWidths },
  { id: 'mould', solve: p => solveMould(p) },
];

const FIRST_READER: Record<keyof ViolinFamilyParams, string> = {
  body: 'mainBouts',
  bouts: 'mainBouts',
  corners: 'corners',
  plateContour: 'plateContour',
  fluting: 'fluting',
  fHoles: 'fHoleContours',
  fHoleContours: 'fHoleContours',
  arching: 'longArching',
  neck: 'neck',
  scroll: 'scroll',
  stringSetup: 'stringSetup',
  mould: 'mould',
  graduation: 'devGraduation',
};

const SEEDS = [MainBoutsPanel, CornersPanel, PlateContourPanel, FlutingPanel, FHolePlacementPanel,
  FHoleContoursPanel, LongArchingPanel, NeckPanel, VolutePanel, StringSetupPanel, MouldPanel];

function seedWhole(body: BodyParams): ViolinFamilyParams {
  const p: ViolinFamilyParams = { body: { ...body } };
  for (const panel of SEEDS) panel.seed(p);
  return p;
}

function bodyAt(height: number): BodyParams {
  const std = familyStandards(height);
  return { height, width: Math.round(height / SEED_RATIOS.HtoW), overhang: std.overhang, rib: std.rib };
}

const GENERIC = /can't be solved from these numbers/;

function firstBadNumber(v: unknown, path: string, seen = new Set<object>()): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${path} = ${v}`;
  if (!v || typeof v !== 'object' || seen.has(v)) return null;
  seen.add(v);
  for (const [k, x] of Object.entries(v)) {
    const bad = firstBadNumber(x, `${path}.${k}`, seen);
    if (bad) return bad;
  }
  return null;
}

// everything wrong with the design from `from` on, as one line per problem
function solveFrom(p: ViolinFamilyParams, from: string): string[] {
  const start = CHAIN.findIndex(s => s.id === from);
  const problems: string[] = [];
  for (const stage of CHAIN.slice(start)) {
    const solve = stage.solve(p);
    if (!solve) { problems.push(`${stage.id}: no solve`); continue; }
    for (const f of solve.failures) problems.push(`${stage.id}: ${GENERIC.test(f.message) ? 'THREW ' : ''}${f.message}`);
    const bad = firstBadNumber(solve, stage.id);
    if (bad) problems.push(`${stage.id}: not a number at ${bad}`);
  }
  return problems;
}

interface Leaf { stage: keyof ViolinFamilyParams; path: (string | number)[]; value: number }

function numericLeaves(p: ViolinFamilyParams): Leaf[] {
  const leaves: Leaf[] = [];
  const walk = (v: unknown, stage: keyof ViolinFamilyParams, path: (string | number)[]) => {
    if (typeof v === 'number') leaves.push({ stage, path, value: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, stage, [...path, i]));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, stage, [...path, k]));
  };
  for (const [k, v] of Object.entries(p)) walk(v, k as keyof ViolinFamilyParams, [k]);
  return leaves;
}

function withLeaf(p: ViolinFamilyParams, leaf: Leaf, value: number): ViolinFamilyParams {
  const q = structuredClone(p);
  let node: any = q;
  for (const k of leaf.path.slice(0, -1)) node = node[k];
  node[leaf.path[leaf.path.length - 1]] = value;
  return q;
}

const leafName = (leaf: Leaf) => leaf.path.join('.');

describe('seeded whole from a body', () => {
  const heights = [
    ...FAMILY_STANDARDS.filter(s => isFinite(s.below)).map(s => s.below - 1),
    ...FAMILY_STANDARDS.map((s, i) => (i ? FAMILY_STANDARDS[i - 1].below : 300)),
  ];

  it.each(heights)('solves clean at a body height of %d', height => {
    expect(solveFrom(seedWhole(bodyAt(height)), 'mainBouts')).toEqual([]);
  });
});

describe('the drafted default, one number nudged', () => {
  const base = seedWhole(DEFAULT_VIOLIN_FAMILY_PARAMS.body);
  // a zero is a switch (a hip height of none, a centred point); scaling it says nothing
  const leaves = numericLeaves(base).filter(l => l.value !== 0);

  it('starts from a design that solves clean', () => {
    expect(solveFrom(base, 'mainBouts')).toEqual([]);
  });

  const nudge = (factor: number) => leaves.flatMap(leaf => {
    const value = leaf.value * factor;
    return solveFrom(withLeaf(base, leaf, value), FIRST_READER[leaf.stage])
      .map(problem => `${leafName(leaf)} ${leaf.value} -> ${value}: ${problem}`);
  });

  it('still solves with any one number 5% off', () => {
    expect([...nudge(0.95), ...nudge(1.05)]).toEqual([]);
  });

  it('never throws or yields NaN with any one number 20% off', () => {
    const problems = [...nudge(0.8), ...nudge(1.2)];
    expect(problems.filter(line => /THREW|not a number|no solve/.test(line))).toEqual([]);
  });
});
