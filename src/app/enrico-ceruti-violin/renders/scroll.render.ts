import { arcReach, dist, normalizeRadians, pointOnCircle, TURN } from '../../helpers/math/simpleGeometry';
import { occludePath, pathFromLine, pathFromPolygon, pathFromPolyline } from '../../helpers/math/pathMath';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashLine, mixColors, renderPath, renderPointHalo, renderPolygon, renderSegment, renderSegmentHalo } from '../../helpers/renderFuncs';
import { Arc, Pt, Pt3D } from '../../models/types';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, ScrollParams } from '../ceruti-types';
import { duckTailRadius, pegboxCavity, pegboxTaperStart, pegboxWidth, scrollPathStretches, ScrollFailure, ScrollKey, scrollExtent, scrollFrontWidths, scrollLines, scrollNeckHalfWidth, ScrollStationKey, scrollWidthStations, TO_FRONT } from '../ceruti-scroll';
import { HighlightedArc, HighlightedSegment, STROKE_WEIGHT } from './render-constants';

// the scroll in ceruti-scroll.ts's frame, the neck's tilt taken out, read off p.volute as
// calculateScroll left it

export type ScrollViewFlags = Pick<CerutiViewFlags, 'showModuleArcs' | 'showAllArcs' | 'showModuleGuides' | 'showVoluteConstruction'>;

// a spiral arc's colour on canvas and in the four point's fields, innermost first: each turn's two
// tones alternating arc by arc, the turns coming round again past three
export function arcColor(colors: CerutiColors, i: number): string {
  const turns = [
    [colors.voluteTurn1, colors.voluteTurn1Alt],
    [colors.voluteTurn2, colors.voluteTurn2Alt],
    [colors.voluteTurn3, colors.voluteTurn3Alt],
  ];
  return turns[Math.floor(i / 4) % 3][i % 2];
}

// a scroll arc runs counterclockwise from start to end, so one past a half turn is the long way round
const longArc = (arc: Arc) => normalizeRadians(arc.end - arc.start) > TURN.half;

// every arc draws in its own colour; module arcs add its centre and the two radii that bound it
const scrollArc = (arc: Arc, color: string, fancy: boolean) =>
  fancy ? renderArcFromArcFancy(arc, color, longArc(arc)) : renderArcFromArc(arc, color, STROKE_WEIGHT.trace, longArc(arc));

// how far each view carries the neck on below the scroll
const neckStub = (p: EnricoCerutiParams) => 2 * p.neck!.thickness;


// the nut and the neck's end below it, for context. Module guides run the neck's front up to the
// crown's top, then back to S1's furthest reach
export const renderScrollNeck = (p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean, failures: ScrollFailure[] = []) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { thickness } = p.neck!;
  const { nutThickness, nutHeight } = p.stringSetup!;
  const stub = neckStub(p);

  renderPolygon([new Pt(0, 0), new Pt(0, nutHeight), new Pt(nutThickness, nutHeight), new Pt(nutThickness, 0)], colors.nut, STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(0, -stub), new Pt(0, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);
  // the neck's back runs on up to where the nape meets it, or to the nut's level while the nape is unsolved
  const backTop = failures.some(f => f.unsolved.includes('nape')) ? 0 : v.nape.y;
  if (backTop > -stub) renderSegment(new Pt(-thickness, -stub), new Pt(-thickness, backTop), colors.neckOff, STROKE_WEIGHT.section)(g, ui);

  if (!showGuides) return;
  const crownTop = Math.max(...[v.S0, v.S1].flatMap(a => arcReach(a, TURN.quarter)).map(pt => pt.y));
  const S1Back = Math.min(...arcReach(v.S1, TURN.half).map(pt => pt.x));
  if (!Number.isFinite(crownTop) || !Number.isFinite(S1Back)) return;
  renderDashLine(new Pt(0, 0), new Pt(0, crownTop), colors.neck, STROKE_WEIGHT.guide)(g, ui);
  renderDashLine(new Pt(0, crownTop), new Pt(S1Back, crownTop), colors.neck, STROKE_WEIGHT.guide)(g, ui);
};

