import { Pt } from '../models/types';
import { archedViolin } from './ceruti-fixtures';
import { EnricoCerutiParams } from './ceruti-types';
import { defaultFlutingParams, solveLongArch } from './ceruti-arch-geometry';
import { defaultNeckParams, NeckSolve, calculateNeck } from './ceruti-neck';

/**
 * The neck set. The properties here are the ones a maker would check with a
 * ruler on the finished instrument: the neck's own length places the nut,
 * the heel is one arc tangent to the neck's back and reaching the button, and
 * the readout describes the drawing it sits beside.
 */

function neckedViolin(): EnricoCerutiParams {
  const p = archedViolin();
  p.neck = defaultNeckParams(p);
  return p;
}

function solve(p: EnricoCerutiParams): NeckSolve {
  const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
  return calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

describe('the nut', () => {
  it('sits `length` mm up the neck from the mortise floor', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(s.gluingAtMortise, s.nut.at)).toBeCloseTo(p.neck!.length, 9);
  });

  it('runs the string flush with the fingerboard top, no separate nut height', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(s.nut.top, s.nut.at)).toBeCloseTo(p.neck!.nutThickness, 9);
  });
});

describe('the root', () => {
  it('leaves the plate edge by the overstand, square to the plate', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(dist(s.edge, s.root)).toBeCloseTo(p.neck!.overstand, 9);
  });

  it('carries the rib taper: the edge sits lower when the ribs are planed down toward it', () => {
    const square = neckedViolin();
    square.arching!.ribHeightUpper = square.arching!.ribHeightLower;
    const tapered = neckedViolin();
    tapered.arching!.ribHeightUpper = tapered.arching!.ribHeightLower - 2;
    expect(solve(tapered).edge.x).toBeLessThan(solve(square).edge.x - 1);
  });

  it('puts the mortise floor inside the rib face by the mortise depth', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(s.rootPlaneY - s.mortiseFloorY).toBeCloseTo(p.neck!.mortiseDepth, 9);
    expect(s.rootPlaneY).toBeCloseTo(p.height - p.overhang, 9);
  });

  it('ends the foot at the button tip, the button height beyond the plate', () => {
    const p = neckedViolin();
    p.button!.height = 13;
    const s = solve(p);
    expect(s.buttonTip.y).toBeCloseTo(p.height + 13, 9);
    expect(s.buttonTip.x).toBe(0);
  });
});

