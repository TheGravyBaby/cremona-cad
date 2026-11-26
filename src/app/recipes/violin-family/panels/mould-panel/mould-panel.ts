import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  angleFromCenter, flipRectAboutY, lineCircleIntersection, lineFromPointAndSlope, offsetArcRadius, pointInPolygon, pointOnCircle, lineNormal, stepAlong,
} from '../../../../helpers/math/simpleGeometry';
import { circleCircleIntersections, filletRightAngleCorner, solveTangentCircleAndLine } from '../../../../helpers/math/draftMath';
import { combinePathStrings, pathFromCircle, pathFromRect, pathFromSlot, pathsBounds, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed, PolylineIndex, rayPolylineIntersection } from '../../../../helpers/math/vibeMath';
import { differenceFromManyPaths, intersectionFromTwoPaths, mirroredLoop } from '../../../../helpers/math/pathVibes';
import { renderPath, renderRect, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { Arc, arcFromCircleAndPoints, Circle, Line, Pt, Rectangle } from '../../../../models/types';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { MouldKey, MouldSolve } from '../../violin-family-solves';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners, solvedRibArcs } from '../corners-panel/corners-panel';
import { defineChannelPath } from '../fluting-panel/fluting-panel';
import { definePurflingPath } from '../plate-contour-panel/plate-contour-panel';

// The inside mould the ribs are bent round: the rib outline with the blocks cut out of it, and the
// clamp box's windows behind them. Panel and render, then the solve and the blocks' cutting layout.

@Component({
  selector: 'app-vf-mould-panel',
  imports: [FormsModule, MmInchField, NumberStepperDirective],
  templateUrl: './mould-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class MouldPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showBlocks', 'showRibOutline', 'showRibJoin'];
  protected readonly pal = ThemeService.getPalette('classicCremona');

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
      clampBox: 'windows',
      // a wall a little more than the end blocks and the channel behind them
      windowInset: MOULD_WALL * (size.end + MOULD_CHANNEL_DEPTH),
      alignmentHoles: false,
    };
  }

  // what the last draw solved; reportSolveFailures() reads it
  s!: MouldSolve;

  reportSolveFailures(): void {
    reportFailures(this.s.failures, 'Mould');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let s = this.s = solveMould(p)!;
    // the fluting channel's corner joins struck on the rib line: the wood the blocks have to fill
    let rib = this.flags.showRibJoin ? solvedRibArcs(p) : null;
    let join = rib ? defineChannelPath(p, rib, p.body.overhang + p.body.rib, p.body.overhang + p.body.rib).path : null;
    return [
      renderMould(s, this.pal, this.flags),
      ...(join ? [renderPath(join, this.pal.ink(2), STROKE_WEIGHT.guide)] : []),
      renderSolveFailures(s.failures, this.pal.alert),
    ];
  }
}

// used to be a user-facing param; in practice one depth suited every instrument, so it's fixed
const MOULD_CHANNEL_DEPTH = 4;
const MOULD_WALL = 1.1;
// the export samples the outline ten times finer than the panel's preview
export const MOULD_EXPORT_STEP = 0.1;

const BLOCK_KEYS: MouldKey[] = ['neckBlock', 'upperCornerBlock', 'lowerCornerBlock', 'endBlock'];

