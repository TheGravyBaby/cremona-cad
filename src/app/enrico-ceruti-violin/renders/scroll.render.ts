import { arcReach, dist, normalizeRadians, pointOnCircle, TURN } from '../../helpers/math/simpleGeometry';
import { occludePath, pathFromLine, pathFromPolygon } from '../../helpers/math/pathMath';
import { renderArcFromArc, renderArcFromArcFancy, renderArcHalo, renderCircle, renderCrosshair, renderDashLine, mixColors, renderPath, renderPointHalo, renderPolygon, renderSegment, renderSegmentHalo } from '../../helpers/renderFuncs';
import { Arc, Pt, Pt3D } from '../../models/types';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams, ScrollParams } from '../ceruti-types';
import { duckTailRadius, pegboxCavity, pegboxTaperStart, pegboxWidth, scrollBackWidths, ScrollFailure, ScrollKey, scrollExtent, scrollFrontWidths, scrollLines, scrollNeckHalfWidth, ScrollStationKey, scrollWidthStations, TO_FRONT } from '../ceruti-scroll';
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

// the widest of the contour's crossings at height y that is narrower than x, or null
function insideAt(widths: Pt3D[], y: number, x: number): number | null {
  let inside: number | null = null;
  for (let k = 1; k < widths.length; k++) {
    const a = widths[k - 1];
    const b = widths[k];
    if (a.y === b.y || (a.y - y) * (b.y - y) > 0) continue;
    const at = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    if (at < x - 1e-6 && (inside === null || at > inside)) inside = at;
  }
  return inside;
}

// where the path turns over, the face of that turn is seen edge on from behind or in front: a
// level line from the turn's width in to the next contour inside it, or right across where none is,
// as over the crown
export function scrollWidthLedges(widths: Pt3D[]): { y: number; from: number; to: number | null }[] {
  const turns = widths.filter((pt, k) => k > 0 && k < widths.length - 1
    && (pt.y - widths[k - 1].y) * (widths[k + 1].y - pt.y) < 0);
  return turns.map(pt => ({ y: pt.y, from: pt.x, to: insideAt(widths, pt.y, pt.x) }));
}

