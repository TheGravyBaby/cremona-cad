import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { showFieldHelp } from '../../../../docs/field-help';
import {
  angleFromCenter, flipRectAboutY, lineCircleIntersection, lineFromPointAndSlope, offsetArcRadius, pointOnCircle, tangentUnitVectorFromLine,
} from '../../../../helpers/math/simpleGeometry';
import { filletRightAngleCorner, solveTangentCircleAndLine } from '../../../../helpers/math/draftMath';
import { combinePathStrings, pathFromCircle, pathFromRect, pathsBounds, translatePath } from '../../../../helpers/math/pathMath';
import { differenceFromManyPaths, intersectionFromTwoPaths, mirroredLoop } from '../../../../helpers/math/pathVibes';
import { renderPath, renderRect, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection } from '../../../../helpers/validators';
import { Arc, Circle, Line, Pt, Rectangle } from '../../../../models/types';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { MouldFailure, MouldKey, MouldSolve, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { channelPath } from '../fluting-panel/fluting-panel';
import { purflingPath, ribArcs } from '../outer-contour-panel/outer-contour-panel';

// The inside mould the ribs are bent round: the rib outline with the blocks cut out of it, and the
// clamp box's windows behind them. Panel and render, then the solve and the blocks' cutting layout.

@Component({
  selector: 'app-vf-mould-panel',
  imports: [FormsModule, MmInchField, NumberStepperDirective],
  templateUrl: './mould-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class MouldPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showBlocks', 'showRibOutline', 'showRibJoin'];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly help = showFieldHelp;

  // the blocks by size class, each corner block padded the same distance out and toward the waist.
  // The neck and end blocks are three times as wide as they are high, half again the Ceruti
  // recipe's, which left too little glue face for the ribs; a viol neck's block spans the neck's
  // root and 2 mm past it each side
  static seed(p: ViolinFamilyParams): void {
    if (p.mould || !p.corners) return;
    let size = familyStandards(p.body.height).blocks;
    let neckWidth = 3 * size.end;
    let V0 = p.bouts!.useViolNeck ? solveMainBouts(p)?.V0 : null;
    if (V0) neckWidth = 2 * Math.abs(pointOnCircle(V0, V0.start).x) + 4;
    p.mould = {
      neckBlock: { width: neckWidth, height: size.end },
      upperCornerBlock: { width: size.width, height: size.height, pad: { x: size.pad, y: -size.pad } },
      lowerCornerBlock: { width: size.width, height: size.height, pad: { x: size.pad, y: size.pad } },
      endBlock: { width: 3 * size.end, height: size.end },
      // Carbide's 1/4", the bit the moulds are cut with
      bitDiameter: 6.35,
      clampBox: true,
    };
  }

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  // what the last draw solved; report() reads it
  s!: MouldSolve;

  ngOnInit(): void {
    this.draw();
  }

  edited(): void {
    this.edit.emit();
    this.draw();
  }

  report(): void {
    reportFailures(this.s.failures, 'Mould');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let s = this.s = solveMould(p)!;
      // the fluting channel's corner joins struck on the rib line: the wood the blocks have to fill
      let rib = this.flags.showRibJoin ? ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!) : null;
      let join = rib ? channelPath(p, rib, p.body.overhang + p.body.rib, p.body.overhang + p.body.rib).path : null;
      this.drawn.emit([
        renderMould(s, this.pal, this.flags),
        ...(join ? [renderPath(join, this.pal.ink(2), STROKE_WEIGHT.guide)] : []),
        renderSolveFailures(s.failures, this.pal.alert),
      ]);
    });
  }
}

// used to be a user-facing param; in practice one depth suited every instrument, so it's fixed
const MOULD_CHANNEL_DEPTH = 4;
const MOULD_WALL = 1.1; // scales the thickness of the mould walls
// the export samples the outline ten times finer than the panel's preview
export const MOULD_EXPORT_STEP = 0.1;

