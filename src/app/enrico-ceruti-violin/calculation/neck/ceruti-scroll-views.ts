import { pointOnCircle, TURN } from '../../../helpers/math/simpleGeometry';
import { occludePath } from '../../../helpers/math/pathVibes';
import { pathFromLine, pathFromPolygon, pathFromPolyline } from '../../../helpers/math/pathMath';
import { clipPolylineAtY, polylinePointAtY } from '../../../helpers/math/vibeMath';
import { StrokeShape, STROKE_WEIGHT } from '../../../helpers/renderFuncs';
import { Pt, Pt3D } from '../../../models/types';
import { EnricoCerutiParams } from '../../ceruti-types';
import { duckTailRadius, pegboxHipHeight, pegboxWidth, scrollPathStretches, ScrollStretches, scrollFrontWidths, scrollLines, scrollNeckHalfWidth } from './ceruti-scroll';
import { scrollOnNeck } from '../outline/ceruti-paths';

// the scroll seen from behind and from in front, as strokes with ink names, for the widths panel and
// set on the neck's end in the plan profiles. Drawn the way a draughtsman would, not projected: the
// volute's turns stand out further the nearer the eye, so each stretch of the path is drawn as far as
// the next turn nearer the viewer lets it be seen, and nothing hidden is drawn.
// calculateScrollWidths holding each turn at least as wide as the one before keeps that order true

// how far each view carries the neck on below the scroll
export const scrollNeckStub = (p: EnricoCerutiParams) => 2 * p.neck!.thickness;

function halfWidthAtHeight(pts: Pt3D[], y: number): number | null {
  return polylinePointAtY(pts, y)?.x ?? null;
}

// what of a line can be seen: its runs of points that no stretch of the path hides, one nearer
// the viewer and at least as wide at that height. z is the side view's x, so from behind the
// lesser stands nearer and from in front the greater
function seenRuns(on: ScrollStretches, pts: Pt3D[], behind: boolean): Pt3D[][] {
  const stretches = [on.back, on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front];
  const hidden = (pt: Pt3D) => stretches.some(stretch => {
    // a stretch hides nothing at the height it turns over at: a line cut there stops on the turn's face
    const turnsOver = Math.abs(pt.y - stretch[0].y) < 1e-9 || Math.abs(pt.y - stretch.at(-1)!.y) < 1e-9;
    const over = turnsOver ? null : polylinePointAtY(stretch, pt.y);
    if (!over) return false;
    const nearer = behind ? over.z < pt.z - 1e-6 : over.z > pt.z + 1e-6;
    return nearer && over.x >= pt.x - 1e-9;
  });
  const runs: Pt3D[][] = [[]];
  for (const pt of pts) {
    if (hidden(pt)) runs.push([]);
    else runs.at(-1)!.push(pt);
  }
  return runs;
}

// the path starts on top of the duck tail's round. Hips below there put the back's own cheeks under
// the path's start, down to the hips and level in to the round's flank; from the hips, or from the
// path's start when the hips are above it, the front's walls run in to the nut's edge at its top,
// square to the foot of the nut, and close level there
function pegboxOutline(p: EnricoCerutiParams, start: Pt3D) {
  const { nutHeight } = p.stringSetup!;
  const hipY = pegboxHipHeight(p);
  const hipHalf = p.scroll!.widths.hip / 2;
  const r = duckTailRadius(p);
  const below = hipY < start.y - 1e-6;
  const cheeks = below ? [new Pt(start.x, start.y), new Pt(hipHalf, hipY)] : [];
  const flank = below ? Math.sqrt(Math.max(r * r - (start.y - hipY) ** 2, 0)) : r;
  const footEdge = below && hipHalf > flank + 1e-6 ? [new Pt(hipHalf, hipY), new Pt(flank, hipY)] : [];

  const from = below ? new Pt(hipHalf, hipY) : new Pt(start.x, start.y);
  const foot = Math.min(from.y, 0);
  const walls = [from, ...(nutHeight < from.y - 1e-6 ? [new Pt(pegboxWidth(p, nutHeight) / 2, nutHeight)] : []), new Pt(pegboxWidth(p, foot) / 2, foot)];
  const bottom = [new Pt(pegboxWidth(p, foot) / 2, foot), new Pt(0, foot)];
  return { below, cheeks, footEdge, foot, walls, bottom };
}

export type ScrollViewInk = 'archTop' | 'archBack' | 'scrollFrontLight' | 'scrollBackLight' | 'nut' | 'neckOff';

export type ScrollViewStroke = { ink: ScrollViewInk; weight: number } & StrokeShape;