// the side profile's width stations, and the path seen from behind and from the front: the back view beside
// the scroll's furthest reach, the front beside the nut with the pegbox's front over the volute.
// Each view carries the turns' faces and the eye, a cylinder standing out to the last width. From
// behind, the back starts in the duck tail's round, with shoulders out to the path where it is
// narrower; from the front the round is hidden and the path runs on down to the foot of the nut,
// where the scroll meets the neck, closing level there. Each view carries the neck on below as the
// side view does, nothing drawn where it passes behind
export const renderScrollWidths = (p: EnricoCerutiParams, colors: CerutiColors, focused: ScrollStationKey | null) => (g: any, ui: any): void => {
  const gap = 20;
  const v = p.scroll!;
  const widths = scrollBackWidths(p);
  const stations = scrollWidthStations(p);
  const eyeWidth = widths.at(-1)!.x;
  const widest = Math.max(...widths.map(pt => pt.x));
  const back = -scrollExtent(v).width - gap - widest;
  const front = p.stringSetup!.nutThickness + gap + widest;

  const stroke = (d: string, ink: string, weight: number, cover: string | string[] | null) => {
    const shown = cover ? occludePath(d, cover).visible : d;
    if (shown) renderPath(shown, ink, weight)(g, ui);
  };
  const contour = (pts: Pt3D[], center: number, ink: string, cover: string | null = null) => {
    for (const side of [1, -1]) {
      stroke(pts.map((pt, i) => `${i ? 'L' : 'M'} ${center + side * pt.x} ${pt.y}`).join(' '), ink, STROKE_WEIGHT.trace, cover);
    }
  };
  const stub = neckStub(p);
  const { nutHeight } = p.stringSetup!;
  const nutHalf = p.stringSetup!.nutWidth / 2;
  const ledges = [
    ...scrollWidthLedges(widths),
    ...[v.eye.y - v.eye.r, v.eye.y + v.eye.r].map(y => ({ y, from: eyeWidth, to: insideAt(widths, y, eyeWidth) })),
  ];
  const start = widths[0];
  const foot = Math.min(start.y, 0);
  // below the path's start the pegbox runs on down its taper to the straight, then square to the foot
  const taperStart = pegboxTaperStart(p);
  const closing = [start, ...(start.y > taperStart ? [new Pt3D(nutHalf, taperStart, 0)] : []), new Pt3D(nutHalf, foot, 0), new Pt3D(0, foot, 0)];
  const r = duckTailRadius(p);
  const round = Array.from({ length: 33 }, (_, i) => pointOnCircle({ x: 0, y: start.y, r }, TURN.half + TURN.half * i / 32));
  const view = (center: number, behind: boolean) => {
    const [line, light] = behind ? [colors.archBack, colors.scrollBackLight] : [colors.archTop, colors.scrollFrontLight];
    const neckSide = (side: number, top: number) =>
      pathFromLine(new Pt(center + side * scrollNeckHalfWidth(p, -stub), -stub), new Pt(center + side * scrollNeckHalfWidth(p, top), top));
    if (behind) {
      // a path starting above the nut's foot leaves the pegbox's front running on below the back, so
      // the back and front can't join; its walls are drawn in the front's colour, and its bottom only
      // where it overhangs the neck, joining the two. Over the neck it's smoothed into it
      const hanging = foot < start.y;
      const walls = closing.slice(0, -1);
      // from behind the neck's sides run on up until they meet the scroll, in the round or the front
      const placed = round.map(pt => new Pt(center + pt.x, pt.y));
      const covers = [
        ...(r > 0 ? [pathFromPolygon(placed)] : []),
        ...(hanging ? [pathFromPolygon([...walls.map(pt => new Pt(center + pt.x, pt.y)), ...walls.map(pt => new Pt(center - pt.x, pt.y)).reverse()])] : []),
      ];
      for (const side of [1, -1]) stroke(neckSide(side, start.y), colors.neckOff, STROKE_WEIGHT.section, covers.length ? covers : null);
      contour(widths, center, line);
      if (r > 0) renderPath(placed.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x} ${pt.y}`).join(' '), line, STROKE_WEIGHT.trace)(g, ui);
      if (hanging) {
        const neck = pathFromPolygon([
          new Pt(center - scrollNeckHalfWidth(p, -stub), -stub), new Pt(center + scrollNeckHalfWidth(p, -stub), -stub),
          new Pt(center + scrollNeckHalfWidth(p, start.y), start.y), new Pt(center - scrollNeckHalfWidth(p, start.y), start.y),
        ]);
        contour(walls, center, colors.archTop);
        contour(closing.slice(-2), center, colors.archTop, neck);
      }
    } else {
      // from in front the nut stands nearest, hiding whatever of the pegbox is narrower than it
      const nut = [new Pt(center - nutHalf, 0), new Pt(center + nutHalf, 0), new Pt(center + nutHalf, nutHeight), new Pt(center - nutHalf, nutHeight)];
      const cover = pathFromPolygon(nut);
      for (const side of [1, -1]) stroke(neckSide(side, 0), colors.neckOff, STROKE_WEIGHT.section, null);
      renderPolygon(nut, colors.nut, STROKE_WEIGHT.section)(g, ui);
      contour(widths, center, line, cover);
      contour(closing, center, line, cover);
      contour(scrollFrontWidths(p), center, line, cover);
      // the hollow's mouth, each cheek's thickness in from the outside, as far up as the side view carries it
      const mouthTop = scrollLines(p).frontStraight[1].y;
      const mouth = [nutHeight, taperStart, mouthTop]
        .filter(y => y >= nutHeight && y <= mouthTop)
        .map(y => new Pt(pegboxWidth(p, y) / 2 - v.pegboxWall, y));
      if (mouth.length > 1 && mouth.every(pt => pt.x > 0))
        renderPath(pathFromPolygon([...mouth.map(pt => new Pt(center + pt.x, pt.y)), ...mouth.map(pt => new Pt(center - pt.x, pt.y)).reverse()]), light, STROKE_WEIGHT.trace)(g, ui);
    }
    for (const { y, from, to } of ledges) {
      if (to === null) renderSegment(new Pt(center - from, y), new Pt(center + from, y), light, STROKE_WEIGHT.trace)(g, ui);
      else for (const side of [1, -1]) renderSegment(new Pt(center + side * from, y), new Pt(center + side * to, y), light, STROKE_WEIGHT.trace)(g, ui);
    }
    for (const side of [1, -1]) {
      const x = center + side * eyeWidth;
      renderSegment(new Pt(x, v.eye.y - v.eye.r), new Pt(x, v.eye.y + v.eye.r), light, STROKE_WEIGHT.trace)(g, ui);
      if (behind && Math.abs(start.x - r) > 1e-6)
        renderSegment(new Pt(center + side * r, start.y), new Pt(center + side * start.x, start.y), light, STROKE_WEIGHT.trace)(g, ui);
    }
  };

  const marked = stations.find(station => station.key === focused);
  if (marked) {
    const ink = stationColor(colors, marked.key);
    renderPointHalo(marked.at, ink)(g, ui);
    for (const center of [back, front]) {
      for (const side of [1, -1]) renderPointHalo(new Pt(center + side * marked.width / 2, marked.at.y), ink)(g, ui);
    }
  }
  view(back, true);
  view(front, false);
  const cavity = pegboxCavity(p);
  if (cavity) renderPath(cavity.map((pt, i) => `${i ? 'L' : 'M'} ${pt.x} ${pt.y}`).join(' '), colors.scrollFrontLight, STROKE_WEIGHT.trace)(g, ui);
  for (const station of stations) renderCrosshair(station.at, stationColor(colors, station.key))(g, ui);
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