// the eye, the spiral and the crown (S0, S1). The construction toggle adds the figure the spiral's
// centres are found on
export const renderVolute = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);

  if (!solved('spiral')) return;
  renderCircle(v.eye, colors.neckOff)(g, ui);
  if (currentModule && flags.showVoluteConstruction) {
    for (const line of voluteConstruction(v)) {
      const placed = line.map(pt => new Pt(v.eye.x + pt.x, v.eye.y + pt.y));
      for (let i = 1; i < placed.length; i++) renderSegment(placed[i - 1], placed[i], colors.neckOff, STROKE_WEIGHT.guide, true)(g, ui);
    }
  }

  const inward = [...v.spiral!].reverse();
  for (let i = 0; i < inward.length; i++) scrollArc(inward[i], arcColor(colors, i), fancy)(g, ui);

  // the crown keeps the warm pair though it runs on into the back, which is cool
  solved('S0') && scrollArc(v.S0, colors.scrollFrontLight, fancy)(g, ui);
  solved('S1') && scrollArc(v.S1, colors.scrollFront, fancy)(g, ui);
};

// the back from S2 down to the nape, and the front up from the nut. A straight takes its arc's
// colour, the square line the nape's; module guides box the head
export const renderScroll = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedArc | null,
  highlightedLine: HighlightedSegment | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderArcHalo(highlighted.arc, highlighted.color, undefined, undefined, longArc(highlighted.arc))(g, ui);
  if (highlightedLine) renderSegmentHalo(...highlightedLine.line, highlightedLine.color)(g, ui);

  if (currentModule && flags.showModuleGuides && solved('S3')) {
    const { height, width } = scrollExtent(v);
    const corners = [new Pt(0, 0), new Pt(0, height), new Pt(-width, height), new Pt(-width, 0)];
    for (let i = 0; i < 4; i++) renderDashLine(corners[i], corners[(i + 1) % 4], colors.neck, STROKE_WEIGHT.guide)(g, ui);
  }

  solved('S2') && scrollArc(v.S2, colors.scrollBackLight, fancy)(g, ui);
  solved('S3') && scrollArc(v.S3, colors.scrollBack, fancy)(g, ui);
  solved('nape') && scrollArc(v.nape, colors.scrollNape, fancy)(g, ui);
  solved('F0') && scrollArc(v.F0, colors.scrollFront, fancy)(g, ui);
  solved('F1') && scrollArc(v.F1, colors.scrollFrontLight, fancy)(g, ui);

  // a straight of no length, or a duck tail already at the nape, has nothing to draw
  const line = ([a, b]: [Pt, Pt], color: string) => dist(a, b) > 1e-9 && renderSegment(a, b, color, STROKE_WEIGHT.trace)(g, ui);
  const lines = scrollLines(p);
  solved('backStraight') && line(lines.backStraight, colors.scrollBackLight);
  solved('nape') && line(lines.square, colors.scrollNape);
  solved('flat') && line(lines.flat, colors.scrollFrontLight);
  solved('frontStraight') && line(lines.frontStraight, colors.scrollFront);
};

const STATION_ORDER: ScrollStationKey[] = ['nut', 'straight', 'throat', 'crown', 'turn1Bottom', 'turn2Top', 'turn2Bottom', 'eye'];

// a width's colour on canvas and in its field, from the nut in to the eye
export function stationColor(colors: CerutiColors, key: ScrollStationKey): string {
  const t = STATION_ORDER.indexOf(key) / (STATION_ORDER.length - 1);
  return t < 0.5
    ? mixColors(colors.scrollPathStart, colors.scrollPathMid, t * 2)
    : mixColors(colors.scrollPathMid, colors.scrollPathEnd, t * 2 - 1);
}

// a stretch of the path only rises or only falls, so a height cuts it once: the part at or above
// the height, or at or below it
function cutAtHeight(pts: Pt3D[], y: number, keep: 'above' | 'below'): Pt3D[] {
  const kept = (pt: Pt3D) => keep === 'above' ? pt.y >= y : pt.y <= y;
  const out: Pt3D[] = [];
  for (let k = 0; k < pts.length; k++) {
    const pt = pts[k];
    const last = pts[k - 1];
    if (last && kept(last) !== kept(pt)) {
      const t = (y - last.y) / (pt.y - last.y);
      out.push(new Pt3D(last.x + (pt.x - last.x) * t, y, last.z + (pt.z - last.z) * t));
    }
    if (kept(pt)) out.push(pt);
  }
  return out;
}

