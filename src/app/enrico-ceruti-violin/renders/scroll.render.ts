import { arcPathData } from '../../helpers/math/pathMath';
import { renderCircle, renderDashLine, renderPath, renderPolygon, renderSegment, renderSmallCrosshair } from '../../helpers/renderFuncs';
import { Pt } from '../../models/types';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../ceruti-types';
import { standardNutLength } from '../ceruti-neck';
import { layoutBack, layoutFront, layoutVolute, PlacedBack, PlacedFront, VOLUTE_STYLES, VoluteArc } from '../ceruti-scroll';
import { STROKE_WEIGHT } from './render-constants';

// a spiral arc's colour as a module arc and in the four point's fields, innermost first: each turn
// a bout's colour, its arcs stepping through that colour's off shades so neighbours in a turn read
// apart, the bouts coming round again past three
export function arcColor(colors: CerutiColors, i: number): string {
  const turns = [
    [colors.upperBout, colors.upperBoutOff, colors.upperBoutOff2],
    [colors.centerBout, colors.centerBoutOff, colors.centerBoutOff2],
    [colors.lowerBout, colors.lowerBoutOff, colors.lowerBoutOff2],
  ];
  return turns[Math.floor(i / 4) % 3][[0, 1, 2, 1][i % 4]];
}

// the back's arcs by their S number, rust over the top paling into green toward the pegbox
export function backColor(colors: CerutiColors, i: number): string {
  return [colors.scrollBackUpper, colors.scrollBackUpperOff, colors.scrollBackLowerOff, colors.scrollBackLower][Math.min(i, 3)];
}

// the front's the same way up: green from the nut, rust where F1 meets the volute
export function frontColor(colors: CerutiColors, i: number): string {
  return [colors.scrollBackLower, colors.scrollBackUpper][Math.min(i, 1)];
}

// the scroll in ceruti-scroll.ts's frame, the neck's tilt taken out, for both the volute and the
// scroll panels. The nut and the neck's end are drawn for context only — the neck open at the
// bottom, stopping a little way down. The eye, spiral, back and front always draw, the neck's back
// carried up from the nut to meet the nape; module arcs draws them the way the other panels draw
// their arcs, each in its colour with its centre and the two radii that bound it, the way the
// compass swept it. Module guides carries the neck's front and back on up past the spiral, and the
// construction toggle the figure the spiral's centres are found on. The volute panel asks for the
// volute alone, the back and front left off; the scroll panel for the whole, its figure left off.
type ScrollFlags = Pick<CerutiViewFlags, 'showModuleArcs' | 'showAllArcs' | 'showModuleGuides' | 'showVoluteConstruction'>;

// the part of the scroll whose field has focus: a four point arc innermost first, a back arc by its
// S number, the back's straight or nape, a front arc by its F number, or the front's flat or straight
export type ScrollPart = { spiral: number } | { back: number } | 'straight' | 'nape' | { front: number } | 'flat' | 'frontStraight';

