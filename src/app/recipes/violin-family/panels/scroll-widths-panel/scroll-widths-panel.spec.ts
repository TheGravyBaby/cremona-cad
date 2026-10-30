// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pointOnCircle } from '../../../../helpers/math/simpleGeometry';
import { polylinePointAtY } from '../../../../helpers/math/vibeMath';
import { Pt, Pt3D } from '../../../../models/types';
import {
  pegboxCavity, pegboxHipHeight, pegboxWidth, scrollBackStrip, scrollBackViewStrokes, scrollFrontViewStrokes, scrollPathStretches, scrollWidthStations,
  solveScrollWidths,
} from './scroll-widths-panel';
import { VolutePanel } from '../volute-panel/volute-panel';
import { NeckPanel } from '../neck-panel/neck-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { ViolinFamilyParams } from '../../violin-family-types';
import { ScrollSolve } from '../../violin-family-solves';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

const seeded = (p = blank()): ViolinFamilyParams => {
  for (const panel of [MainBoutsPanel, CornersPanel, PlateContourPanel, FlutingPanel, LongArchingPanel, NeckPanel, VolutePanel]) panel.seed(p);
  return p;
};

const whole = (p: ViolinFamilyParams): ScrollSolve => {
  const w = solveScrollWidths(p)!;
  expect(w.scroll.failures).toEqual([]);
  expect(w.failures).toEqual([]);
  return w.scroll;
};