describe('the heel', () => {
  // the back line, as direction and inward normal
  function backLine(s: NeckSolve) {
    const b = s.back!;
    const len = Math.hypot(b.nut.x - b.root.x, b.nut.y - b.root.y);
    return { root: b.root, ub: new Pt((b.nut.x - b.root.x) / len, (b.nut.y - b.root.y) / len) };
  }

  function expectTangentToBack(s: NeckSolve): void {
    const h = s.heel!;
    const { root, ub } = backLine(s);
    const off = (h.start.x - root.x) * ub.y - (h.start.y - root.y) * ub.x;
    expect(Math.abs(off)).toBeLessThan(1e-9);
    const radial = new Pt(h.start.x - h.center.x, h.start.y - h.center.y);
    expect(Math.abs(radial.x * ub.x + radial.y * ub.y)).toBeLessThan(1e-9);
    expect(dist(h.center, h.start)).toBeCloseTo(h.r, 9);
    expect(dist(h.center, h.end)).toBeCloseTo(h.r, 9);
  }

  it('reaches the button tip on its own when the radius is wide', () => {
    const p = neckedViolin();
    p.neck!.heelRadius = 40;
    const s = solve(p);
    const h = s.heel!;
    expect(h.r).toBe(40);
    expect(h.face).toBeNull();
    expect(h.end).toEqual(s.buttonTip);
    expectTangentToBack(s);
  });

  it('stops square to the body and runs a flat face to the tip when the radius is tight', () => {
    const p = neckedViolin();
    p.neck!.heelRadius = 8;
    const s = solve(p);
    const h = s.heel!;
    expect(h.r).toBe(8);
    expect(h.face).toEqual(s.buttonTip);
    // the arc ends at its lowest point, level with the tip, so the face is square to the body axis
    expect(h.end.y).toBeCloseTo(s.buttonTip.y, 9);
    expect(h.end.x).toBeCloseTo(h.center.x, 9);
    expect(h.end.x).toBeGreaterThan(s.buttonTip.x);
    expectTangentToBack(s);
  });

  it('never pockets: no point of the cove sits below the button tip', () => {
    for (const radius of [3, 8, 15, 20, 25, 40, 80]) {
      const p = neckedViolin();
      p.neck!.heelRadius = radius;
      const s = solve(p);
      const h = s.heel!;
      const a0 = Math.atan2(h.start.y - h.center.y, h.start.x - h.center.x);
      let a1 = Math.atan2(h.end.y - h.center.y, h.end.x - h.center.x);
      // the minor arc between them
      while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
      while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
      for (let i = 0; i <= 64; i++) {
        const a = a0 + (a1 - a0) * i / 64;
        expect(h.center.y + h.r * Math.sin(a), `r=${radius}`).toBeGreaterThanOrEqual(s.buttonTip.y - 1e-9);
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
      const under = (pt: Pt) => (pt.x - s.root.x) * -s.normal.a + (pt.y - s.root.y) * -s.normal.b;
      expect(under(s.back.nut)).toBeCloseTo(p.neck!.thickness, 9);
      expect(under(s.back.root)).toBeCloseTo(p.neck!.thickness, 9);
    }
  });

  it('boxes a scroll beyond the nut, continuing the neck plane rather than the proud nut', () => {
    const s = solve(neckedViolin());
    expect(s.scroll[0]).toEqual(s.nut.at);
    expect(s.scroll[1].y).toBeGreaterThan(s.scroll[0].y);
  });
});

describe('the readouts', () => {
  it('put the string a few millimetres over the fingerboard end, and the bridge on the arch', () => {
    const p = neckedViolin();
    const s = solve(p);
    expect(s.stringOverFingerboardEnd).toBeGreaterThan(2);
    expect(s.stringOverFingerboardEnd).toBeLessThan(8);
    expect(dist(s.bridge.foot, s.bridge.top)).toBeCloseTo(p.neck!.bridgeHeight, 9);
    expect(s.bridge.foot.x).toBeGreaterThan(s.edge.x);
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
      expect(dist(s.nut.at, s.fingerboard.end)).toBeCloseTo(length, 9);
    }
  });
});

describe('the drawn shapes', () => {
  it('boxes the button profile between the plate end and the tip', () => {
    const p = neckedViolin();
    const s = solve(p);
    const [plateFront, tipFront, tipBack, plateBack] = s.buttonProfile;
    expect(plateFront.y).toBeCloseTo(p.height, 9);
    expect(tipFront.y).toBeCloseTo(s.buttonTip.y, 9);
    expect(plateFront.x).toBe(0);
    expect(tipBack.x).toBeCloseTo(-s.backThickness, 9);
    expect(plateBack.y).toBeCloseTo(p.height, 9);
  });

  it('centres the bridge wedge on the bridge axis, narrower at the top than the feet', () => {
    const p = neckedViolin();
    const s = solve(p);
    const [footLeft, footRight, topRight, topLeft] = s.bridgeWedge;
    const footWidth = dist(footLeft, footRight);
    const topWidth = dist(topLeft, topRight);
    expect(topWidth).toBeLessThan(footWidth);
    const footMid = new Pt((footLeft.x + footRight.x) / 2, (footLeft.y + footRight.y) / 2);
    expect(dist(footMid, s.bridge.foot)).toBeLessThan(1e-9);
  });

  it('sits the nut block over the fingerboard end thickness, past the fingerboard by its length', () => {
    const p = neckedViolin();
    const s = solve(p);
    const [at, far] = s.nutBlock;
    expect(at).toEqual(s.nut.at);
    expect(dist(at, far)).toBeCloseTo(s.nutLength, 9);
  });

  it('gives the heel a ready-to-draw Arc matching its own start and end', () => {
    const p = neckedViolin();
    const s = solve(p);
    const h = s.heel!;
    const start = { x: h.center.x + h.r * Math.cos(h.arc.start), y: h.center.y + h.r * Math.sin(h.arc.start) };
    const end = { x: h.center.x + h.r * Math.cos(h.arc.end), y: h.center.y + h.r * Math.sin(h.arc.end) };
    expect(start.x).toBeCloseTo(h.start.x, 9);
    expect(start.y).toBeCloseTo(h.start.y, 9);
    expect(end.x).toBeCloseTo(h.end.x, 9);
    expect(end.y).toBeCloseTo(h.end.y, 9);
  });
});
