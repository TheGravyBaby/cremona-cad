// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pointOnCircle, signedRadianDelta } from '../../../helpers/math/simpleGeometry';
import { solveMainBouts } from '../panels/main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../panels/corners-panel/corners-panel';
import { solveCenterBout } from '../panels/center-bout-panel/center-bout-panel';
import { solvePlateContour } from '../panels/plate-contour-panel/plate-contour-panel';
import { gougeSweep, solveFluting } from '../panels/fluting-panel/fluting-panel';
import { solveFholeContours } from '../panels/fhole-contours-panel/fhole-contours-panel';
import { solveLongArching } from '../panels/long-arching-panel/long-arching-panel';
import { solveMould } from '../panels/mould-panel/mould-panel';
import { VIOLIN_FAMILY_PANEL_IDS, VIOLIN_FAMILY_RECIPE_NAME, ViolinFamilyRecipe } from '../violin-family-types';
import { normalizeViolinFamilyRecipe, recipeFormat } from './violin-family-normalizer';
import { LEGACY_CERUTI_RECIPE_NAME } from './legacy-ceruti';
import amati from './fixtures/legacy-ceruti/amati-violin-brookings-2022560097.json';
import goldbergBaronVitta from './fixtures/legacy-ceruti/guarneri-violin-goldberg-baron-vitta-2023870692.json';
import kreisler from './fixtures/legacy-ceruti/guarneri-violin-kreisler-2022560099.json';
import castelbarco from './fixtures/legacy-ceruti/stradivari-cello-castelbarco-2022560102.json';
import cassavetti from './fixtures/legacy-ceruti/stradivari-viola-cassavetti-2022560103.json';
import betts from './fixtures/legacy-ceruti/stradivari-violin-betts-2022560101.json';
import ward from './fixtures/legacy-ceruti/stradivari-violin-ward-2022560100.json';
import delGesu from './fixtures/legacy-ceruti/del-gesu-baltic-params.json';
import maggini from './fixtures/legacy-ceruti/maggini-delmas-params.json';
import ravatin from './fixtures/legacy-ceruti/ravatin-mans-params.json';

// Files as the 0.8 releases wrote them: the Ceruti recipe's served instruments, and three bare
// params its specs drafted against, put back in a file. Ceruti saved every solved arc, so a file
// checks its own conversion: solved again from what the normalizer read off it, each stage has to
// land on the arcs the file already holds
const asFile = (name: string, params: unknown) => ({ recipeName: LEGACY_CERUTI_RECIPE_NAME, fileName: name, version: '1', params });
// del-gesu was edited by hand after it was last solved, as a file can be when a panel was left
// unvisited: its plate corners and lower block were solved against corners it no longer has. Only
// what was typed for them carries over, so only that is checked
const STALE = new Set(['del-gesu']);
const LEGACY: [string, any][] = [
  ['amati', amati], ['goldberg-baron-vitta', goldbergBaronVitta], ['kreisler', kreisler], ['castelbarco', castelbarco],
  ['cassavetti', cassavetti], ['betts', betts], ['ward', ward],
  ['del-gesu', asFile('del-gesu', delGesu)], ['maggini', asFile('maggini', maggini)], ['ravatin', asFile('ravatin', ravatin)],
];

type Circleish = { x: number; y: number; r: number };
type Arcish = Circleish & { start: number; end: number };
const TOL = 1e-2;

const sameCircle = (ours: Circleish | null | undefined, theirs: Circleish, label: string) => {
  expect(ours, label).toBeTruthy();
  expect(Math.hypot(ours!.x - theirs.x, ours!.y - theirs.y), `${label} centre`).toBeLessThan(TOL);
  expect(Math.abs(ours!.r - theirs.r), `${label} radius`).toBeLessThan(TOL);
};

// the same drawn span, whichever way round each recipe ran it
const sameSpan = (ours: Arcish | null | undefined, theirs: Arcish, label: string) => {
  sameCircle(ours, theirs, label);
  let ends = (a: Arcish) => [pointOnCircle(a, a.start), pointOnCircle(a, a.end)];
  let [a0, a1] = ends(ours!);
  let [b0, b1] = ends(theirs);
  let gap = Math.min(
    Math.max(Math.hypot(a0.x - b0.x, a0.y - b0.y), Math.hypot(a1.x - b1.x, a1.y - b1.y)),
    Math.max(Math.hypot(a0.x - b1.x, a0.y - b1.y), Math.hypot(a1.x - b0.x, a1.y - b0.y)),
  );
  expect(gap, `${label} ends`).toBeLessThan(TOL);
};