export function renderScroll(p: EnricoCerutiParams, colors: CerutiColors, flags: ScrollFlags, highlighted: ScrollPart | null = null, parts: 'volute' | 'whole' = 'whole') {
  const { thickness, nutThickness } = p.neck!;
  const { eyeRadius, eyeX, eyeY } = p.volute!;
  const nutLength = standardNutLength(p.height);
  const neckStub = 2 * thickness;

  const nut = [new Pt(0, 0), new Pt(0, nutLength), new Pt(nutThickness, nutLength), new Pt(nutThickness, 0)];
  const neck = [new Pt(0, -neckStub), new Pt(0, 0), new Pt(-thickness, 0), new Pt(-thickness, -neckStub)];

  const eye = new Pt(eyeX, eyeY);
  const volute = layoutVolute(p.volute!, eye);
  const whole = parts === 'whole';
  const back: PlacedBack = whole ? layoutBack(volute?.spiral ?? [], p.volute!, -thickness) : { arcs: [], straight: null, square: null, nape: null };
  const top = Math.max(nutLength, eye.y + eyeRadius, ...[...volute?.spiral ?? [], ...back.arcs].map(a => a.center.y + a.r)) + thickness;
  const napeFoot = back.nape && back.nape.center.y > 0 ? new Pt(-thickness, back.nape.center.y) : null;
  const straightColor = backColor(colors, p.volute!.back.length - 1);
  const front: PlacedFront = whole ? layoutFront(volute?.spiral ?? [], p.volute!.front, new Pt(0, nutLength)) : { flat: null, arcs: [], straight: null };

  return (g: any, ui: any): void => {
    renderPolygon(nut, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);
    neck.slice(1).forEach((pt, i) => renderSegment(neck[i], pt, colors.neckOff, STROKE_WEIGHT.section)(g, ui));
    if (flags.showModuleGuides) {
      for (const x of [0, -thickness]) renderDashLine(new Pt(x, 0), new Pt(x, top), colors.neck, STROKE_WEIGHT.guide)(g, ui);
    }

    if (!volute) return;
    const { spiral, guides } = volute;
    renderCircle({ x: eye.x, y: eye.y, r: eyeRadius }, colors.neckOff)(g, ui);
    if (flags.showVoluteConstruction && !whole) {
      for (const line of guides) {
        line.slice(1).forEach((pt, i) => renderSegment(line[i], pt, colors.neckOff, STROKE_WEIGHT.guide, true)(g, ui));
      }
    }
    const inward = [...spiral].reverse();
    const halo = (d: string, color: string) => renderPath(d, color, 12, 0.33)(g, ui);
    const haloArc = (a: VoluteArc | null | undefined, color: string) => a && halo(arcPathData(a.center, a.r, a.from, a.to), color);
    const haloLine = (line: [Pt, Pt] | null, color: string) => line && halo(`M ${line[0].x},${line[0].y} L ${line[1].x},${line[1].y}`, color);
    if (highlighted === 'straight') haloLine(back.straight, straightColor);
    else if (highlighted === 'nape') haloArc(back.nape, colors.neck);
    else if (highlighted === 'flat') haloLine(front.flat, frontColor(colors, 0));
    else if (highlighted === 'frontStraight') haloLine(front.straight, frontColor(colors, 0));
    else if (highlighted && 'back' in highlighted) haloArc(back.arcs[highlighted.back], backColor(colors, highlighted.back));
    else if (highlighted && 'front' in highlighted) haloArc(front.arcs[highlighted.front], frontColor(colors, highlighted.front));
    else if (highlighted && 'spiral' in highlighted && VOLUTE_STYLES[p.volute!.style].custom) haloArc(inward[highlighted.spiral], arcColor(colors, highlighted.spiral));

    if (napeFoot) renderSegment(napeFoot, new Pt(-thickness, 0), colors.neckOff, STROKE_WEIGHT.section)(g, ui);

    // module arcs: renderArcFromArcFancy's look, drawn here since a models/types Arc only takes the
    // minor arc and an arc of the spiral can sweep more than half a turn. Module arcs colours the
    // panel's own arcs, the spiral on the volute panel and the back and front on the scroll panel;
    // all arcs colours them all, as on the outline panels
    const fancy = (arcs: (VoluteArc & { color: string })[]) => {
      for (const { center, r, from, to, color } of arcs) {
        renderPath(arcPathData(center, r, from, to), color, 2)(g, ui);
        for (const t of [from, to]) renderDashLine(center, new Pt(center.x + r * Math.cos(t), center.y + r * Math.sin(t)), color)(g, ui);
        renderSmallCrosshair(center, color)(g, ui);
      }
    };
    const plain = (arcs: VoluteArc[]) => {
      for (const { center, r, from, to } of arcs) renderPath(arcPathData(center, r, from, to), colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    };

    if (flags.showAllArcs || (flags.showModuleArcs && !whole)) fancy(inward.map((a, i) => ({ ...a, color: arcColor(colors, i) })));
    else plain(inward);

    // a straight shares its colour with the arc whose row it's set on, the flat with F0, and the
    // square line the nape's
    if (flags.showAllArcs || flags.showModuleArcs) {
      fancy([
        ...back.arcs.map((a, i) => ({ ...a, color: backColor(colors, i) })),
        ...back.nape ? [{ ...back.nape, color: colors.neck }] : [],
        ...front.arcs.map((a, i) => ({ ...a, color: frontColor(colors, i) })),
      ]);
      if (back.straight) renderSegment(...back.straight, straightColor, 2)(g, ui);
      if (back.square) renderSegment(...back.square, colors.neck, 2)(g, ui);
      for (const line of [front.flat, front.straight]) if (line) renderSegment(...line, frontColor(colors, 0), 2)(g, ui);
    } else {
      plain([...back.arcs, ...back.nape ? [back.nape] : [], ...front.arcs]);
      for (const line of [back.straight, back.square, front.flat, front.straight]) if (line) renderSegment(...line, colors.outerTrace, STROKE_WEIGHT.trace)(g, ui);
    }
  };
}