// the strokes of a view, each point put where `place` says: x across from the centreline, y up the
// neck. What hides what is worked out looking along the neck's own normal, as the scroll widths
// panel shows it; a view tilted off that by the neck angle would see a sliver more or less of a
// turn, not worth a second pass
function viewStrokes(place: (x: number, y: number) => Pt) {
  const strokes: ScrollViewStroke[] = [];
  const at = (pt: { x: number; y: number }, side: number) => place(side * pt.x, pt.y);
  const stroke = (d: string, ink: ScrollViewInk, weight: number, cover: string | string[] | null) => {
    const shown = cover ? occludePath(d, cover).visible : d;
    if (shown) strokes.push({ d: shown, ink, weight });
  };
  // a half outline, x out from the centreline, drawn on both sides of it
  const contour = (pts: { x: number; y: number }[], ink: ScrollViewInk, cover: string | string[] | null = null) => {
    if (pts.length < 2) return;
    for (const side of [1, -1]) stroke(pathFromPolyline(pts.map(pt => at(pt, side))), ink, STROKE_WEIGHT.trace, cover);
  };
  const closed = (pts: { x: number; y: number }[]) =>
    pathFromPolygon([...pts.map(pt => at(pt, 1)), ...pts.map(pt => at(pt, -1)).reverse()]);
  const line = (a: Pt, b: Pt, ink: ScrollViewInk) => strokes.push({ line: [a, b], ink, weight: STROKE_WEIGHT.trace });
  // a turn's face, seen edge on where the path turns over: level from the turn's own half-width in
  // to whatever stands nearer the viewer at that height, or right across where nothing does
  const face = (y: number, from: number, to: number | null, ink: ScrollViewInk) => {
    if (to === null) line(place(-from, y), place(from, y), ink);
    else if (to < from) for (const side of [1, -1]) line(place(side * from, y), place(side * to, y), ink);
  };
  return { strokes, at, stroke, contour, closed, line, face };
}

// the scroll from behind, the neck's sides running on up from `neckFrom` until they meet it
export function scrollBackViewStrokes(p: EnricoCerutiParams, place: (x: number, y: number) => Pt, neckFrom: number): ScrollViewStroke[] {
  const v = p.scroll!;
  const eyeHalf = v.widths.eye / 2;
  const eyeTop = v.eye.y + v.eye.r;
  const eyeBottom = v.eye.y - v.eye.r;
  const on = scrollPathStretches(p);
  const start = on.back[0];
  const crown = on.back.at(-1)!;
  const turn1Bottom = on.turn1Front.at(-1)!;
  const turn2Top = on.turn2Back.at(-1)!;
  const turn2Bottom = on.turn2Front.at(-1)!;
  const turn3Top = on.turn3Back.at(-1)!;
  const { below, cheeks, footEdge, foot, walls, bottom } = pegboxOutline(p, start);
  const seen = (pts: Pt3D[]) => seenRuns(on, pts, true);
  const { strokes, stroke, contour, closed, line, face } = viewStrokes(place);

  // the back starts in the duck tail's round, the neck's back carried on round. A path starting
  // above the nut's foot leaves the pegbox's front running on below the back, so the two can't
  // join: its walls are drawn in the front's colour
  const r = duckTailRadius(p);
  const round = Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: 0, y: start.y, r }, TURN.half + TURN.half * i / 32)).map(pt => place(pt.x, pt.y));
  const hanging = foot < (below ? cheeks[1].y : start.y);

  // the neck's sides run on up until they meet the scroll, in the round, the cheeks or the front's walls
  const overNeck = [
    ...(r > 0 ? [pathFromPolygon(round)] : []),
    ...(below ? [closed(cheeks)] : []),
    ...(hanging ? [closed(walls)] : []),
  ];
  for (const side of [1, -1]) {
    stroke(pathFromLine(place(side * scrollNeckHalfWidth(p, neckFrom), neckFrom), place(side * scrollNeckHalfWidth(p, start.y), start.y)), 'neckOff', STROKE_WEIGHT.section, overNeck.length ? overNeck : null);
  }

  // the head's back stands nearest and shows whole, and the back of each turn stands out past it.
  // The front of a turn shows over the top of the next turn in, down to that turn's top, and is
  // hidden behind its back below there. Any of them is hidden too wherever a nearer stretch is as
  // wide: the first turn's front under the crown, beside a back still wider than it
  contour(on.back, 'archBack');
  for (const run of seen(clipPolylineAtY(on.turn1Front, turn2Top.y, 'above'))) contour(run, 'archBack');
  for (const run of seen(on.turn2Back)) contour(run, 'archBack');
  for (const run of seen(clipPolylineAtY(on.turn2Front, turn3Top.y, 'above'))) contour(run, 'archBack');
  for (const run of seen(on.turn3Back)) contour(run, 'archBack');
  for (const run of seen(on.turn3Front)) contour(run, 'archBack');

  if (r > 0) strokes.push({ d: pathFromPolyline(round), ink: 'archBack', weight: STROKE_WEIGHT.trace });
  if (below) {
    contour(cheeks, 'archBack');
    contour(footEdge, 'archBack');
  }
  if (hanging) {
    // the walls run in from the hips behind the round, and show from where they come out under it.
    // The front's bottom shows only where it overhangs the neck; over the neck it's smoothed in
    const neck = closed([{ x: scrollNeckHalfWidth(p, neckFrom), y: neckFrom }, { x: scrollNeckHalfWidth(p, start.y), y: start.y }]);
    contour(walls, 'archTop', r > 0 ? pathFromPolygon(round) : null);
    contour(bottom, 'archTop', neck);
  }

  // each face runs in to the back of the turn outside it, the head's own back for the first two
  face(crown.y, crown.x, null, 'scrollBackLight');
  face(turn1Bottom.y, turn1Bottom.x, halfWidthAtHeight(on.back, turn1Bottom.y), 'scrollBackLight');
  face(turn2Top.y, turn2Top.x, halfWidthAtHeight(on.back, turn2Top.y), 'scrollBackLight');
  face(turn2Bottom.y, turn2Bottom.x, halfWidthAtHeight(on.turn2Back, turn2Bottom.y), 'scrollBackLight');
  face(turn3Top.y, turn3Top.x, halfWidthAtHeight(on.turn2Back, turn3Top.y), 'scrollBackLight');
  face(eyeTop, eyeHalf, halfWidthAtHeight(on.turn3Back, eyeTop), 'scrollBackLight');
  face(eyeBottom, eyeHalf, halfWidthAtHeight(on.turn3Back, eyeBottom), 'scrollBackLight');
  // the eye stands out as a cylinder to the last width
  for (const side of [1, -1]) line(place(side * eyeHalf, eyeBottom), place(side * eyeHalf, eyeTop), 'scrollBackLight');

  // hips on the round's top wider than it leave the cheeks' feet standing out past it, cut in to the
  // round along a level shoulder. A neck wider than the round meets it along a shoulder too; a
  // narrower one runs in under it
  if (!below && start.x > r + 1e-6) {
    for (const side of [1, -1]) line(place(side * r, start.y), place(side * start.x, start.y), 'archBack');
  }
  const neckHalf = scrollNeckHalfWidth(p, start.y);
  const cheek = Math.max(r, start.x);
  if (neckHalf > cheek + 1e-6) {
    for (const side of [1, -1]) line(place(side * cheek, start.y), place(side * neckHalf, start.y), 'scrollBackLight');
  }
  return strokes;
}