// where a stretch passes height y, or null where it never does
function atHeight(pts: Pt3D[], y: number): Pt3D | null {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    if (a.y === b.y || (a.y - y) * (b.y - y) > 0) continue;
    const t = (y - a.y) / (b.y - a.y);
    return new Pt3D(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
  }
  return null;
}

function halfWidthAtHeight(pts: Pt3D[], y: number): number | null {
  return atHeight(pts, y)?.x ?? null;
}

// the side profile with a crosshair on each width and the pegbox's hollow dashed inside it, and the
// path seen from behind and from the front: the back view beside the scroll's furthest reach, the
// front view beside the nut. Each view carries the neck on below as the side view does.
//
// The two views are drawn the way a draughtsman would, not projected: the volute's turns stand out
// further the nearer the eye, so each stretch of the path is drawn as far as the next turn nearer
// the viewer lets it be seen, and nothing hidden is drawn. calculateScrollWidths holding each turn
// at least as wide as the one before is what keeps that order true
export const renderScrollWidths = (p: EnricoCerutiParams, colors: CerutiColors, focused: ScrollStationKey | null, showGuides: boolean) => (g: any, ui: any): void => {
  const v = p.scroll!;
  const { nutHeight, nutThickness } = p.stringSetup!;
  const nutHalf = p.stringSetup!.nutWidth / 2;
  const eyeHalf = v.widths.eye / 2;
  const eyeTop = v.eye.y + v.eye.r;
  const eyeBottom = v.eye.y - v.eye.r;
  const stations = scrollWidthStations(p);

  // each stretch ends on the turn it is named up or down to
  const on = scrollPathStretches(p);
  const start = on.back[0];
  const crown = on.back.at(-1)!;
  const turn1Bottom = on.turn1Front.at(-1)!;
  const turn2Top = on.turn2Back.at(-1)!;
  const turn2Bottom = on.turn2Front.at(-1)!;
  const turn3Top = on.turn3Back.at(-1)!;

  // what of a line can be seen: its runs of points that no stretch of the path hides, one nearer
  // the viewer and at least as wide at that height. z is the side view's x, so from behind the
  // lesser stands nearer and from in front the greater
  const stretches = [on.back, on.turn1Front, on.turn2Back, on.turn2Front, on.turn3Back, on.turn3Front];
  const seen = (pts: Pt3D[], behind: boolean): Pt3D[][] => {
    const hidden = (pt: Pt3D) => stretches.some(stretch => {
      // a stretch hides nothing at the height it turns over at: a line cut there stops on the turn's face
      const turnsOver = Math.abs(pt.y - stretch[0].y) < 1e-9 || Math.abs(pt.y - stretch.at(-1)!.y) < 1e-9;
      const over = turnsOver ? null : atHeight(stretch, pt.y);
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
  };

  const gap = 20;
  const widest = Math.max(eyeHalf, nutHalf);
  const back = -scrollExtent(v).width - gap - widest;
  const front = nutThickness + gap + widest;

  // a half outline, x out from a view's centreline, drawn on both sides of it
  const stroke = (d: string, ink: string, weight: number, cover: string | string[] | null) => {
    const shown = cover ? occludePath(d, cover).visible : d;
    if (shown) renderPath(shown, ink, weight)(g, ui);
  };
  const contour = (pts: { x: number; y: number }[], center: number, ink: string, cover: string | null = null) => {
    if (pts.length < 2) return;
    for (const side of [1, -1]) stroke(pathFromPolyline(pts.map(pt => new Pt(center + side * pt.x, pt.y))), ink, STROKE_WEIGHT.trace, cover);
  };
  const closed = (pts: { x: number; y: number }[], center: number) =>
    pathFromPolygon([...pts.map(pt => new Pt(center + pt.x, pt.y)), ...pts.map(pt => new Pt(center - pt.x, pt.y)).reverse()]);

  // a turn's face, seen edge on where the path turns over: level from the turn's own half-width in
  // to whatever stands nearer the viewer at that height, or right across where nothing does
  const face = (center: number, y: number, from: number, to: number | null, ink: string) => {
    if (to === null) renderSegment(new Pt(center - from, y), new Pt(center + from, y), ink, STROKE_WEIGHT.trace)(g, ui);
    else if (to < from) for (const side of [1, -1]) renderSegment(new Pt(center + side * from, y), new Pt(center + side * to, y), ink, STROKE_WEIGHT.trace)(g, ui);
  };
  // the eye stands out as a cylinder to the last width
  const eyeSides = (center: number, ink: string) => {
    for (const side of [1, -1]) renderSegment(new Pt(center + side * eyeHalf, eyeBottom), new Pt(center + side * eyeHalf, eyeTop), ink, STROKE_WEIGHT.trace)(g, ui);
  };

  // the path starts at the top of the duck tail's round. Below that the pegbox runs on down its
  // taper to the end of its straight, square to the foot of the nut, and closes level there
  const foot = Math.min(start.y, 0);
  const taperStart = pegboxTaperStart(p);
  const walls = [start, ...(start.y > taperStart ? [new Pt(nutHalf, taperStart)] : []), new Pt(nutHalf, foot)];
  const bottom = [new Pt(nutHalf, foot), new Pt(0, foot)];

  const stub = neckStub(p);
  const neckSide = (center: number, side: number, top: number) =>
    pathFromLine(new Pt(center + side * scrollNeckHalfWidth(p, -stub), -stub), new Pt(center + side * scrollNeckHalfWidth(p, top), top));

  const marked = stations.find(station => station.key === focused);
  if (marked) {
    const ink = stationColor(colors, marked.key);
    renderPointHalo(marked.at, ink)(g, ui);
    for (const center of [back, front]) {
      for (const side of [1, -1]) renderPointHalo(new Pt(center + side * marked.width / 2, marked.at.y), ink)(g, ui);
    }
  }

  // from behind, the back starts in the duck tail's round, the neck's back carried on round. A path
  // starting above the nut's foot leaves the pegbox's front running on below the back, so the two
  // can't join: its walls are drawn in the front's colour
  const r = duckTailRadius(p);
  const round = Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: back, y: start.y, r }, TURN.half + TURN.half * i / 32));
  const hanging = foot < start.y;

  // the neck's sides run on up until they meet the scroll, in the round or the front's walls
  const overNeck = [
    ...(r > 0 ? [pathFromPolygon(round)] : []),
    ...(hanging ? [closed(walls, back)] : []),
  ];
  for (const side of [1, -1]) stroke(neckSide(back, side, start.y), colors.neckOff, STROKE_WEIGHT.section, overNeck.length ? overNeck : null);

  // the head's back stands nearest and shows whole, and the back of each turn stands out past it.
  // The front of a turn shows over the top of the next turn in, down to that turn's top, and is
  // hidden behind its back below there. Any of them is hidden too wherever a nearer stretch is as
  // wide: the first turn's front under the crown, beside a back still wider than it
  contour(on.back, back, colors.archBack);
  for (const run of seen(cutAtHeight(on.turn1Front, turn2Top.y, 'above'), true)) contour(run, back, colors.archBack);
  for (const run of seen(on.turn2Back, true)) contour(run, back, colors.archBack);
  for (const run of seen(cutAtHeight(on.turn2Front, turn3Top.y, 'above'), true)) contour(run, back, colors.archBack);
  for (const run of seen(on.turn3Back, true)) contour(run, back, colors.archBack);
  for (const run of seen(on.turn3Front, true)) contour(run, back, colors.archBack);

  if (r > 0) renderPath(pathFromPolyline(round), colors.archBack, STROKE_WEIGHT.trace)(g, ui);
  if (hanging) {
    // the front's bottom shows only where it overhangs the neck; over the neck it's smoothed in
    const neck = pathFromPolygon([
      new Pt(back - scrollNeckHalfWidth(p, -stub), -stub), new Pt(back + scrollNeckHalfWidth(p, -stub), -stub),
      new Pt(back + scrollNeckHalfWidth(p, start.y), start.y), new Pt(back - scrollNeckHalfWidth(p, start.y), start.y),
    ]);
    contour(walls, back, colors.archTop);
    contour(bottom, back, colors.archTop, neck);
  }

  // each face runs in to the back of the turn outside it, the head's own back for the first two
  face(back, crown.y, crown.x, null, colors.scrollBackLight);
  face(back, turn1Bottom.y, turn1Bottom.x, halfWidthAtHeight(on.back, turn1Bottom.y), colors.scrollBackLight);
  face(back, turn2Top.y, turn2Top.x, halfWidthAtHeight(on.back, turn2Top.y), colors.scrollBackLight);
  face(back, turn2Bottom.y, turn2Bottom.x, halfWidthAtHeight(on.turn2Back, turn2Bottom.y), colors.scrollBackLight);
  face(back, turn3Top.y, turn3Top.x, halfWidthAtHeight(on.turn2Back, turn3Top.y), colors.scrollBackLight);
  face(back, eyeTop, eyeHalf, halfWidthAtHeight(on.turn3Back, eyeTop), colors.scrollBackLight);
  face(back, eyeBottom, eyeHalf, halfWidthAtHeight(on.turn3Back, eyeBottom), colors.scrollBackLight);
  eyeSides(back, colors.scrollBackLight);

  // a round narrower or wider than the path's start leaves a shoulder between them
  if (Math.abs(start.x - r) > 1e-6) {
    for (const side of [1, -1]) renderSegment(new Pt(back + side * r, start.y), new Pt(back + side * start.x, start.y), colors.scrollBackLight, STROKE_WEIGHT.trace)(g, ui);
  }

  // from in front the round is hidden, and the nut stands nearest, hiding whatever of the pegbox
  // is narrower than it
  const nut = [new Pt(front - nutHalf, 0), new Pt(front + nutHalf, 0), new Pt(front + nutHalf, nutHeight), new Pt(front - nutHalf, nutHeight)];
  const overPegbox = pathFromPolygon(nut);
  for (const side of [1, -1]) stroke(neckSide(front, side, 0), colors.neckOff, STROKE_WEIGHT.section, null);
  renderPolygon(nut, colors.nut, STROKE_WEIGHT.section)(g, ui);
  contour([...walls, ...bottom.slice(1)], front, colors.archTop, overPegbox);

  // the pegbox runs in under the volute at the first turn's bottom, and its back is hidden all the
  // way up: behind the first turn above there, and the same line as its front below
  const pegboxTop = turn1Bottom.y;
  const pegboxFront = scrollFrontWidths(p);
  contour(cutAtHeight(pegboxFront, pegboxTop, 'below'), front, colors.archTop, overPegbox);

  // a pegbox wider than the volute over it is the rare exception: above the first turn's bottom its
  // cheeks show wherever they stand out past the volute. That takes in the second turn's back,
  // which curls round in front of the throat
  for (const run of seen(cutAtHeight(pegboxFront, pegboxTop, 'above'), false)) contour(run, front, colors.archTop);

  // the first turn's front stands nearest and shows whole, and the front of each turn inside it
  // stands out past it. The back of a turn shows under the turn inside it, up to that turn's bottom,
  // and the last up to the eye's. As from behind, a nearer stretch as wide hides any of them
  contour(on.turn1Front, front, colors.archTop);
  for (const run of seen(cutAtHeight(on.turn2Back, turn2Bottom.y, 'below'), false)) contour(run, front, colors.archTop);
  for (const run of seen(on.turn2Front, false)) contour(run, front, colors.archTop);
  for (const run of seen(cutAtHeight(on.turn3Back, eyeBottom, 'below'), false)) contour(run, front, colors.archTop);
  for (const run of seen(on.turn3Front, false)) contour(run, front, colors.archTop);

  // the hollow's mouth, each cheek's thickness in from the outside. It ends level where the side
  // view's hollow does, unless the volute hides it first, and then it is left open
  const hollowTop = scrollLines(p).frontStraight[1].y;
  const mouthTop = Math.min(hollowTop, pegboxTop);
  const mouth = [nutHeight, taperStart, mouthTop]
    .filter(y => y >= nutHeight && y <= mouthTop)
    .map(y => new Pt(pegboxWidth(p, y) / 2 - v.pegbox.wall, y));
  if (mouth.length > 1 && mouth.every(pt => pt.x > 0)) {
    const right = mouth.map(pt => new Pt(front + pt.x, pt.y));
    const left = mouth.map(pt => new Pt(front - pt.x, pt.y));
    const d = hollowTop <= pegboxTop ? pathFromPolygon([...right, ...left.reverse()]) : pathFromPolyline([...right.reverse(), ...left]);
    renderPath(d, colors.scrollFrontLight, STROKE_WEIGHT.trace)(g, ui);
  }

  // each face runs in to the front of the turn outside it. The first turn has none outside it, so
  // its bottom runs right across, over the pegbox running in under it. The eye's top is behind the
  // last turn's front
  face(front, crown.y, crown.x, null, colors.scrollFrontLight);
  face(front, turn1Bottom.y, turn1Bottom.x, null, colors.scrollFrontLight);
  face(front, turn2Top.y, turn2Top.x, halfWidthAtHeight(on.turn1Front, turn2Top.y), colors.scrollFrontLight);
  face(front, turn2Bottom.y, turn2Bottom.x, halfWidthAtHeight(on.turn1Front, turn2Bottom.y), colors.scrollFrontLight);
  face(front, turn3Top.y, turn3Top.x, halfWidthAtHeight(on.turn2Front, turn3Top.y), colors.scrollFrontLight);
  face(front, eyeBottom, eyeHalf, halfWidthAtHeight(on.turn2Front, eyeBottom), colors.scrollFrontLight);
  eyeSides(front, colors.scrollFrontLight);

  // in the side view the hollow is inside the wood
  const cavity = pegboxCavity(p);
  if (cavity) renderPath(pathFromPolyline(cavity), colors.scrollFrontLight, STROKE_WEIGHT.trace, 1, '4,4')(g, ui);
  if (showGuides) for (const station of stations) renderCrosshair(station.at, stationColor(colors, station.key))(g, ui);
};