// the mould and its clamp box in grey, the blocks each in their own ink, the rib outline under it all
// when asked for
export const renderMould = (s: MouldSolve, pal: PanelPalette, flags: ViolinFamilyViewFlags) => (g: any, ui: any): void => {
  if (flags.showRibOutline && s.ribOutline) renderPath(s.ribOutline, pal.neutral, STROKE_WEIGHT.guide)(g, ui);
  if (s.outline) renderPath(combinePathStrings([...s.clampBox, ...s.alignmentHoles.map(pathFromCircle), s.outline]), pal.neutral)(g, ui);
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

function calcRectMinX(r: Rectangle): number {
  return Math.min(r.Pt1.x, r.Pt2.x);
}

function calcRectMinY(r: Rectangle): number {
  return Math.min(r.Pt1.y, r.Pt2.y);
}

function calcRectMaxY(r: Rectangle): number {
  return Math.max(r.Pt1.y, r.Pt2.y);
}

// wraps solveTangentCircleAndLine with the extra points this mould construction needs —
// where the fillet touches the wall and where it touches Q — that a bare circle doesn't carry
function calcClampFillet(t: Line, Q: Circle, Pr: number, diff: boolean, side: 1 | -1, near: Pt) {
  const center = solveTangentCircleAndLine(t, Q, Pr, diff, side, near);
  if (!center) return null;
  const normal = lineNormal(t);
  const lineTangent = stepAlong(center, normal, -side * Pr);
  const circleAngle = angleFromCenter(Q, center);
  return { center, lineTangent, circleTangent: pointOnCircle(Q, circleAngle), circleAngle };
}

// a bump's shoulder, from the end of its flat `top` to the bout's inset arc Q: an S of two arcs of
// radius r, the first centred `away` (+1 up, -1 down) from the top. While the window's face is
// still flat where the S comes down it lands level on the face, and the face runs on into its
// fillet; past that it lands tangent on Q itself. Null when neither landing is there to take
function solveBumpShoulder(top: Pt, away: 1 | -1, faceY: number, fillet: NonNullable<ReturnType<typeof calcClampFillet>>, Q: Arc, r: number): (Arc | [Pt, Pt])[] | null {
  let c1 = new Circle(top.x, top.y + away * r, r);
  let rise = Math.abs(top.y - faceY);
  let footX = top.x + 2 * r * Math.sqrt(1 - (1 - rise / (2 * r)) ** 2);
  if (rise <= 2 * r && footX <= fillet.lineTangent.x) {
    let c2 = new Circle(footX, faceY - away * r, r);
    let join = new Pt((c1.x + c2.x) / 2, (c1.y + c2.y) / 2);
    let foot = new Pt(footX, faceY);
    return [arcFromCircleAndPoints(c1, top, join), arcFromCircleAndPoints(c2, join, foot), [foot, fillet.lineTangent],
      arcFromCircleAndPoints({ ...fillet.center, r }, fillet.lineTangent, fillet.circleTangent), new Arc(Q.x, Q.y, Q.r, fillet.circleAngle, Q.end)];
  }
  if (Q.r <= r) return null;
  let centre = circleCircleIntersections(new Circle(c1.x, c1.y, 2 * r), new Circle(Q.x, Q.y, Q.r - r)).sort((a, b) => b.x - a.x)[0];
  if (!centre || centre.x <= top.x) return null;
  let join = new Pt((c1.x + centre.x) / 2, (c1.y + centre.y) / 2);
  let landing = angleFromCenter(Q, centre);
  let foot = pointOnCircle(Q, landing);
  let end = pointOnCircle(Q, Q.end);
  if (foot.x < fillet.circleTangent.x - 1e-6 || (foot.y - fillet.circleTangent.y) * (end.y - foot.y) < 0) return null;
  return [arcFromCircleAndPoints(c1, top, join), arcFromCircleAndPoints(new Circle(centre.x, centre.y, r), join, foot), new Arc(Q.x, Q.y, Q.r, landing, Q.end)];
}

// a clamp hole of radius r at `centre` is in the mould with half its radius of wood to the cut edge
function isClampHoleClear(centre: Pt, r: number, edge: Pt[], edgeIndex: PolylineIndex): boolean {
  return pointInPolygon(centre, edge) && distPointToPolylineIndexed(centre, edgeIndex) >= 1.5 * r;
}

// a later panel reads the mould by calling this; it returns and never writes to the params. `step`
// is how finely the outline is sampled where the blocks cut it
export function solveMould(p: ViolinFamilyParams, step = 1): MouldSolve | null {
  if (!p.mould || !p.corners || !p.bouts) return null;
  let s: MouldSolve = { blocks: null, ribOutline: null, outline: null, notchOutline: null, reliefs: [], clampBox: [], alignmentHoles: [], failures: [] };
  let rib = solvedRibArcs(p);
  if (!rib) {
    s.failures.push(buildMiss('Mould: the rib outline doesn\'t close yet. Fix the bouts and corners first.', [...BLOCK_KEYS, 'clampBox']));
    return s;
  }
  let ribOutline = s.ribOutline = definePurflingPath(p, rib, 0)!;
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
      if (!values.every(Number.isFinite)) return buildMiss('Mould: every block field needs a value.', [key]);
      if (!(values[0] > 0 && values[1] > 0)) return buildMiss('Mould: every block needs a width and a height above 0.', [key]);
    }
    if (!(mo.bitDiameter >= 0)) return buildMiss('Mould: the bit diameter needs a value, 0 or more.', BLOCK_KEYS);

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

  // where the cutout behind the neck block and the one behind the end block begin; NaN until cut
  let neckWallY = NaN;
  let endWallY = NaN;

  // the hole pattern, each cutout sized from its own block. A corner hole spans the block's inside
  // face, from the block's end in the mould to where the rib line cuts the face off, so it never
  // reaches past the block along the body; it stands its own diameter in from that face. Behind the
  // neck and end blocks a slot the block's height, its straight the block's width, that
  // same height off the block
  if (mo.clampBox === 'holes' && s.blocks && s.notchOutline) solveSection(s.failures, 'Clamp box', ['clampBox'], () => {
    let b = s.blocks!;
    let edge = samplePathToPolyline(s.notchOutline!, 1, true);
    let edgeIndex = buildPolylineIndex(edge);
    let ribs = samplePathToPolyline(ribOutline, 1, true);
    let uncut: string[] = [];

    // the slots stop their own height short of the corner blocks, so a beam is left across the mould
    let neckR = mo.neckBlock.height / 2;
    let neckY = calcRectMinY(b.neck) - 3 * neckR;
    let neckEnd = new Pt(mo.neckBlock.width / 2, neckY);
    if (neckY - neckR >= calcRectMaxY(b.upperCorner) + 2 * neckR && isClampHoleClear(neckEnd, neckR, edge, edgeIndex)) {
      s.clampBox.push(pathFromSlot(new Pt(-neckEnd.x, neckY), neckEnd, neckR));
      neckWallY = neckY + neckR;
    }
    else uncut.push('neck slot');

    // twin holes keep a diameter of wood between them across the centre line
    let upperX = calcRectMinX(b.upperCorner);
    let upperTop = calcRectMaxY(b.upperCorner);
    let upperCut = rayPolylineIntersection(new Pt(upperX, upperTop), -Math.PI / 2, ribs);
    let upperBottom = Math.max(upperCut ? upperCut.point.y : -Infinity, calcRectMinY(b.upperCorner));
    let upperR = (upperTop - upperBottom) / 2;
    let upper = new Circle(upperX - 3 * upperR, upperBottom + upperR, upperR);
    if (upperR > 0 && upper.x >= 2 * upperR && isClampHoleClear(upper, upperR, edge, edgeIndex)) s.clampBox.push(pathFromCircle(upper), pathFromCircle(new Circle(-upper.x, upper.y, upperR)));
    else uncut.push('upper corner holes');

    let lowerX = calcRectMinX(b.lowerCorner);
    let lowerBottom = calcRectMinY(b.lowerCorner);
    let lowerCut = rayPolylineIntersection(new Pt(lowerX, lowerBottom), Math.PI / 2, ribs);
    let lowerTop = Math.min(lowerCut ? lowerCut.point.y : Infinity, calcRectMaxY(b.lowerCorner));
    let lowerR = (lowerTop - lowerBottom) / 2;
    let lower = new Circle(lowerX - 3 * lowerR, lowerBottom + lowerR, lowerR);
    if (lowerR > 0 && lower.x >= 2 * lowerR && isClampHoleClear(lower, lowerR, edge, edgeIndex)) s.clampBox.push(pathFromCircle(lower), pathFromCircle(new Circle(-lower.x, lower.y, lowerR)));
    else uncut.push('lower corner holes');

    let endR = mo.endBlock.height / 2;
    let endY = calcRectMaxY(b.end) + 3 * endR;
    let endEnd = new Pt(mo.endBlock.width / 2, endY);
    if (endY + endR <= calcRectMinY(b.lowerCorner) - 2 * endR && isClampHoleClear(endEnd, endR, edge, edgeIndex)) {
      s.clampBox.push(pathFromSlot(new Pt(-endEnd.x, endY), endEnd, endR));
      endWallY = endY - endR;
    }
    else uncut.push('end slot');

    if (!uncut.length) return null;
    return buildMiss(`Clamp box: the mould has no room for the ${uncut.join(' or the ')}, left uncut.`, []);
  });

  if (mo.clampBox === 'windows' && s.blocks) solveSection(s.failures, 'Clamp box', ['clampBox'], () => {
    let b = s.blocks!;
    if (!rib.U2 || !rib.L2) return buildMiss('Clamp box: the bouts have to turn into their corners for the windows to follow them.', ['clampBox']);
    let clampOffset = mo.windowInset;
    if (!(clampOffset > 0)) return buildMiss('Clamp box: the window inset needs a value above 0.', ['clampBox']);
    if ([rib.U1, rib.U2, rib.L1, rib.L2].some(arc => arc.r <= clampOffset))
      return buildMiss("Clamp box: the walls are thicker than the bouts are round, so no window can follow them, and it's left uncut.", []);

    // three closed windows rather than free chords: flanks ride the inset bout arcs, and
    // the horizontal faces sit a fixed web back from every block face, so blocks always
    // keep solid material behind them and the beams between windows contain the corner
    // blocks. every line-arc junction is filleted, so the frame has no sharp corners.
    const web = clampOffset / 2;
    const rf = web; // fillet radius — comfortably above any sane bit radius

    let uncut: string[] = [];

    // upper window: faces held web under the top block and web over the corner blocks,
    // clamped to where the inset flank arcs themselves stop
    const U1c = offsetArcRadius(rib.U1, -clampOffset);
    const U2c = offsetArcRadius(rib.U2, -clampOffset);
    const uTopY = Math.min(calcRectMinY(b.neck) - web, pointOnCircle(U1c, U1c.start).y);
    const uBotY = Math.max(calcRectMaxY(b.upperCorner) + web, pointOnCircle(U2c, U2c.end).y);
    const uTop = calcClampFillet({ m: 0, y: uTopY, x: 0 }, U1c, rf, true, 1, pointOnCircle(U1c, U1c.start));
    const uBot = calcClampFillet({ m: 0, y: uBotY, x: 0 }, U2c, rf, true, -1, pointOnCircle(U2c, U2c.end));
    // the >rf checks mirror the old collision guard: a fillet whose tangent lands too close
    // to the centerline would cross its own mirror image
    if (uTop && uBot && uTop.lineTangent.x > rf && uBot.lineTangent.x > rf && uTopY - uBotY >= 2 * rf) {
      // the web alone leaves the frame skinny behind the block, right where the clamp bears, so a
      // bump stands into the window there: the full inset of wood across the block's width, each
      // end falling away in an S. Left out where it would close the window or has nowhere to land
      let neckBumpY = calcRectMinY(b.neck) - clampOffset;
      let neckHalf = mo.neckBlock.width / 2;
      let neckShoulder = neckBumpY < uTopY && neckBumpY - uBotY >= 2 * rf ? solveBumpShoulder(new Pt(neckHalf, neckBumpY), 1, uTopY, uTop, U1c, rf) : null;
      let upperTop: (Arc | [Pt, Pt])[] = [arcFromCircleAndPoints({ ...uTop.center, r: rf }, uTop.lineTangent, uTop.circleTangent), new Arc(U1c.x, U1c.y, U1c.r, uTop.circleAngle, U1c.end)];
      let upperFace: [Pt, Pt] = [new Pt(-uTop.lineTangent.x, uTopY), new Pt(uTop.lineTangent.x, uTopY)];
      neckWallY = uTopY;
      if (neckShoulder) {
        upperTop = neckShoulder;
        upperFace = [new Pt(-neckHalf, neckBumpY), new Pt(neckHalf, neckBumpY)];
        neckWallY = neckBumpY;
      }
      s.clampBox.push(mirroredLoop(
        [...upperTop,
         new Arc(U2c.x, U2c.y, U2c.r, U2c.start, uBot.circleAngle),
         arcFromCircleAndPoints({ ...uBot.center, r: rf }, uBot.lineTangent, uBot.circleTangent)],
        [upperFace, [new Pt(-uBot.lineTangent.x, uBotY), new Pt(uBot.lineTangent.x, uBotY)]]));
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
      const cTopArc = calcClampFillet({ m: Infinity, y: NaN, x: C0UpPt.x }, C0Clamp, cTopR, false, -1, C0UpPt);
      const cBotArc = calcClampFillet({ m: Infinity, y: NaN, x: C0LowPt.x }, C0Clamp, cBotR, false, -1, C0LowPt);
      const cTopFace = filletRightAngleCorner(new Pt(C0UpPt.x, cTopY), new Pt(-1, -1), cTopR);
      const cBotFace = filletRightAngleCorner(new Pt(C0LowPt.x, cBotY), new Pt(-1, 1), cBotR);
      if (cTopArc && cTopFace && cBotArc && cBotFace) {
        const chain: (Arc | [Pt, Pt])[] = [
          cBotFace,
          [new Pt(C0LowPt.x, cBotFace.y), new Pt(C0LowPt.x, cBotArc.lineTangent.y)],
          arcFromCircleAndPoints({ ...cBotArc.center, r: cBotR }, cBotArc.lineTangent, cBotArc.circleTangent),
          new Arc(C0Clamp.x, C0Clamp.y, C0Clamp.r, cBotArc.circleAngle, cTopArc.circleAngle),
          arcFromCircleAndPoints({ ...cTopArc.center, r: cTopR }, cTopArc.lineTangent, cTopArc.circleTangent),
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
    const lTopY = Math.min(calcRectMinY(b.lowerCorner) - web, pointOnCircle(L2c, L2c.end).y);
    const lBotY = Math.max(calcRectMaxY(b.end) + web, pointOnCircle(L1c, L1c.start).y);
    const lTop = calcClampFillet({ m: 0, y: lTopY, x: 0 }, L2c, rf, true, 1, pointOnCircle(L2c, L2c.end));
    const lBot = calcClampFillet({ m: 0, y: lBotY, x: 0 }, L1c, rf, true, -1, pointOnCircle(L1c, L1c.start));
    if (lTop && lBot && lTop.lineTangent.x > rf && lBot.lineTangent.x > rf && lTopY - lBotY >= 2 * rf) {
      let endBumpY = calcRectMaxY(b.end) + clampOffset;
      let endHalf = mo.endBlock.width / 2;
      let endShoulder = endBumpY > lBotY && lTopY - endBumpY >= 2 * rf ? solveBumpShoulder(new Pt(endHalf, endBumpY), -1, lBotY, lBot, L1c, rf) : null;
      let lowerBottom: (Arc | [Pt, Pt])[] = [new Arc(L1c.x, L1c.y, L1c.r, lBot.circleAngle, L1c.end), arcFromCircleAndPoints({ ...lBot.center, r: rf }, lBot.lineTangent, lBot.circleTangent)];
      let lowerFace: [Pt, Pt] = [new Pt(-lBot.lineTangent.x, lBotY), new Pt(lBot.lineTangent.x, lBotY)];
      endWallY = lBotY;
      if (endShoulder) {
        lowerBottom = endShoulder;
        lowerFace = [new Pt(-endHalf, endBumpY), new Pt(endHalf, endBumpY)];
        endWallY = endBumpY;
      }
      s.clampBox.push(mirroredLoop(
        [arcFromCircleAndPoints({ ...lTop.center, r: rf }, lTop.lineTangent, lTop.circleTangent),
         new Arc(L2c.x, L2c.y, L2c.r, L2c.start, lTop.circleAngle),
         ...lowerBottom],
        [[new Pt(-lTop.lineTangent.x, lTopY), new Pt(lTop.lineTangent.x, lTopY)], lowerFace]));
    }
    else uncut.push('lower');

    if (!uncut.length) return null;
    return buildMiss(`Clamp box: the ${uncut.join(' and ')} ${uncut.length > 1 ? 'windows have' : 'window has'} no room between the blocks and the walls, and ${uncut.length > 1 ? 'are' : 'is'} left uncut.`, []);
  });

  // each hole half its block's height behind the neck or the end block: midway through
  // the wall the hole pattern's slot leaves there, and well inside the window's bump, so it stays
  // put whichever is cut. It keeps half a bit of wood to the block and to the cutout behind it
  if (mo.alignmentHoles && s.blocks) solveSection(s.failures, 'Alignment holes', ['alignmentHoles'], () => {
    let b = s.blocks!;
    if (!(mo.bitDiameter > 0)) return buildMiss('Alignment holes: the bit plunges them, so the bit diameter has to be above 0.', ['alignmentHoles']);
    let neckY = calcRectMinY(b.neck);
    let endY = calcRectMaxY(b.end);
    let neckInset = 0.5 * mo.neckBlock.height;
    let endInset = 0.5 * mo.endBlock.height;
    if (Math.min(neckInset, endInset, neckY - neckWallY - neckInset, endWallY - endY - endInset) < mo.bitDiameter)
      return buildMiss('Alignment holes: the wall behind the neck or the end block is too thin to hold one, and they are left uncut.', ['alignmentHoles']);
    s.alignmentHoles = [new Circle(0, neckY - neckInset, mo.bitDiameter / 2), new Circle(0, endY + endInset, mo.bitDiameter / 2)];
    return null;
  });

  return s;
}

export type LabelledBlock = { path: string; label: 'U' | 'L'; x: number; y: number };

// Expand a rect by 1mm on the face that may be flush with the inner path boundary,
// so polygon-clipping has a clean crossing rather than a tangent touch point.
function expandRectTop(r: Rectangle): Rectangle {
  return new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y)), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y) + 1));
}

