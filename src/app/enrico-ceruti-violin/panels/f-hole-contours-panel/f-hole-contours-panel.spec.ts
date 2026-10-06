import { afterEach, describe, expect, it } from 'vitest';
import { defaultViolin, geometryDiff } from '../../ceruti-fixtures';
import { defaultFHolePlacement } from '../f-hole-placement-panel/f-hole-placement-panel';
import { calculateFholeContours, ensureFholePath, getPath } from '../../ceruti-calcs';
import { pointOnCircle, travelAtArcEnd, travelAtArcStart, normalizeRadians, dist } from '../../../helpers/math/simpleGeometry';
import { Arc, Pt } from '../../../models/types';
import { EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { setGlobalEmitter } from '../../../shared/message-emitter';

/**
 * The property tests say what the drawing is: every joint is
 * tangent-continuous, the shoulder touches its own eye and its bound, and the
 * tip is where the cut says it is. Those hold for any f-hole, not just this one.
 */

type Shape = 'plain' | 'extended' | 'short' | 'compound';

const solve = (shape: Shape): EnricoCerutiParams => {
  const p = defaultViolin();
  p.fHoles = defaultFHolePlacement(p);
  calculateFholeContours(p); // first pass: every radius, stem arcs included, off the defaults

  if (shape === 'extended') {
    // mimics a user extending both shoulders past their apex, then dialling the stem's one
    // shared arc radius off the 40 it defaults to. turn is -1 both sides by construction here,
    // so subtracting from `end` continues the shoulder's own turn.
    p.fHoles!.U1!.end -= 0.3;
    p.fHoles!.L1!.end -= 0.25;
    calculateFholeContours(p);

    p.fHoles!.stem.arcR! += 8; // all four of S1/S2/S3/S4 follow this one number
    calculateFholeContours(p);
  }

  if (shape === 'short') {
    // the late del Gesu move: stop each shoulder before its apex and let a tighter arm take
    // the top of the hole. adding to `end` backs the shoulder up toward the eye.
    p.fHoles!.U1!.end += 0.7;
    p.fHoles!.U2!.r = p.fHoles!.U1!.r / 2;
    p.fHoles!.L1!.end += 0.3;
    p.fHoles!.L2!.r = p.fHoles!.L1!.r * 0.75;
    calculateFholeContours(p);
  }

  if (shape === 'compound') {
    // split each arm in two, one tightening and one opening, so the stem arc lands on the
    // second half. the seed pass leaves the outline alone; the radii are what move it
    p.options.U21DoubleArc = true;
    p.options.L21DoubleArc = true;
    calculateFholeContours(p);
    p.fHoles!.U21!.r = p.fHoles!.U2!.r * 0.6;
    p.fHoles!.L21!.r = p.fHoles!.L2!.r * 1.4;
    calculateFholeContours(p);
  }

  return p;
};

const round4 = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 1e4) / 1e4
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round4(x)]))
  : v;

/** The two edges as they are drawn, in the order the contour runs — crossing U/L/S field names,
 * since those now track physical position rather than which edge drew the arc. */
const edgesOf = (p: EnricoCerutiParams): { name: string; chain: (Arc | null)[] }[] => {
  const f = p.fHoles!;
  return [
    { name: 'springing from UEye', chain: [f.U1, f.U2, p.options.U21DoubleArc ? f.U21! : null, f.S2, f.S4, f.L3] },
    { name: 'springing from LEye', chain: [f.L1, f.L2, p.options.L21DoubleArc ? f.L21! : null, f.S3, f.S1, f.U3] },
  ];
};

// the minor sweep between start and end, as every renderer draws it
const sampleArc = (a: Arc, n = 200): Pt[] => {
  const delta = normalizeRadians(a.end - a.start + Math.PI) - Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => pointOnCircle(a, a.start + delta * i / n));
};