// the figure each style finds its centres on, as polylines in the eye's frame
export function voluteConstruction(v: ScrollParams): Pt[][] {
  const r = v.eye.r;
  const square = (left: number, right: number, bottom: number, top: number) =>
    [new Pt(left, bottom), new Pt(right, bottom), new Pt(right, top), new Pt(left, top), new Pt(left, bottom)];

  switch (v.style) {
    // the walk of centres
    case 'fourPoint':
      return [[...v.spiral!].reverse().map(a => new Pt(a.x - v.eye.x, a.y - v.eye.y))];

    // a ray out to the last point on each of the eight lines
    case 'archimedean':
      return Array.from({ length: 8 }, (_, ray) => {
        const eighths = ray ? 8 + ray : 2 * TO_FRONT;
        return [new Pt(0, 0), pointOnCircle({ x: 0, y: 0, r: r + v.pitch * eighths / 8 }, ray * TURN.eighth)];
      });

    // the line of centres
    case 'serlio':
      return [[new Pt(-r, 0), new Pt(r, 0)]];

    // the eye's inscribed square, and his outer square on its edge midpoints with its diagonals
    case 'salviati': {
      const h = r / 2;
      return [
        [0, 1, 2, 3, 4].map(i => pointOnCircle({ x: 0, y: 0, r }, i * TURN.quarter)),
        square(-h, h, -h, h),
        [new Pt(-h, -h), new Pt(h, h)],
        [new Pt(-h, h), new Pt(h, -h)],
      ];
    }

    // the eye's horizontal diameter and his three squares hanging from it
    case 'goldmann':
      return [
        [new Pt(-r, 0), new Pt(r, 0)],
        ...[1, 2, 3].map(k => square(-k * r / 6, k * r / 6, -k * r / 3, 0)),
      ];

    // the seed, its middle lines, and the eye's two axes out to the spiral's furthest reach
    case 'kelly': {
      const s = v.seedLength / 4;
      const reach = Math.max(r, ...v.spiral!.map(a => dist(v.eye, a) + a.r));
      return [
        square(-s / 2, s / 2, -2 * s, 2 * s),
        ...[-1, 0, 1].map(k => [new Pt(-s / 2, k * s), new Pt(s / 2, k * s)]),
        [new Pt(0, -reach), new Pt(0, reach)],
        [new Pt(-reach, 0), new Pt(reach, 0)],
      ];
    }
  }
}
