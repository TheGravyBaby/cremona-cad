// @vitest-environment node
import { Pt } from '../models/types';
import { pointOnCircle, shortestDistanceFromPtToLine, lineFromTwoPoints, moveInVectorSpace, vectorFromSlope } from '../helpers/math/simpleGeometry';
import { archedViolin } from './ceruti-fixtures';
import { EnricoCerutiParams, NeckParams } from './ceruti-types';
import { defaultFlutingParams, solveLongArch } from './ceruti-arch-geometry';
import {
  bridgeWedge, buttonTip, calculateNeck, defaultNeckParams, defaultStringSetup, defineNeckPath, fingerboardCrown, mortiseFingerboardIntersect,
  heelFace, heelStands, plateEdgeAtNeck, stringLength,
} from './ceruti-neck';
import { defineFrontProfilePath, fingerboardEnd, mortiseFloorY, neckHalfWidthAt } from './ceruti-paths';

// the properties a maker would check with a ruler on the finished instrument: the neck's own
// length places the nut, the heel is one arc tangent to the neck's back reaching the button, and
// the readout describes the drawing it sits beside

function neckedViolin(): EnricoCerutiParams {
  const p = archedViolin();
  p.neck = defaultNeckParams(p);
  p.stringSetup = defaultStringSetup(p);
  return p;
}

function solve(p: EnricoCerutiParams): NeckParams {
  const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
  calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
  return p.neck!;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const normalOf = (s: NeckParams) => vectorFromSlope(s.angle);
const directionOf = (s: NeckParams) => vectorFromSlope(s.angle + Math.PI / 2);
const sagitta = (r: number, width: number) => r - Math.sqrt(r * r - (width / 2) ** 2);
const nutTopOf = (p: EnricoCerutiParams) => moveInVectorSpace(p.neck!.neckTop!, [{ ...normalOf(p.neck!), mag: p.stringSetup!.nutThickness }]);

describe('the nut', () => {
  it('sits `length` mm from the mortise floor, along the fingerboard plane', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(mortiseFingerboardIntersect(p), s.neckTop!)).toBeCloseTo(p.neck!.length, 9);
  });

  it('places the nut the same whether or not the heel radius can stand on its own', () => {
    const p = neckedViolin();
    const s = solve(p);
    const before = s.neckTop!;

    p.neck!.heel.r = 0;
    solve(p);
    expect(heelStands(p)).toBe(false);
    expect(p.neck!.neckTop!.x).toBeCloseTo(before.x, 9);
    expect(p.neck!.neckTop!.y).toBeCloseTo(before.y, 9);
  });

  it('measures the string from the nut\'s top to the bridge top', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(p.stringSetup!.nutTop!, nutTopOf(p))).toBeLessThan(1e-9);
    expect(stringLength(p)).toBeCloseTo(dist(nutTopOf(p), p.stringSetup!.bridgeTop!), 9);
    expect(dist(nutTopOf(p), s.neckTop!)).toBeCloseTo(p.stringSetup!.nutThickness, 9);
  });

  it('stands the default nut clear of the crown, and reports a nut set below it', () => {
    const p = neckedViolin();
    const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
    const run = () => calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
    expect(run()).toEqual([]);
    p.stringSetup!.nutThickness = p.stringSetup!.fingerboardThickness;
    expect(run().map(f => f.unsolved)).toEqual([['nutThickness']]);
  });

  it('reports a fingerboard radius no larger than the board\'s widest point', () => {
    const p = neckedViolin();
    const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
    const run = () => calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
    run();
    p.stringSetup!.fingerboardRadius = 2 * neckHalfWidthAt(p, fingerboardEnd(p).y);
    expect(run().map(f => f.unsolved)).toContainEqual(['fingerboardRadius']);
  });

  it('crowns the fingerboard by the sagitta of its width, growing toward the body', () => {
    const p = neckedViolin();
    const s = solve(p);
    const atNut = fingerboardCrown(p, s.neckTop!.y);
    expect(atNut).toBeCloseTo(sagitta(p.stringSetup!.fingerboardRadius, p.neck!.topWidth), 9);
    expect(fingerboardCrown(p, fingerboardEnd(p).y)).toBeGreaterThan(3 * atNut);
  });
});

