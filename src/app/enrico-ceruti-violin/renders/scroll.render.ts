import { renderCircle, renderDashLine, renderPolygon, renderSegment, renderSegmentHalo, renderSweptArc, renderSweptArcFancy, renderSweptArcHalo } from '../../helpers/renderFuncs';
import { Pt, SweptArc } from '../../models/types';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../ceruti-types';
import { standardNutLength } from '../ceruti-neck';
import { ScrollFailure, ScrollKey, voluteGuides } from '../ceruti-scroll';
import { HighlightedSegment, HighlightedSweptArc, STROKE_WEIGHT } from './render-constants';

// the scroll in ceruti-scroll.ts's frame, the neck's tilt taken out, read off p.volute as
// calculateScroll left it. The volute panel draws the neck and the volute; the scroll panel draws
// the volute plain under the back and front

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

// every arc draws in its own colour; module arcs add its centre and the two radii that bound it
const sweptArc = (arc: SweptArc, color: string, fancy: boolean) =>
  fancy ? renderSweptArcFancy(arc, color) : renderSweptArc(arc, color, STROKE_WEIGHT.trace);

// the nut on the neck's front and the neck's end below it, open at the bottom, for context only.
// Module guides carry the neck's front and back on up past the spiral
export const renderScrollNeck = (p: EnricoCerutiParams, colors: CerutiColors, showGuides: boolean) => (g: any, ui: any): void => {
  const v = p.volute!;
  const { thickness, nutThickness } = p.neck!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 2 * thickness;

  renderPolygon([new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)], colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(0, -neckStub), new Pt(0, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(0, 0), new Pt(-thickness, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);
  renderSegment(new Pt(-thickness, 0), new Pt(-thickness, -neckStub), colors.neckOff, STROKE_WEIGHT.section)(g, ui);

  if (!showGuides) return;
  const reach = [...v.spiral ?? [], v.S0, v.S1, v.S2].map(a => a.y + a.r).filter(Number.isFinite);
  const top = Math.max(nutLength, v.eyeY + v.eyeRadius, ...reach) + thickness;
  renderDashLine(new Pt(0, 0), new Pt(0, top), colors.neck, STROKE_WEIGHT.guide)(g, ui);
  renderDashLine(new Pt(-thickness, 0), new Pt(-thickness, top), colors.neck, STROKE_WEIGHT.guide)(g, ui);
};

// the eye, the spiral and the crown (S0, S1). The construction toggle adds the figure the spiral's
// centres are found on
export const renderVolute = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedSweptArc | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.volute!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderSweptArcHalo(highlighted.arc, highlighted.color)(g, ui);

  if (!solved('spiral')) return;
  renderCircle({ x: v.eyeX, y: v.eyeY, r: v.eyeRadius }, colors.neckOff)(g, ui);
  if (currentModule && flags.showVoluteConstruction) {
    for (const line of voluteGuides(v)) {
      for (let i = 1; i < line.length; i++) renderSegment(line[i - 1], line[i], colors.neckOff, STROKE_WEIGHT.guide, true)(g, ui);
    }
  }

  const inward = [...v.spiral!].reverse();
  for (let i = 0; i < inward.length; i++) sweptArc(inward[i], arcColor(colors, i), fancy)(g, ui);

  solved('S0') && sweptArc(v.S0, colors.scrollBackLight, fancy)(g, ui);
  solved('S1') && sweptArc(v.S1, colors.scrollBack, fancy)(g, ui);
};

// the back from S2 on down to the nape, and the front up from the nut. A straight shares its colour
// with the arc whose row it is set on, the square line the nape's
export const renderScroll = (
  p: EnricoCerutiParams,
  colors: CerutiColors,
  flags: ScrollViewFlags,
  currentModule: boolean,
  highlighted: HighlightedSweptArc | null,
  highlightedLine: HighlightedSegment | null,
  failures: ScrollFailure[] = [],
) => (g: any, ui: any): void => {
  const v = p.volute!;
  const { thickness } = p.neck!;
  const unsolved = new Set(failures.flatMap(f => f.unsolved));
  const solved = (key: ScrollKey) => !unsolved.has(key);
  const fancy = (currentModule && flags.showModuleArcs) || flags.showAllArcs;

  if (highlighted) renderSweptArcHalo(highlighted.arc, highlighted.color)(g, ui);
  if (highlightedLine) renderSegmentHalo(...highlightedLine.line, highlightedLine.color)(g, ui);

  // the neck's back carried up from the nut to meet the nape
  if (solved('nape') && v.nape.y > 0) renderSegment(new Pt(-thickness, v.nape.y), new Pt(-thickness, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);

  solved('S2') && sweptArc(v.S2, colors.scrollBackLight, fancy)(g, ui);
  solved('S3') && sweptArc(v.S3, colors.scrollBack, fancy)(g, ui);
  solved('nape') && sweptArc(v.nape, colors.scrollNape, fancy)(g, ui);
  solved('F0') && sweptArc(v.F0, colors.scrollFront, fancy)(g, ui);
  solved('F1') && sweptArc(v.F1, colors.scrollFrontLight, fancy)(g, ui);

  if (v.backStraightLine) renderSegment(...v.backStraightLine, colors.scrollBackLight, STROKE_WEIGHT.trace)(g, ui);
  if (v.square) renderSegment(...v.square, colors.scrollNape, STROKE_WEIGHT.trace)(g, ui);
  if (v.flatLine) renderSegment(...v.flatLine, colors.scrollFrontLight, STROKE_WEIGHT.trace)(g, ui);
  if (v.frontStraightLine) renderSegment(...v.frontStraightLine, colors.scrollFront, STROKE_WEIGHT.trace)(g, ui);
};