describe('the scroll widths', () => {
  it('never write to the params', () => {
    const p = seeded();
    const snapshot = JSON.stringify(p);
    solveScrollWidths(p);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('seed the hips on the duck tail\'s round, the path starting on its top', () => {
    const p = seeded();
    const s = whole(p);
    const round = pointOnCircle(s.S3!, s.S3!.start).y + p.scroll!.widths.duckTail / 2;
    expect(pegboxHipHeight(p)).toBeCloseTo(round, 9);
    expect(scrollPathStretches(p, s).back[0].y).toBeCloseTo(round, 3);
  });

  it('run the duck tail\'s round on straight up to the foot, the path starting there', () => {
    const p = seeded();
    p.scroll!.duckTailStraight = 6;
    const s = whole(p);
    const r = p.scroll!.widths.duckTail / 2;
    const round = pointOnCircle(s.S3!, s.S3!.start).y + r;
    expect(scrollPathStretches(p, s).back[0].y).toBeCloseTo(round + 6, 3);
    expect(scrollWidthStations(p, s).find(st => st.key === 'duckTail')!.at.y).toBeCloseTo(round, 3);
    const straight = scrollBackStrip(p, s).outline.filter(pt => Math.abs(pt.x - r) < 1e-9).map(pt => pt.y);
    expect(Math.max(...straight) - Math.min(...straight)).toBeGreaterThan(0);
  });

  it('set the front at the nut, the hips and the throat, tapering by height between', () => {
    const p = seeded();
    const s = whole(p);
    const w = p.scroll!.widths;
    expect(pegboxWidth(p, s, p.neck!.nutHeight)).toBe(p.neck!.nutWidth);
    expect(pegboxWidth(p, s, pegboxHipHeight(p))).toBeCloseTo(w.hip, 9);
    expect(pegboxWidth(p, s, pointOnCircle(s.F1!, s.F1!.end).y)).toBeCloseTo(w.throat, 9);
  });

  it('mark each width at its station, the back\'s up the path in order', () => {
    const p = seeded();
    const s = whole(p);
    const stations = scrollWidthStations(p, s);
    const w = p.scroll!.widths;
    for (const st of stations) if (st.key !== 'neck' && st.key !== 'nut' && st.key !== 'hip') expect(st.width).toBe(w[st.key]);
    const crown = stations.find(st => st.key === 'crown')!;
    const poll = stations.find(st => st.key === 'poll')!;
    expect(crown.at.y).toBeGreaterThan(poll.at.y);
  });

  it('cut the path at the crown and the turns into stretches that only rise or only fall, each starting where the last ended', () => {
    const p = seeded();
    const on = scrollPathStretches(p, whole(p));
    const order = [on.back, on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front];
    order.forEach((stretch, i) => {
      const rising = i % 2 === 0;
      for (let k = 1; k < stretch.length; k++) {
        const dy = stretch[k].y - stretch[k - 1].y;
        expect(rising ? dy : -dy, `stretch ${i} at ${k}`).toBeGreaterThan(-1e-6);
      }
      if (i) expect(stretch[0]).toEqual(order[i - 1].at(-1));
    });
  });

  it('hollow the pegbox from the nut\'s top to the end of the front\'s straight, inside the wood', () => {
    const p = seeded();
    const s = whole(p);
    const cavity = pegboxCavity(p, s)!;
    expect(cavity[0]).toEqual(new Pt(0, p.neck!.nutHeight));
    for (const pt of cavity.slice(1, -1)) expect(pt.x).toBeLessThan(0);
  });

  it('draw both views, the back and front each with their turns and the nut in front', () => {
    const p = seeded();
    const s = whole(p);
    const place = (x: number, y: number) => new Pt(x, y);
    const back = scrollBackViewStrokes(p, s, place, -20);
    const front = scrollFrontViewStrokes(p, s, place, -20);
    expect(back.back.length).toBeGreaterThan(0);
    expect(back.turns.length).toBeGreaterThan(0);
    expect(front.turns.length).toBeGreaterThan(0);
    expect(front.nut.length).toBe(1);
  });

  it('report what Ceruti pushed into place: an eye narrower than the turn outside it, a crown past the poll, hips below the duck tail', () => {
    for (const [edit, keys] of [
      [(p: ViolinFamilyParams) => { p.scroll!.widths.eye = p.scroll!.widths.turn2Bottom - 1; }, ['turn2Bottom', 'eye']],
      [(p: ViolinFamilyParams) => { p.scroll!.widths.crown = p.scroll!.widths.poll + 1; }, ['crown', 'poll']],
      [(p: ViolinFamilyParams) => { p.scroll!.widths.foot = p.scroll!.widths.duckTail - 1; }, ['duckTail', 'foot']],
      [(p: ViolinFamilyParams) => { p.scroll!.hipHeight = -20; }, ['hipHeight']],
    ] as const) {
      const p = seeded();
      edit(p);
      const w = solveScrollWidths(p)!;
      expect(w.failures.map(f => f.unsolved)).toEqual([keys]);
    }
  });

  it("take turns that narrow: from behind, the first turn's front shows below the top of a second turn narrower than it", () => {
    const p = seeded();
    const w = p.scroll!.widths;
    w.turn1Bottom = w.turn2Bottom - 2;
    w.turn2Top = w.crown + 2;
    const s = whole(p);
    const on = scrollPathStretches(p, s);
    const top = on.turn2Back.at(-1)!;
    const half = (stretch: Pt3D[], y: number) => polylinePointAtY(stretch, y)?.x ?? 0;
    const back = scrollBackViewStrokes(p, s, (x, y) => new Pt(x, y), -20);
    const shown = back.turns.flatMap(st => {
      const n = 'd' in st ? st.d.match(/-?[\d.]+(e-?\d+)?/g)!.map(Number) : [];
      return n.filter((_, i) => i % 2 === 0).map((x, i) => new Pt(Math.abs(x), n[2 * i + 1]));
    });
    const past = shown.filter(pt => pt.y < top.y - 1
      && Math.abs(pt.x - half(on.turn1Front, pt.y)) < 0.05
      && pt.x > Math.max(half(on.back, pt.y), half(on.turn2Back, pt.y)) + 0.5);
    expect(past.length).toBeGreaterThan(0);
  });

  it('report a cleared width, and nothing past a side that didn\'t solve', () => {
    const p = seeded();
    (p.scroll!.widths as any).eye = null;
    expect(solveScrollWidths(p)!.failures).toHaveLength(1);
    const q = seeded();
    q.scroll!.hang = 200;
    const w = solveScrollWidths(q)!;
    expect(w.scroll.failures.length).toBeGreaterThan(0);
    expect(w.failures).toEqual([]);
  });
});