const unsolved = (s: { failures: { unsolved: unknown[] }[] } | null) => (s?.failures ?? []).filter(f => f.unsolved.length);

describe.each(LEGACY)('a legacy Ceruti file: %s', (name, file) => {
  const c = file.params;
  const o = c.options;
  const d = normalizeViolinFamilyRecipe(JSON.parse(JSON.stringify(file)))!;
  const p = d.params;

  it('is recognised and becomes a Violin Family recipe in the format its step writes', () => {
    expect(recipeFormat(file)).toBe('legacy-ceruti');
    expect(d.recipeName).toBe(VIOLIN_FAMILY_RECIPE_NAME);
    expect(d.version).toBe('0.9.0');
    expect(d).not.toHaveProperty('paths');
    expect(d).not.toHaveProperty('key');
  });

  it('solves the main bouts and the viol neck to the arcs it saved', () => {
    const s = solveMainBouts(p)!;
    expect(unsolved(s)).toEqual([]);
    for (const k of ['U0', 'U1', 'L0', 'L1'] as const) sameCircle(s[k], c.bouts[k], k);
    if (o.useViolNeck) sameSpan(s.V0, c.viol.V0, 'V0');
  });

  it('solves the corners to the arcs it saved, compound ones through the same sweep', () => {
    const s = solveCorners(p)!;
    expect(unsolved(s)).toEqual([]);
    for (const k of ['U2', 'U3', 'L2', 'L3'] as const) sameCircle(s[k], c.bouts[k], k);
    if (o.U31DoubleArc) sameSpan(s.U31, c.bouts.U31, 'U31');
    if (o.L31DoubleArc) sameSpan(s.L31, c.bouts.L31, 'L31');
    const cb = solveCenterBout(p)!;
    expect(unsolved(cb)).toEqual([]);
    for (const k of ['C0', 'C2', 'C1'] as const) sameCircle(cb[k], c.bouts[k], k);
    if (o.C21DoubleArc) sameSpan(cb.C21, c.bouts.C21, 'C21');
    if (o.C11DoubleArc) sameSpan(cb.C11, c.bouts.C11, 'C11');
  });

  it('cuts the plate corners off where it saved them, and stands the button to the same tip', () => {
    const s = solvePlateContour(p)!;
    expect(unsolved(s)).toEqual([]);
    const compound = { U31: o.U31DoubleArc, L31: o.L31DoubleArc, C21: o.C21DoubleArc, C11: o.C11DoubleArc } as Record<string, boolean>;
    for (const [k, arc] of Object.entries(c.outerCorners as Record<string, Arcish | null>)) {
      if (!arc || compound[k] === false) continue;
      const ours = s.corners[k as keyof typeof s.corners] as Arcish;
      expect(Math.abs(signedRadianDelta(ours.end - arc.end)), `outer ${k} cutoff`).toBeLessThan(1e-4);
      if (STALE.has(name)) continue;
      const end = (a: Arcish) => pointOnCircle(a, a.end);
      sameCircle(ours, arc, `outer ${k}`);
      expect(Math.hypot(end(ours).x - end(arc).x, end(ours).y - end(arc).y), `outer ${k} end`).toBeLessThan(TOL);
    }
    if (!o.useViolNeck) {
      const U0 = c.bouts.U0, R = U0.r + c.overhang + c.rib, x = c.button.width / 2 - U0.x;
      const tip = U0.y + Math.sqrt(R * R - x * x) + c.button.height + c.button.width / 2;
      expect(Math.abs(s.button!.cap.y + s.button!.cap.r - tip), 'button tip').toBeLessThan(TOL);
    }
  });

  it('cuts each channel with the gouge it typed', () => {
    for (const [ours, theirs] of [[p.fluting?.top, c.arching?.top?.fluting], [p.fluting?.back, c.arching?.bottom?.fluting]]) {
      if (!theirs) continue;
      expect(Math.abs(gougeSweep(ours!.width, ours!.depth) - theirs.sweepRadius)).toBeLessThan(TOL);
      if (theirs.sweepRadius_cBout != null) expect(Math.abs(gougeSweep(ours!.cBoutWidth, ours!.depth) - theirs.sweepRadius_cBout)).toBeLessThan(TOL);
    }
    if (p.fluting) expect(unsolved(solveFluting(p))).toEqual([]);
    if (p.arching) expect(unsolved(solveLongArching(p))).toEqual([]);
  });

  it('cuts the f-holes along the arcs it saved', () => {
    if (!c.fHoles?.U1) return;
    const s = solveFholeContours(p)!;
    expect(unsolved(s)).toEqual([]);
    for (const k of ['U1', 'U2', 'U3', 'L1', 'L2', 'L3', 'S1', 'S2', 'S3', 'S4'] as const) sameSpan(s[k], c.fHoles[k], k);
    expect(s.path).toBeTruthy();
  });

  it('cuts the same blocks out of the mould', () => {
    if (!c.blocks?.U) return;
    const s = solveMould(p)!;
    expect(unsolved(s)).toEqual([]);
    const box = (r: any) => [Math.min(r.Pt1.x, r.Pt2.x), Math.min(r.Pt1.y, r.Pt2.y), Math.max(r.Pt1.x, r.Pt2.x), Math.max(r.Pt1.y, r.Pt2.y)];
    const pairs = [['neck', 'U'], ['upperCorner', 'CU'], ['lowerCorner', 'CL'], ['end', 'L']] as const;
    for (const [ours, theirs] of pairs) {
      expect(Math.abs(s.blocks![ours].width! - c.blocks[theirs].width), `${ours} block width`).toBeLessThan(TOL);
      expect(Math.abs(s.blocks![ours].height! - c.blocks[theirs].height), `${ours} block height`).toBeLessThan(TOL);
      if (STALE.has(name)) continue;
      box(s.blocks![ours]).forEach((v, i) => expect(Math.abs(v - box(c.blocks[theirs])[i]), `${ours} block`).toBeLessThan(TOL));
    }
  });

  it('scopes every image to panels that exist, and keeps none of the old visibility fields', () => {
    const ids = new Set<string>(VIOLIN_FAMILY_PANEL_IDS);
    for (const img of d.referenceImages ?? []) {
      for (const old of ['panels', 'excludePanels', 'isDefault', 'hidden', 'xlink:href']) expect(img).not.toHaveProperty(old);
      const scope = img.scope;
      if (scope) for (const id of 'only' in scope ? scope.only : scope.except) expect(ids.has(id), id).toBe(true);
    }
    for (const layer of (d.toolboxState as any)?.layers ?? []) expect(layer).not.toHaveProperty('visible');
  });
});