describe('the root', () => {
  it('leaves the plate edge by the overstand, square to the plate', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(plateEdgeAtNeck(p), s.root!)).toBeCloseTo(p.neck!.overstand, 9);
  });

  it('carries the rib taper: the edge sits lower when the ribs are planed down toward it', () => {
    const square = neckedViolin();
    square.arching!.ribHeightUpper = square.arching!.ribHeightLower;
    const tapered = neckedViolin();
    tapered.arching!.ribHeightUpper = tapered.arching!.ribHeightLower - 2;
    solve(square);
    solve(tapered);
    expect(plateEdgeAtNeck(tapered).x).toBeLessThan(plateEdgeAtNeck(square).x - 1);
  });

  it('puts the mortise floor inside the rib face by the mortise depth, the fingerboard plane crossing it there', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(mortiseFloorY(p)).toBeCloseTo(p.height - p.overhang - p.neck!.mortiseDepth, 9);
    const glue = mortiseFingerboardIntersect(p);
    expect(glue.y).toBeCloseTo(mortiseFloorY(p), 9);
    expect(shortestDistanceFromPtToLine(glue, lineFromTwoPoints(s.root!, s.neckTop!))).toBeLessThan(1e-9);
  });

  it('ends the foot at the button tip, the button height beyond the plate', () => {
    const p = neckedViolin();
    p.button!.height = 13;
    solve(p);
    expect(buttonTip(p).y).toBeCloseTo(p.height + 13, 9);
    expect(buttonTip(p).x).toBe(0);
  });
});