describe('f-hole contour properties', () => {
  const labels: Record<Shape, string> = {
    plain: 'with the plain default',
    extended: 'with the shoulders extended and a stem arc pinned',
    short: 'with the shoulders stopped short of their apex',
    compound: 'with both arms split in two',
  };
  for (const shaped of ['plain', 'extended', 'short', 'compound'] as const) {
    const label = labels[shaped];

    it(`runs every joint tangent-continuous, ${label}`, () => {
      for (const { name, chain } of edgesOf(solve(shaped))) {
        const arcs = chain.filter((a): a is Arc => !!a);

        for (let i = 0; i < arcs.length - 1; i++) {
          const leaving = arcs[i], arriving = arcs[i + 1];
          const handover = pointOnCircle(leaving, leaving.end);
          const pickup = pointOnCircle(arriving, arriving.start);

          // the run along the stem edge is the one straight piece, so the two arcs
          // either side of it meet at a distance rather than at a point — but they
          // still have to be travelling the same way
          const gap = dist(handover, pickup);
          const turn = Math.abs(normalizeRadians(travelAtArcEnd(leaving) - travelAtArcStart(arriving) + Math.PI) - Math.PI);

          expect(turn, `${name} joint ${i} turns a corner`).toBeLessThan(1e-6);
          if (gap > 1e-6) {
            // a gap is only legitimate along the stem, where the straight run lives
            const alongStem = Math.abs(normalizeRadians(
              Math.atan2(pickup.y - handover.y, pickup.x - handover.x) - travelAtArcEnd(leaving) + Math.PI) - Math.PI);
            expect(alongStem, `${name} joint ${i} jumps sideways`).toBeLessThan(1e-6);
          }
        }
      }
    });

    it(`seats each shoulder on its own eye and the outline on its own bound, ${label}`, () => {
      const p = solve(shaped);
      const f = p.fHoles!;
      const upperArm2 = p.options.U21DoubleArc ? f.U21! : null;
      const lowerArm2 = p.options.L21DoubleArc ? f.L21! : null;
      for (const [eye, shoulder, arm, arm2, rise, side] of [[f.UEye!, f.U1!, f.U2!, upperArm2, f.URise!, 1], [f.LEye!, f.L1!, f.L2!, lowerArm2, f.LRise!, -1]] as const) {
        // tangent internally to the eye: centres one radius difference apart
        expect(dist(shoulder, eye)).toBeCloseTo(shoulder.r - eye.r, 6);
        // and its start is that very tangency, so the eye rim hands the outline over
        expect(dist(pointOnCircle(shoulder, shoulder.start), pointOnCircle(eye, shoulder.start))).toBeCloseTo(0, 6);

        // the bound is tangent to the outline: whichever arc runs through the extreme — the
        // shoulder if its sweep reaches there, else the arm that continues past it — has its
        // apex on the bound, and nothing drawn along shoulder or arm crosses it
        const extreme = side * Math.PI / 2;
        const bound = eye.y + side * (eye.r + rise);
        const chain = [shoulder, arm, arm2].filter((a): a is Arc => !!a);
        const owner = chain.find(a => a.end <= extreme)!;
        expect(pointOnCircle(owner, extreme).y).toBeCloseTo(bound, 6);
        const farthest = Math.max(...chain.flatMap(a => sampleArc(a).map(pt => side * (pt.y - bound))));
        expect(farthest).toBeLessThan(1e-6);
        if (shaped === 'short') expect(owner, 'short scenario must stop the shoulder short').not.toBe(shoulder);
      }
    });

    it(`puts each tip one cut length off its own eye, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      for (const [eye, cut, tip] of [[f.UEye!, f.UCut!, f.UTip!], [f.LEye!, f.LCut!, f.LTip!]] as const) {
        // angleOnEye is absolute in the plate's frame, not measured off the ray to the other eye
        const foot = pointOnCircle(eye, cut.angleOnEye!);

        expect(dist(foot, tip)).toBeCloseTo(cut.length!, 6);
        // and the cut runs the way `slope` says, read straight off the plate
        const ran = Math.atan2(tip.y - foot.y, tip.x - foot.x);
        expect(Math.abs(normalizeRadians(ran - cut.slope! + Math.PI) - Math.PI)).toBeLessThan(1e-6);
      }
    });

    it(`lands each wing on the tip it is hung from, ${label}`, () => {
      const f = solve(shaped).fHoles!;
      // L3 springs from UEye's edge and reaches the lower tip; U3 springs from LEye's and reaches the upper
      for (const [wing, tip] of [[f.L3!, f.LTip!], [f.U3!, f.UTip!]] as const) {
        expect(dist(pointOnCircle(wing, wing.end), tip)).toBeCloseTo(0, 6);
      }
    });

  }

  it('leaves the outline alone when an arm is split, until its radius moves', () => {
    const plain = solve('plain');
    const split = solve('plain');
    split.options.U21DoubleArc = true;
    split.options.L21DoubleArc = true;
    calculateFholeContours(split);

    // the second half seeds on the arm's own circle, so the stem arcs it feeds don't move
    for (const key of ['U2', 'L2'] as const) {
      const second = split.fHoles![key === 'U2' ? 'U21' : 'L21']!;
      expect(dist(second, plain.fHoles![key]!)).toBeCloseTo(0, 6);
      expect(second.r).toBeCloseTo(plain.fHoles![key]!.r, 6);
    }
    expect(geometryDiff(round4(split.fHoles!.S2), round4(plain.fHoles!.S2), 1e-9)).toEqual([]);
    expect(geometryDiff(round4(split.fHoles!.S3), round4(plain.fHoles!.S3), 1e-9)).toEqual([]);
  });

  it('holds all four stem arcs to the one radius the stem was pinned at, once shaped', () => {
    const bootstrap = solve('plain').fHoles!;
    const f = solve('extended').fHoles!;
    const pinned = bootstrap.stem.arcR! + 8;

    expect(f.stem.arcR).toBeCloseTo(pinned, 6);
    expect(f.S1!.r).toBeCloseTo(pinned, 6);
    expect(f.S2!.r).toBeCloseTo(pinned, 6);
    expect(f.S3!.r).toBeCloseTo(pinned, 6);
    expect(f.S4!.r).toBeCloseTo(pinned, 6);
  });

  it('lets each stem arc take its own radius once the stem is set to individual radii', () => {
    const p = solve('plain');
    const shared = p.fHoles!.stem.arcR!;
    p.options.stemArcsIndependent = true;
    p.fHoles!.S1!.r = shared + 2;
    p.fHoles!.S2!.r = shared + 4;
    p.fHoles!.S3!.r = shared + 6;
    p.fHoles!.S4!.r = shared + 8;
    calculateFholeContours(p);
    calculateFholeContours(p);

    const f = p.fHoles!;
    expect(f.S1!.r).toBeCloseTo(shared + 2, 6);
    expect(f.S2!.r).toBeCloseTo(shared + 4, 6);
    expect(f.S3!.r).toBeCloseTo(shared + 6, 6);
    expect(f.S4!.r).toBeCloseTo(shared + 8, 6);
    expect(f.stem.arcR).toBeCloseTo(shared, 6);

    p.options.stemArcsIndependent = false;
    calculateFholeContours(p);
    for (const a of [f.S1!, f.S2!, f.S3!, f.S4!]) expect(a.r).toBeCloseTo(shared, 6);
  });
});

describe('f-hole contour failures', () => {
  afterEach(() => setGlobalEmitter(null as any));

  it('names the rise and the shoulder when the rise outruns the shoulder', () => {
    const plain = solve('plain');
    const p = solve('plain');
    p.fHoles!.URise = 100;
    const failures = calculateFholeContours(p);

    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('Reduce Rise, or enlarge U1');
    expect(failures[0].unsolved).toEqual(['U1', 'U2', 'U21', 'S2']);
    expect(geometryDiff(round4(p.fHoles!.L2), round4(plain.fHoles!.L2), 1e-9)).toEqual([]);
    expect(geometryDiff(round4(p.fHoles!.S1), round4(plain.fHoles!.S1), 1e-9)).toEqual([]);
  });

  it('says the arm crosses the stem edge when it is too wide to turn onto it', () => {
    const p = solve('plain');
    p.fHoles!.U2!.r *= 3;
    const failures = calculateFholeContours(p);

    expect(failures).toHaveLength(1);
    expect(failures[0].message).toContain('U2 crosses the outer stem edge');
    expect(failures[0].unsolved).toEqual(['U2', 'S2']);
    expect(failures[0].circles).toEqual([p.fHoles!.U2]);
  });

  it('says the stem arc cannot bridge when it is too small', () => {
    const p = solve('plain');
    p.fHoles!.stem.arcR = 12;
    const failures = calculateFholeContours(p);

    expect(failures.map(f => f.unsolved)).toEqual([['L2', 'S3'], ['L3', 'S4']]);
    expect(failures[0].message).toContain("S3 can't bridge from L2");
  });

  it('raises one message for a failed pass and keeps the last good outline', () => {
    const p = solve('plain');
    const paths: PathEntry[] = [];
    ensureFholePath(p, paths);
    const good = getPath(paths, 'fHole');

    const messages: string[] = [];
    setGlobalEmitter(m => messages.push(m.message));
    p.fHoles!.URise = 100;
    p.fHoles!.stem.arcR = 12;
    expect(() => ensureFholePath(p, paths)).not.toThrow();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Upper arm');
    expect(messages[0]).toContain('Lower wing');
    expect(getPath(paths, 'fHole')).toBe(good);
  });
});
