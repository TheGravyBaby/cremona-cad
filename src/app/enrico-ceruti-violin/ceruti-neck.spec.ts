import { Pt } from '../models/types';
import { pointOnCircle, shortestDistanceFromPtToLine, lineFromTwoPoints, moveInVectorSpace, vectorFromSlope } from '../helpers/math/simpleGeometry';
import { archedViolin } from './ceruti-fixtures';
import { EnricoCerutiParams, NeckParams } from './ceruti-types';
import { defaultFlutingParams, solveLongArch } from './ceruti-arch-geometry';
import {
  bridgeWedge, buttonTip, calculateNeck, defaultNeckParams, defineNeckPath, fingerboardEnd, mortiseFingerboardIntersect,
  heelBottom, heelFace, mortiseFloorY, plateEdgeAtNeck,
} from './ceruti-neck';

// the properties a maker would check with a ruler on the finished instrument: the neck's own
// length places the nut, the heel is one arc tangent to the neck's back reaching the button, and
// the readout describes the drawing it sits beside

function neckedViolin(): EnricoCerutiParams {
  const p = archedViolin();
  p.neck = defaultNeckParams(p);
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
const nutTopOf = (s: NeckParams) => moveInVectorSpace(s.nut!, [{ ...normalOf(s), mag: s.nutThickness }]);

describe('the nut', () => {
  it('sits `length` mm from heelBottom, along the back, not from the root', () => {
    const p = neckedViolin();
    const s = solve(p);
    // heelBottom to the back corner at the nut is the actual `length` run, straight along the
    // neck; the nut sits off that same line by the neck's thickness, so it's a hair over `length`
    expect(dist(heelBottom(p), s.backNut!)).toBeCloseTo(p.neck!.length, 9);
    expect(dist(heelBottom(p), s.nut!)).toBeGreaterThan(p.neck!.length);
    // the two references genuinely differ — this would pass by accident against `root` alone
    expect(dist(s.root!, s.backNut!)).not.toBeCloseTo(p.neck!.length, 1);
  });

  it('places heelBottom from the back line and the button\'s height alone, whether or not the heel radius can stand on its own', () => {
    const p = neckedViolin();
    solve(p);
    const withHeel = heelBottom(p);

    p.neck!.heelRadius = 0;
    const withoutHeel = solve(p);
    expect(withoutHeel.heel).toBeNull();
    expect(heelBottom(p).x).toBeCloseTo(withHeel.x, 9);
    expect(heelBottom(p).y).toBeCloseTo(withHeel.y, 9);
    expect(heelBottom(p).y).toBeCloseTo(buttonTip(p).y, 9);
  });

  it('measures the string from the fingerboard\'s top at the nut to the bridge top', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(s.stringLength).toBeCloseTo(dist(nutTopOf(s), s.bridgeTop!), 9);
    expect(dist(nutTopOf(s), s.nut!)).toBeCloseTo(p.neck!.nutThickness, 9);
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
    expect(shortestDistanceFromPtToLine(glue, lineFromTwoPoints(s.root!, s.nut!))).toBeLessThan(1e-9);
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
    const h = s.heel!;
    const start = pointOnCircle(h, h.start);
    const { root, ub } = backLine(s);
    const off = (start.x - root.x) * ub.y - (start.y - root.y) * ub.x;
    expect(Math.abs(off)).toBeLessThan(1e-9);
    const radial = new Pt(start.x - h.x, start.y - h.y);
    expect(Math.abs(radial.x * ub.x + radial.y * ub.y)).toBeLessThan(1e-9);
  }

  it('reaches the button tip on its own when the radius is wide', () => {
    const p = neckedViolin();
    p.neck!.heelRadius = 40;
    const s = solve(p);
    const h = s.heel!;
    expect(h.r).toBe(40);
    expect(heelFace(p)).toBeNull();
    const end = pointOnCircle(h, h.end);
    expect(end.x).toBeCloseTo(buttonTip(p).x, 9);
    expect(end.y).toBeCloseTo(buttonTip(p).y, 9);
    expectTangentToBack(s);
  });

  it('fillets onto a flat foot square to the neck, rising off the tip at the neck angle, when the radius is tight', () => {
    const p = neckedViolin();
    p.neck!.heelRadius = 8;
    const s = solve(p);
    const h = s.heel!;
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
      p.neck!.heelRadius = radius;
      const s = solve(p);
      const h = s.heel!;
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
    thick.neck!.nutThickness += 3;
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
    p.neck!.heelRadius = 0;
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
    const fbEndTop = moveInVectorSpace(fingerboardEnd(p), [{ ...normalOf(s), mag: s.nutThickness }]);
    const a = nutTopOf(s), b = s.bridgeTop!;
    const sideOf = (q: Pt) => Math.sign((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x));
    expect(sideOf(fbEndTop)).toBe(sideOf(s.nut!));
    expect(dist(s.bridgeFoot!, s.bridgeTop!)).toBeCloseTo(p.neck!.bridgeHeight, 9);
    expect(s.bridgeFoot!.x).toBeGreaterThan(plateEdgeAtNeck(p).x);
  });

  it('reads a string length near the classical 325 mm at the default set', () => {
    const s = solve(neckedViolin());
    expect(s.stringLength).toBeGreaterThan(300);
    expect(s.stringLength).toBeLessThan(340);
  });

  it('scale the defaults with the body', () => {
    const p = archedViolin();
    p.height = 750;
    const cello = defaultNeckParams(p);
    const violin = defaultNeckParams(archedViolin());
    expect(cello.bodyStop / violin.bodyStop).toBeCloseTo(750 / 350, 1);
    expect(cello.angle).toBe(violin.angle);
  });

  it('runs the fingerboard a standard length by instrument size, not an entered value', () => {
    const sizes: [number, number][] = [[350, 270], [450, 310], [650, 580], [900, 850]];
    for (const [height, length] of sizes) {
      const p = neckedViolin();
      p.height = height;
      const s = solve(p);
      expect(dist(s.nut!, fingerboardEnd(p))).toBeCloseTo(length, 9);
    }
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
    expect(dist(footMid, s.bridgeFoot!)).toBeLessThan(1e-9);
  });

  it('stores nothing a ruler on the drawing would not need: the neck\'s corners, its heel, the bridge and the string', () => {
    const s = solve(neckedViolin());
    const solved = Object.keys(s).filter(k => !['bodyStop', 'bridgeHeight', 'mortiseDepth', 'overstand', 'angle', 'length', 'thickness', 'heelRadius', 'nutThickness'].includes(k));
    expect(solved.sort()).toEqual(['backNut', 'backRoot', 'bridgeFoot', 'bridgeTop', 'heel', 'nut', 'root', 'stringLength']);
  });
});