describe('the heel', () => {
  // the back line, as direction and inward normal
  function backLine(s: NeckParams) {
    const len = dist(s.backRoot!, s.backNut!);
    return { root: s.backRoot!, ub: new Pt((s.backNut!.x - s.backRoot!.x) / len, (s.backNut!.y - s.backRoot!.y) / len) };
  }

  function expectTangentToBack(s: NeckParams): void {
    const h = s.heel;
    const start = pointOnCircle(h, h.start);
    const { root, ub } = backLine(s);
    const off = (start.x - root.x) * ub.y - (start.y - root.y) * ub.x;
    expect(Math.abs(off)).toBeLessThan(1e-9);
    const radial = new Pt(start.x - h.x, start.y - h.y);
    expect(Math.abs(radial.x * ub.x + radial.y * ub.y)).toBeLessThan(1e-9);
  }

  it('reaches the button tip on its own when the radius is wide', () => {
    const p = neckedViolin();
    p.neck!.heel.r = 40;
    const s = solve(p);
    const h = s.heel;
    expect(h.r).toBe(40);
    expect(heelFace(p)).toBeNull();
    const end = pointOnCircle(h, h.end);
    expect(end.x).toBeCloseTo(buttonTip(p).x, 9);
    expect(end.y).toBeCloseTo(buttonTip(p).y, 9);
    expectTangentToBack(s);
  });

  it('fillets onto a flat foot square to the neck, rising off the tip at the neck angle, when the radius is tight', () => {
    const p = neckedViolin();
    p.neck!.heel.r = 8;
    const s = solve(p);
    const h = s.heel;
    expect(h.r).toBe(8);
    const [end, tip] = heelFace(p)!;
    expect(tip).toEqual(buttonTip(p));
    expect(end.x).toBeCloseTo(pointOnCircle(h, h.end).x, 9);
    expect(end.y).toBeCloseTo(pointOnCircle(h, h.end).y, 9);
    expect(Math.atan2(end.y - tip.y, end.x - tip.x)).toBeCloseTo(p.neck!.angle, 9);
    // tangent to the foot as well as the back: the radius at the arc's end runs along the neck
    const normal = normalOf(s);
    const radial = new Pt(end.x - h.x, end.y - h.y);
    expect(Math.abs(radial.x * normal.a + radial.y * normal.b)).toBeLessThan(1e-9);
    expectTangentToBack(s);
  });

  it('never pockets: no point of the cove dips below the foot line', () => {
    for (const radius of [3, 8, 15, 20, 25, 40, 80]) {
      const p = neckedViolin();
      p.neck!.heel.r = radius;
      const s = solve(p);
      const h = s.heel;
      const tip = buttonTip(p);
      const direction = directionOf(s);
      let a1 = h.end;
      // the minor arc between them
      while (a1 - h.start > Math.PI) a1 -= 2 * Math.PI;
      while (a1 - h.start < -Math.PI) a1 += 2 * Math.PI;
      for (let i = 0; i <= 64; i++) {
        const a = h.start + (a1 - h.start) * i / 64;
        const x = h.x + h.r * Math.cos(a) - tip.x;
        const y = h.y + h.r * Math.sin(a) - tip.y;
        expect(x * direction.a + y * direction.b, `r=${radius}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});

describe('the neck wood', () => {
  it('is the entered thickness, uniform along the neck, whatever the fingerboard is', () => {
    const thin = neckedViolin();
    const thick = neckedViolin();
    thick.stringSetup!.fingerboardThickness += 3;
    thick.stringSetup!.nutThickness += 3;
    for (const [p, s] of [[thin, solve(thin)], [thick, solve(thick)]] as const) {
      // the back sits the entered thickness under the fingerboard plane at both ends
      const normal = normalOf(s);
      const under = (pt: Pt) => (pt.x - s.root!.x) * -normal.a + (pt.y - s.root!.y) * -normal.b;
      expect(under(s.backNut!)).toBeCloseTo(p.neck!.thickness, 9);
      expect(under(s.backRoot!)).toBeCloseTo(p.neck!.thickness, 9);
    }
  });

  it('traces one path from the mortise floor round to the heel\'s foot, and to the back\'s root with no heel', () => {
    const p = neckedViolin();
    solve(p);
    const d = defineNeckPath(p);
    expect(d.startsWith(`M 0 ${mortiseFloorY(p)}`)).toBe(true);
    expect(d).toContain(' A ');
    expect(d.trimEnd().endsWith(`${buttonTip(p).x} ${buttonTip(p).y}`)).toBe(true);
    p.neck!.heel.r = 0;
    const s = solve(p);
    const straight = defineNeckPath(p);
    expect(straight).not.toContain(' A ');
    expect(straight.trimEnd().endsWith(`${s.backRoot!.x} ${s.backRoot!.y}`)).toBe(true);
  });
});

describe('the readouts', () => {
  it('run the string clear of the fingerboard end, and stand the bridge on the arch', () => {
    const p = neckedViolin();
    const s = solve(p);
    const fbEndTop = moveInVectorSpace(fingerboardEnd(p), [{ ...normalOf(s), mag: p.stringSetup!.fingerboardThickness + fingerboardCrown(p, fingerboardEnd(p).y) }]);
    const a = nutTopOf(p), b = p.stringSetup!.bridgeTop!;
    const sideOf = (q: Pt) => Math.sign((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
    expect(sideOf(fbEndTop)).toBe(sideOf(s.neckTop!));
    expect(dist(p.stringSetup!.bridgeFoot!, p.stringSetup!.bridgeTop!)).toBeCloseTo(p.stringSetup!.bridgeHeight, 9);
    expect(p.stringSetup!.bridgeFoot!.x).toBeGreaterThan(plateEdgeAtNeck(p).x);
  });

  it('runs the fingerboard the entered length', () => {
    const p = neckedViolin();
    p.stringSetup!.fingerboardLength = 255;
    const s = solve(p);
    expect(dist(s.neckTop!, fingerboardEnd(p))).toBeCloseTo(255, 9);
  });
});

describe('the drawn shapes', () => {
  it('centres the bridge wedge on the bridge axis, narrower at the top than the feet', () => {
    const p = neckedViolin();
    const s = solve(p);
    const [footLeft, footRight, topRight, topLeft] = bridgeWedge(p);
    const footWidth = dist(footLeft, footRight);
    const topWidth = dist(topLeft, topRight);
    expect(topWidth).toBeLessThan(footWidth);
    const footMid = new Pt((footLeft.x + footRight.x) / 2, (footLeft.y + footRight.y) / 2);
    expect(dist(footMid, p.stringSetup!.bridgeFoot!)).toBeLessThan(1e-9);
  });
});

describe('the front profile', () => {
  const across = (y: number) => `M -100 ${y} L 100 ${y}`;
  const xs = (d: string) => [...d.matchAll(/[ML] (-?[\d.e-]+) /g)].map(m => Number(m[1]));

  it('cuts the body where the neck covers it and leaves the rest whole', () => {
    const p = neckedViolin();
    solve(p);
    const { outline: underNeck, purfling: [clear] } = defineFrontProfilePath(p, { outline: across(p.height), purfling: [across(50)], fHoles: [] }, false).body;
    const half = neckHalfWidthAt(p, p.height);
    const [a, b, c, d] = xs(underNeck);
    expect([a, d]).toEqual([-100, 100]);
    expect(b).toBeCloseTo(-half, 6);
    expect(c).toBeCloseTo(half, 6);
    expect(xs(clear)).toEqual([-100, 100]);
  });

  it('hides what lies under the fingerboard too, only while the board is shown', () => {
    const p = neckedViolin();
    solve(p);
    const y = (fingerboardEnd(p).y + mortiseFloorY(p)) / 2;
    const plan = { outline: across(y), purfling: [], fHoles: [] };
    expect(xs(defineFrontProfilePath(p, plan, true).body.outline)).toHaveLength(4);
    expect(xs(defineFrontProfilePath(p, plan, false).body.outline)).toEqual([-100, 100]);
  });
});