function expandRectBottom(r: Rectangle): Rectangle {
  return new Rectangle(new Pt(r.Pt1.x, Math.min(r.Pt1.y, r.Pt2.y) - 1), new Pt(r.Pt2.x, Math.max(r.Pt1.y, r.Pt2.y)));
}

function calcRowWidth(items: Array<{ rect: Rectangle }>, padding: number): number {
  return items.reduce((sum, { rect }) => sum + rect.width!, 0) + padding * (items.length - 1);
}

function calcRowHeight(items: Array<{ rect: Rectangle }>): number {
  return Math.max(...items.map(({ rect }) => rect.height!));
}

// a row of items horizontally centered on x=0 at the given yOffset
function buildBlockRow(items: Array<{ rect: Rectangle; path: string }>, yOffset: number, label: 'U' | 'L', padding: number): LabelledBlock[] {
  let xCursor = -calcRowWidth(items, padding) / 2;
  return items.map(({ rect, path }) => {
    const dx = xCursor - calcRectMinX(rect);
    const dy = yOffset - calcRectMinY(rect);
    const translated = translatePath(path, dx, dy);
    xCursor += rect.width! + padding;
    const bounds = pathsBounds([translated]);
    return { path: translated, label, x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  });
}

// the six blocks as the outline cuts them, laid out to cut from one board: the end block at the
// bottom, then the lower corner pair, the upper pair, the neck block on top, each row centred
export function buildBlockLayout(s: MouldSolve, padding = 5): LabelledBlock[] {
  let b = s.blocks!;
  let ribOutline = s.ribOutline!;

  const cuRect = b.upperCorner;
  const cuMirror = flipRectAboutY(b.upperCorner);
  const clRect = b.lowerCorner;
  const clMirror = flipRectAboutY(b.lowerCorner);

  const cuClipped = intersectionFromTwoPaths(pathFromRect(expandRectTop(cuRect)), ribOutline);
  const cuMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandRectTop(cuMirror)), ribOutline);
  const clClipped = intersectionFromTwoPaths(pathFromRect(expandRectBottom(clRect)), ribOutline);
  const clMirrorClipped = intersectionFromTwoPaths(pathFromRect(expandRectBottom(clMirror)), ribOutline);
  const uClipped = intersectionFromTwoPaths(pathFromRect(expandRectTop(b.neck)), ribOutline);
  const lClipped = intersectionFromTwoPaths(pathFromRect(expandRectBottom(b.end)), ribOutline);

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
  let yCursor = 0;
  const r3 = buildBlockRow(rowLower, yCursor, 'L', padding); yCursor += calcRowHeight(rowLower) + padding;
  const r2 = buildBlockRow(rowLowerCorners, yCursor, 'L', padding); yCursor += calcRowHeight(rowLowerCorners) + padding;
  const r1 = buildBlockRow(rowUpperCorners, yCursor, 'U', padding); yCursor += calcRowHeight(rowUpperCorners) + padding;
  const r0 = buildBlockRow(rowUpper, yCursor, 'U', padding);

  return [...r0, ...r1, ...r2, ...r3];
}