const BLOCK_KEYS: MouldKey[] = ['neckBlock', 'upperCornerBlock', 'lowerCornerBlock', 'endBlock'];

// the mould and its clamp box in grey, the blocks each in their own ink, the rib outline under it all
// when asked for
export const renderMould = (s: MouldSolve, pal: PanelPalette, flags: ViolinFamilyViewFlags) => (g: any, ui: any): void => {
  if (flags.showRibOutline && s.ribOutline) renderPath(s.ribOutline, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  if (s.outline) renderPath(combinePathStrings([...s.clampBox, s.outline]), pal.neutral)(g, ui);
  if (flags.showBlocks && s.blocks) {
    let b = s.blocks;
    renderRect(b.neck, pal.ink(1))(g, ui);
    renderRect(b.upperCorner, pal.ink(4))(g, ui);
    renderRect(flipRectAboutY(b.upperCorner), pal.ink(4))(g, ui);
    renderRect(b.lowerCorner, pal.ink(2))(g, ui);
    renderRect(flipRectAboutY(b.lowerCorner), pal.ink(2))(g, ui);
    renderRect(b.end, pal.ink(0))(g, ui);
  }
};

// a later panel reads the mould by calling this; it returns and never writes to the params. `step`
// is how finely the outline is sampled where the blocks cut it
export function solveMould(p: ViolinFamilyParams, step = 1): MouldSolve | null {
  if (!p.mould || !p.corners || !p.bouts) return null;
  let s: MouldSolve = { blocks: null, ribOutline: null, outline: null, notchOutline: null, reliefs: [], clampBox: [], failures: [] };
  let fail = (message: string, unsolved: MouldKey[]): MouldFailure => ({ message, unsolved, circles: [], segments: [] });
  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  if (!rib) {
    s.failures.push(fail('Mould: every arc of the rib outline has to solve first.', [...BLOCK_KEYS, 'clampBox']));
    return s;
  }
  let ribOutline = s.ribOutline = purflingPath(p, rib, 0)!;
  let mo = p.mould;
  let k = p.corners;
  let inset = p.body.overhang + p.body.rib;

  solveSection(s.failures, 'Mould', BLOCK_KEYS, () => {
    let typed: [MouldKey, number[]][] = [
      ['neckBlock', [mo.neckBlock.width, mo.neckBlock.height]],
      ['upperCornerBlock', [mo.upperCornerBlock.width, mo.upperCornerBlock.height, mo.upperCornerBlock.pad.x, mo.upperCornerBlock.pad.y]],
      ['lowerCornerBlock', [mo.lowerCornerBlock.width, mo.lowerCornerBlock.height, mo.lowerCornerBlock.pad.x, mo.lowerCornerBlock.pad.y]],
      ['endBlock', [mo.endBlock.width, mo.endBlock.height]],
    ];
    for (let [key, values] of typed) {
      if (!values.every(Number.isFinite)) return fail('Mould: every block field needs a value.', [key]);
      if (!(values[0] > 0 && values[1] > 0)) return fail('Mould: every block needs a width and a height above 0.', [key]);
    }
    if (!(mo.bitDiameter >= 0)) return fail('Mould: the bit diameter needs a value, 0 or more.', BLOCK_KEYS);

    // a viol neck's block hangs from the neck's join rather than the outline's end
    let top = p.bouts!.useViolNeck ? pointOnCircle(rib.V0!, rib.V0!.start).y : p.body.height - inset;
    let uc = mo.upperCornerBlock;
    let lc = mo.lowerCornerBlock;
    let b = s.blocks = {
      neck: new Rectangle(new Pt(-mo.neckBlock.width / 2, top - mo.neckBlock.height), new Pt(mo.neckBlock.width / 2, top)),
      upperCorner: new Rectangle(new Pt(k.UCr.x + uc.pad.x, k.UCr.y + uc.pad.y), new Pt(k.UCr.x + uc.pad.x - uc.width, k.UCr.y + uc.pad.y + uc.height)),
      lowerCorner: new Rectangle(new Pt(k.LCr.x + lc.pad.x, k.LCr.y + lc.pad.y), new Pt(k.LCr.x + lc.pad.x - lc.width, k.LCr.y + lc.pad.y - lc.height)),
      end: new Rectangle(new Pt(-mo.endBlock.width / 2, inset), new Pt(mo.endBlock.width / 2, inset + mo.endBlock.height)),
    };

    let blocks: Rectangle[] = [b.neck, b.upperCorner, flipRectAboutY(b.upperCorner), b.lowerCorner, flipRectAboutY(b.lowerCorner), b.end];
    const tolerance = 0.5;
    const bitRadius = mo.bitDiameter / 2 + tolerance;
    const bitOffset = (bitRadius * Math.SQRT1_2) - tolerance;
    // each notch's two inner corners, with the way into the notch along the corner's diagonal; a
    // circle set a little in from each keeps the bit from having to make an internal right angle
    let corners: [Pt, number, number][] = [
      [new Pt(blocks[0].Pt1.x, blocks[0].Pt1.y), 1, 1], [new Pt(blocks[0].Pt2.x, blocks[0].Pt1.y), -1, 1],
      [new Pt(blocks[1].Pt2.x, blocks[1].Pt2.y), 1, -1], [new Pt(blocks[2].Pt2.x, blocks[2].Pt2.y), -1, -1],
      [new Pt(blocks[3].Pt2.x, blocks[3].Pt2.y), 1, 1], [new Pt(blocks[4].Pt2.x, blocks[4].Pt2.y), -1, 1],
      [new Pt(blocks[5].Pt1.x, blocks[5].Pt2.y), 1, -1], [new Pt(blocks[5].Pt2.x, blocks[5].Pt2.y), -1, -1],
    ];
    let circleCutouts: string[] = [];
    if (mo.bitDiameter > 0) {
      s.reliefs = corners.map(([corner, sx, sy]) => ({ corner, inward: new Pt(sx * Math.SQRT1_2, sy * Math.SQRT1_2), reach: bitRadius - bitOffset * Math.SQRT2 }));
      circleCutouts = corners.map(([corner, sx, sy]) => pathFromCircle({ x: corner.x + sx * bitOffset, y: corner.y + sy * bitOffset, r: bitRadius }));
    }
    let notches = blocks.map(block => pathFromRect(block));
    s.notchOutline = differenceFromManyPaths(ribOutline, notches, step);
    s.outline = circleCutouts.length ? differenceFromManyPaths(ribOutline, [...notches, ...circleCutouts], step) : s.notchOutline;
    return null;
  });

  if (mo.clampBox && s.blocks) solveSection(s.failures, 'Clamp box', ['clampBox'], () => {
    let b = s.blocks!;
    if (!rib.U2 || !rib.L2) return fail('Clamp box: the bouts have to turn into their corners for the windows to follow them.', ['clampBox']);
    let clampOffset = MOULD_WALL * (Math.max(mo.neckBlock.height, mo.endBlock.height) + MOULD_CHANNEL_DEPTH);
    if (p.bouts!.useViolNeck)
      clampOffset = MOULD_WALL * (mo.endBlock.height + MOULD_CHANNEL_DEPTH);

    if ([rib.U1, rib.U2, rib.L1, rib.L2].some(arc => arc.r <= clampOffset))
      return fail("Clamp box: the walls are thicker than the bouts are round, so no window can follow them, and it's left uncut.", []);

    // three closed windows rather than free chords: flanks ride the inset bout arcs, and
    // the horizontal faces sit a fixed web back from every block face, so blocks always
    // keep solid material behind them and the beams between windows contain the corner
    // blocks. every line-arc junction is filleted, so the frame has no sharp corners.
    const web = clampOffset / 2;
    const rf = web; // fillet radius — comfortably above any sane bit radius

    const rectYMin = (r: Rectangle) => Math.min(r.Pt1.y, r.Pt2.y);
    const rectYMax = (r: Rectangle) => Math.max(r.Pt1.y, r.Pt2.y);

    // wraps solveTangentCircleAndLine with the extra points this mould construction needs —
    // where the fillet touches the wall and where it touches Q — that a bare circle doesn't carry
    const fillet = (t: Line, Q: Circle, Pr: number, diff: boolean, side: 1 | -1, near: Pt) => {
      const center = solveTangentCircleAndLine(t, Q, Pr, diff, side, near);
      if (!center) return null;
      const normal = tangentUnitVectorFromLine(t);
      const lineTangent = new Pt(center.x - side * Pr * normal.a, center.y - side * Pr * normal.b);
      const circleAngle = angleFromCenter(Q, center);
      return { center, lineTangent, circleTangent: pointOnCircle(Q, circleAngle), circleAngle };
    };

    // builds the small fillet's own Arc from a fillet() result
    const filletArc = (f: { center: Pt; lineTangent: Pt; circleTangent: Pt }, radius: number) =>
      new Arc(f.center.x, f.center.y, radius, angleFromCenter(f.center, f.lineTangent), angleFromCenter(f.center, f.circleTangent));

    let uncut: string[] = [];

    // upper window: faces held web under the top block and web over the corner blocks,
    // clamped to where the inset flank arcs themselves stop
    const U1c = offsetArcRadius(rib.U1, -clampOffset);
    const U2c = offsetArcRadius(rib.U2, -clampOffset);
    const uTopY = Math.min(rectYMin(b.neck) - web, pointOnCircle(U1c, U1c.start).y);
    const uBotY = Math.max(rectYMax(b.upperCorner) + web, pointOnCircle(U2c, U2c.end).y);
    const uTop = fillet({ m: 0, y: uTopY, x: 0 }, U1c, rf, true, 1, pointOnCircle(U1c, U1c.start));
    const uBot = fillet({ m: 0, y: uBotY, x: 0 }, U2c, rf, true, -1, pointOnCircle(U2c, U2c.end));
    // the >rf checks mirror the old collision guard: a fillet whose tangent lands too close
    // to the centerline would cross its own mirror image
    if (uTop && uBot && uTop.lineTangent.x > rf && uBot.lineTangent.x > rf && uTopY - uBotY >= 2 * rf) {
      s.clampBox.push(mirroredLoop(
        [filletArc(uTop, rf),
         new Arc(U1c.x, U1c.y, U1c.r, uTop.circleAngle, U1c.end),
         new Arc(U2c.x, U2c.y, U2c.r, U2c.start, uBot.circleAngle),
         filletArc(uBot, rf)],
        [[new Pt(-uTop.lineTangent.x, uTopY), new Pt(uTop.lineTangent.x, uTopY)],
         [new Pt(-uBot.lineTangent.x, uBotY), new Pt(uBot.lineTangent.x, uBotY)]]));
    }
    else uncut.push('upper');

    // center window: a flat face flush with each corner block's outer edge, walled off from the
    // C0 waist arc by a vertical run at the block's own x. That flat face is what a caul clamps
    // against to press the corner block home, so its position and span aren't touched; only the
    // two sharp corners on each side (arc-into-wall, wall-into-face) are eased, and only as far
    // as their own leg lengths allow.
    const C0Clamp = offsetArcRadius(rib.C0, clampOffset);
    const C0UpPt = lineCircleIntersection(lineFromPointAndSlope(b.upperCorner.Pt1, 0), C0Clamp).sort((a, c) => a.x - c.x)[0];
    const C0LowPt = lineCircleIntersection(lineFromPointAndSlope(b.lowerCorner.Pt1, 0), C0Clamp).sort((a, c) => a.x - c.x)[0];
    if (C0UpPt && C0LowPt) {
      const cTopY = C0UpPt.y + mo.upperCornerBlock.height;
      const cBotY = C0LowPt.y - mo.lowerCornerBlock.height;
      const cTopR = Math.min(rf, mo.upperCornerBlock.height / 3, C0UpPt.x / 3);
      const cBotR = Math.min(rf, mo.lowerCornerBlock.height / 3, C0LowPt.x / 3);

      // C0's waist curves opposite U1/U2/L1/L2 (concave toward the centerline, not away from
      // it), so this wall-to-arc fillet grows past C0Clamp's radius rather than nesting inside
      // it — same call as the flank windows above, with internal tangency flipped off.
      const cTopArc = fillet({ m: Infinity, y: NaN, x: C0UpPt.x }, C0Clamp, cTopR, false, -1, C0UpPt);
      const cBotArc = fillet({ m: Infinity, y: NaN, x: C0LowPt.x }, C0Clamp, cBotR, false, -1, C0LowPt);
      const cTopFace = filletRightAngleCorner(new Pt(C0UpPt.x, cTopY), new Pt(-1, -1), cTopR);
      const cBotFace = filletRightAngleCorner(new Pt(C0LowPt.x, cBotY), new Pt(-1, 1), cBotR);
      if (cTopArc && cTopFace && cBotArc && cBotFace) {
        const chain: (Arc | [Pt, Pt])[] = [
          cBotFace,
          [new Pt(C0LowPt.x, cBotFace.y), new Pt(C0LowPt.x, cBotArc.lineTangent.y)],
          filletArc(cBotArc, cBotR),
          new Arc(C0Clamp.x, C0Clamp.y, C0Clamp.r, cBotArc.circleAngle, cTopArc.circleAngle),
          filletArc(cTopArc, cTopR),
          [new Pt(C0UpPt.x, cTopArc.lineTangent.y), new Pt(C0UpPt.x, cTopFace.y)],
          cTopFace,
        ];
        s.clampBox.push(mirroredLoop(chain, [
          [new Pt(cTopFace.x, cTopY), new Pt(-cTopFace.x, cTopY)],
          [new Pt(cBotFace.x, cBotY), new Pt(-cBotFace.x, cBotY)],
        ]));
      }
      else uncut.push('center');
    }
    else uncut.push('center');

    // lower window: mirror of the upper — web over the bottom block, web under the corner blocks
    const L1c = offsetArcRadius(rib.L1, -clampOffset);
    const L2c = offsetArcRadius(rib.L2, -clampOffset);
    const lTopY = Math.min(rectYMin(b.lowerCorner) - web, pointOnCircle(L2c, L2c.end).y);
    const lBotY = Math.max(rectYMax(b.end) + web, pointOnCircle(L1c, L1c.start).y);
    const lTop = fillet({ m: 0, y: lTopY, x: 0 }, L2c, rf, true, 1, pointOnCircle(L2c, L2c.end));
    const lBot = fillet({ m: 0, y: lBotY, x: 0 }, L1c, rf, true, -1, pointOnCircle(L1c, L1c.start));
    if (lTop && lBot && lTop.lineTangent.x > rf && lBot.lineTangent.x > rf && lTopY - lBotY >= 2 * rf) {
      s.clampBox.push(mirroredLoop(
        [filletArc(lTop, rf),
         new Arc(L2c.x, L2c.y, L2c.r, L2c.start, lTop.circleAngle),
         new Arc(L1c.x, L1c.y, L1c.r, lBot.circleAngle, L1c.end),
         filletArc(lBot, rf)],
        [[new Pt(-lTop.lineTangent.x, lTopY), new Pt(lTop.lineTangent.x, lTopY)],
         [new Pt(-lBot.lineTangent.x, lBotY), new Pt(lBot.lineTangent.x, lBotY)]]));
    }
    else uncut.push('lower');

    if (!uncut.length) return null;
    return fail(`Clamp box: the ${uncut.join(' and ')} ${uncut.length > 1 ? 'windows have' : 'window has'} no room between the blocks and the walls, and ${uncut.length > 1 ? 'are' : 'is'} left uncut.`, []);
  });

  return s;
}

export type LabelledBlock = { path: string; label: 'U' | 'L'; x: number; y: number };

// the six blocks as the outline cuts them, laid out to cut from one board: the end block at the
// bottom, then the lower corner pair, the upper pair, the neck block on top, each row centred
export function blockLayout(s: MouldSolve, padding = 5): LabelledBlock[] {
  let b = s.blocks!;
  let ribOutline = s.ribOutline!;
  // Expand a rect by 1mm on the face that may be flush with the inner path boundary,
  // so polygon-clipping has a clean crossing rather than a tangent touch point.
  const expandedTop = (r: Rectangle) => new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y)), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y) + 1));
  const expandedBottom = (r: Rectangle) => new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y) - 1), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y)));

  const cuRect = b.upperCorner;
  const cuMirror = flipRectAboutY(b.upperCorner);
  const clRect = b.lowerCorner;
  const clMirror = flipRectAboutY(b.lowerCorner);

  const cuClipped = intersectionFromTwoPaths(pathFromRect(expandedTop(cuRect)), ribOutline);
  const cuMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandedTop(cuMirror)), ribOutline);
  const clClipped = intersectionFromTwoPaths(pathFromRect(expandedBottom(clRect)), ribOutline);
  const clMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandedBottom(clMirror)), ribOutline);
  const uClipped = intersectionFromTwoPaths(pathFromRect(expandedTop(b.neck)), ribOutline);
  const lClipped = intersectionFromTwoPaths(pathFromRect(expandedBottom(b.end)), ribOutline);

  const rectMinX = (r: Rectangle) => Math.min(r.Pt1.x, r.Pt2.x);
  const rectMinY = (r: Rectangle) => Math.min(r.Pt1.y, r.Pt2.y);
  const rowWidth = (items: Array<{ rect: Rectangle }>) =>
    items.reduce((sum, { rect }) => sum + rect.width!, 0) + padding * (items.length - 1);

  // a row of items horizontally centered on x=0 at the given yOffset
  const layoutRow = (items: Array<{ rect: Rectangle; path: string }>, yOffset: number, label: 'U' | 'L'): LabelledBlock[] => {
    let xCursor = -rowWidth(items) / 2;
    return items.map(({ rect, path }) => {
      const dx = xCursor - rectMinX(rect);
      const dy = yOffset - rectMinY(rect);
      const translated = translatePath(path, dx, dy);
      xCursor += rect.width! + padding;
      const bounds = pathsBounds([translated]);
      return { path: translated, label, x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    });
  };

  const rowUpper = [{ rect: b.neck, path: uClipped }];
  const rowUpperCorners = [
    { rect: cuMirror, path: cuMirrorClipped },
    { rect: cuRect, path: cuClipped },
  ];
  const rowLowerCorners = [
    { rect: clMirror, path: clMirrorClipped },
    { rect: clRect, path: clClipped },
  ];
  const rowLower = [{ rect: b.end, path: lClipped }];

  // stack rows top-to-bottom, advancing by each row's tallest piece
  const rowHeight = (items: Array<{ rect: Rectangle }>) => Math.max(...items.map(({ rect }) => rect.height!));

  let yCursor = 0;
  const r3 = layoutRow(rowLower, yCursor, 'L'); yCursor += rowHeight(rowLower) + padding;
  const r2 = layoutRow(rowLowerCorners, yCursor, 'L'); yCursor += rowHeight(rowLowerCorners) + padding;
  const r1 = layoutRow(rowUpperCorners, yCursor, 'U'); yCursor += rowHeight(rowUpperCorners) + padding;
  const r0 = layoutRow(rowUpper, yCursor, 'U');

  return [...r0, ...r1, ...r2, ...r3];
}