// the scroll from in front, the neck's sides running on up from `neckFrom` to the nut
export function scrollFrontViewStrokes(p: EnricoCerutiParams, place: (x: number, y: number) => Pt, neckFrom: number): ScrollViewStroke[] {
  const v = p.scroll!;
  const { nutHeight } = p.stringSetup!;
  const nutHalf = p.stringSetup!.nutWidth / 2;
  const eyeHalf = v.widths.eye / 2;
  const eyeTop = v.eye.y + v.eye.r;
  const eyeBottom = v.eye.y - v.eye.r;
  const on = scrollPathStretches(p);
  const crown = on.back.at(-1)!;
  const turn1Bottom = on.turn1Front.at(-1)!;
  const turn2Top = on.turn2Back.at(-1)!;
  const turn2Bottom = on.turn2Front.at(-1)!;
  const turn3Top = on.turn3Back.at(-1)!;
  const { walls, bottom } = pegboxOutline(p, on.back[0]);
  const seen = (pts: Pt3D[]) => seenRuns(on, pts, false);
  const { strokes, at, stroke, contour, line, face } = viewStrokes(place);

  // the round is hidden, and the nut stands nearest, hiding whatever of the pegbox is narrower than it
  const nut = [place(-nutHalf, 0), place(nutHalf, 0), place(nutHalf, nutHeight), place(-nutHalf, nutHeight)];
  const overPegbox = pathFromPolygon(nut);
  for (const side of [1, -1]) {
    stroke(pathFromLine(place(side * scrollNeckHalfWidth(p, neckFrom), neckFrom), place(side * scrollNeckHalfWidth(p, 0), 0)), 'neckOff', STROKE_WEIGHT.section, null);
  }
  strokes.push({ polygon: nut, ink: 'nut', weight: STROKE_WEIGHT.section });
  contour([...walls, ...bottom.slice(1)], 'archTop', overPegbox);

  // the pegbox runs in under the volute at the first turn's bottom, and its back is hidden all the
  // way up: behind the first turn above there, and the same line as its front below
  const pegboxTop = turn1Bottom.y;
  const pegboxFront = scrollFrontWidths(p);
  contour(clipPolylineAtY(pegboxFront, pegboxTop, 'below'), 'archTop', overPegbox);

  // a pegbox wider than the volute over it is the rare exception: above the first turn's bottom its
  // cheeks show wherever they stand out past the volute. That takes in the second turn's back,
  // which curls round in front of the throat
  for (const run of seen(clipPolylineAtY(pegboxFront, pegboxTop, 'above'))) contour(run, 'archTop');

  // the first turn's front stands nearest and shows whole, and the front of each turn inside it
  // stands out past it. The back of a turn shows under the turn inside it, up to that turn's bottom,
  // and the last up to the eye's. A nearer stretch as wide hides any of them
  contour(on.turn1Front, 'archTop');
  for (const run of seen(clipPolylineAtY(on.turn2Back, turn2Bottom.y, 'below'))) contour(run, 'archTop');
  for (const run of seen(on.turn2Front)) contour(run, 'archTop');
  for (const run of seen(clipPolylineAtY(on.turn3Back, eyeBottom, 'below'))) contour(run, 'archTop');
  for (const run of seen(on.turn3Front)) contour(run, 'archTop');

  // the hollow's mouth, each cheek's thickness in from the outside. It ends level where the side
  // view's hollow does, unless the volute hides it first, and then it is left open
  const hollowTop = scrollLines(p).frontStraight[1].y;
  const mouthTop = Math.min(hollowTop, pegboxTop);
  const mouth = [nutHeight, pegboxHipHeight(p), mouthTop]
    .filter(y => y >= nutHeight && y <= mouthTop)
    .map(y => new Pt(pegboxWidth(p, y) / 2 - v.pegbox.wall, y));
  if (mouth.length > 1 && mouth.every(pt => pt.x > 0)) {
    const right = mouth.map(pt => at(pt, 1));
    const left = mouth.map(pt => at(pt, -1));
    const d = hollowTop <= pegboxTop ? pathFromPolygon([...right, ...left.reverse()]) : pathFromPolyline([...right.reverse(), ...left]);
    strokes.push({ d, ink: 'scrollFrontLight', weight: STROKE_WEIGHT.trace });
  }

  // each face runs in to the front of the turn outside it. The first turn has none outside it, so
  // its bottom runs right across, over the pegbox running in under it. The eye's top is behind the
  // last turn's front
  face(crown.y, crown.x, null, 'scrollFrontLight');
  face(turn1Bottom.y, turn1Bottom.x, null, 'scrollFrontLight');
  face(turn2Top.y, turn2Top.x, halfWidthAtHeight(on.turn1Front, turn2Top.y), 'scrollFrontLight');
  face(turn2Bottom.y, turn2Bottom.x, halfWidthAtHeight(on.turn1Front, turn2Bottom.y), 'scrollFrontLight');
  face(turn3Top.y, turn3Top.x, halfWidthAtHeight(on.turn2Front, turn3Top.y), 'scrollFrontLight');
  face(eyeBottom, eyeHalf, halfWidthAtHeight(on.turn2Front, eyeBottom), 'scrollFrontLight');
  // the eye stands out as a cylinder to the last width
  for (const side of [1, -1]) line(place(side * eyeHalf, eyeBottom), place(side * eyeHalf, eyeTop), 'scrollFrontLight');
  return strokes;
}

// a view set on the end of the neck in the plan, `dx` across from the plan's centreline: the neck's
// tilt foreshortens its height, and the drawing is otherwise the widths panel's, not a projection
// — the turns' depths would land them at different heights and the drawing comes apart
const onNeckInPlan = (p: EnricoCerutiParams, dx: number) => {
  const m = scrollOnNeck(p);
  return (x: number, y: number) => new Pt(dx + x, m[3] * y + m[5]);
};

// the front view as the front profile shows it: the nut and the neck below are the profile's own
export function scrollFrontInPlan(p: EnricoCerutiParams): ScrollViewStroke[] {
  return scrollFrontViewStrokes(p, onNeckInPlan(p, 0), 0)
    .filter(stroke => stroke.ink !== 'nut' && stroke.ink !== 'neckOff');
}

// the back view as the back profile shows it, the neck's sides carried on from the nut up to the
// scroll; below the nut they're the profile's own
export function scrollBackInPlan(p: EnricoCerutiParams, dx: number): ScrollViewStroke[] {
  return scrollBackViewStrokes(p, onNeckInPlan(p, dx), 0);
}