describe('the normalizer', () => {
  it('passes this release\'s own files through and turns away what it doesn\'t know', () => {
    const current = normalizeViolinFamilyRecipe(JSON.parse(JSON.stringify(betts)))!;
    expect(normalizeViolinFamilyRecipe(JSON.parse(JSON.stringify(current)))).toEqual(current);
    expect(normalizeViolinFamilyRecipe({ recipeName: 'hello-world', params: {} })).toBeNull();
    expect(normalizeViolinFamilyRecipe('not a recipe')).toBeNull();
  });

  it('carries a cycloid long arch over as a spline through its heights, peaking where it did', () => {
    const file = JSON.parse(JSON.stringify(amati));
    file.params.arching.top.arch = { type: 'cycloid', archHeight: 15, d: 0.6 };
    const p = normalizeViolinFamilyRecipe(file)!.params;
    expect(p.arching!.top.long).toMatchObject({ type: 'spline', height: 15, peak: 50 });
    expect(p.arching!.top.long.points.every(pt => pt.mirror && pt.z > 0 && pt.z < 15)).toBe(true);
    expect(unsolved(solveLongArching(p))).toEqual([]);
  });

  it('shows a hidden image nowhere, a listed one only where listed, and a default one where no other is listed', () => {
    const img = (id: string, extra: object) => ({ id, href: `/${id}.png`, x: 0, y: 0, width: 1, height: 1, ...extra });
    const file = asFile('scoped', amati.params) as any;
    file.referenceImages = [
      img('hidden', { hidden: true, panels: ['base'] }),
      img('listed', { panels: ['outerTrace', 'fluting'], excludePanels: ['fluting'] }),
      img('default', { isDefault: true, excludePanels: ['export'] }),
      img('excluded', { excludePanels: ['longArching'] }),
      img('everywhere', {}),
      img('no pixels', { href: '' }),
    ];
    const scopes = Object.fromEntries(normalizeViolinFamilyRecipe(file)!.referenceImages!.map(i => [i.id, i.scope]));
    expect(scopes).toEqual({
      hidden: { only: [] },
      listed: { only: ['plateContour'] },
      default: { except: ['export', 'plateContour', 'fluting'] },
      excluded: { except: ['longArching'] },
      everywhere: undefined,
    });
  });
});

