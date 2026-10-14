import { ReferenceImage } from '../../../models/types';
import { normalizeRadians, signedArcSweep, signedRadianDelta, TURN } from '../../../helpers/math/simpleGeometry';
import { cycloidZAt } from '../../../helpers/math/vibeMath';
import {
  ArchingParams, ChannelParams, CornersParams, CrossArchParams, CrossShapeParams, FholeContourParams, FholePlacementParams,
  FlutingParams, LongArchParams, MainBoutsParams, MouldParams, OuterContourParams, VIOLIN_FAMILY_RECIPE_NAME,
  ViolinFamilyParams, ViolinFamilyRecipe,
} from '../violin-family-types';

// Files the Enrico Ceruti recipe wrote, up to 0.8.x. They all say version "1" whatever release
// wrote them, so the recipe name is the only tell. Ceruti saved each stage's solved arcs whole, so
// what the user typed is read back off those arcs: a radius is the arc's, a sweep how far it turns.
// First the file is completed as Ceruti itself would have, so the translation reads nothing from
// the panels. It writes the 0.9.0 format, which a later release's own step takes on from; when
// one changes the params, this step's output keeps 0.9.0's shape rather than following it.

export const LEGACY_CERUTI_RECIPE_NAME = 'enrico-ceruti-violin';

export function isLegacyCeruti(file: any): boolean {
  return file?.recipeName === LEGACY_CERUTI_RECIPE_NAME;
}

type LegacyArc = { x: number; y: number; r: number; start: number; end: number };
type LegacyRect = { Pt1: { x: number; y: number }; Pt2: { x: number; y: number }; width: number; height: number };

export function fromLegacyCeruti(file: any): ViolinFamilyRecipe {
  let c = JSON.parse(JSON.stringify(file.params));
  replayLegacyLoad(c);
  return {
    recipeName: VIOLIN_FAMILY_RECIPE_NAME,
    fileName: file.fileName ?? '',
    version: '0.9.0',
    ...(file.description ? { description: file.description } : {}),
    ...(file.meta?.record?.url ? { source: file.meta.record.url } : {}),
    params: legacyParams(c),
    referenceImages: legacyImages(file),
    ...(file.toolboxState ? { toolboxState: legacyToolbox(file.toolboxState) } : {}),
  };
}

const deg = (radians: number) => round(radians / TURN.degree);
const round = (v: number) => Math.round(v * 1000) / 1000 || 0;
const pct = (f: number) => round(f * 100);
const turn = (arc: LegacyArc) => Math.abs(signedArcSweep(arc as any));
const isArc = (a: any): a is LegacyArc => !!a && [a.x, a.y, a.r, a.start, a.end].every(Number.isFinite);

// Ceruti's own defaults, by the body's height as it chose them
const cerutiGouge = (height: number) => {
  let [sweepRadius, depth, sweepRadius_cBout] = height < 400 ? [15, 1, 7.5] : height < 500 ? [18, 1.5, 9] : height < 800 ? [28, 2, 14] : [38, 2.5, 19];
  return { sweepRadius, depth, sweepRadius_cBout, cornerGouge: true };
};
const cerutiArching = (height: number) => {
  let [ribHeightLower, ribHeightUpper, top, bottom, thickness] =
    height < 400 ? [32, 30, 15, 14, 3.5] : height < 500 ? [40, 38, 20, 18, 4] : height < 800 ? [120, 116, 27, 25, 6] : [185, 179, 55, 50, 9];
  return { ribHeightLower, ribHeightUpper, top, bottom, thickness };
};

// what Ceruti did to a file before drawing it. Its loader brought older files up: a single rib
// height became the tapered pair, spline points from before asymmetric arches were half-span
// positions, and the gouge and crown blocks of a model retired within days were renamed or, being
// unreadable, dropped. Its solvers then filled what was never typed: the purfling and fluting edge
// once the plates were drawn, a button, a placeholder arc for a corner never made compound, each
// plate's gouge, thickness and crown
function replayLegacyLoad(c: any): void {
  let b = c.bouts;
  let inset = c.overhang + c.rib;
  if (b && Number.isFinite(b.LBW)) {
    let LBWI = b.LBW - 2 * inset;
    for (let key of ['U31', 'L31', 'C21', 'C11']) b[key] ??= { r: Math.round(LBWI * (c.ratios?.[`${key}toLBW`] ?? 1 / 16)) };
  }
  if (c.outerCorners?.U3) {
    c.purflingChannelDepth ??= 1.2;
    c.purflingOffset ??= inset + c.purflingChannelDepth;
    c.outerFlutingDepth ??= c.overhang * 0.5;
    c.button ??= { width: 20, height: 5 };
  }
  let a = c.arching;
  if (!a) return;
  let given = cerutiArching(c.height);
  if (typeof a.ribHeight === 'number') {
    a.ribHeightLower ??= a.ribHeight;
    a.ribHeightUpper ??= a.ribHeight;
  }
  a.ribHeightLower ??= a.ribHeightUpper ?? given.ribHeightLower;
  a.ribHeightUpper ??= a.ribHeightLower;
  for (let plate of [a.top, a.bottom]) {
    if (!plate) continue;
    plate.thickness ??= given.thickness;
    let arch = plate.arch;
    if (arch?.type === 'spline') {
      arch.peak ??= 0.5;
      if (arch.points.some((pt: any) => pt.mirror === undefined)) {
        for (let pt of arch.points) if (pt.mirror === undefined) { pt.t /= 2; pt.mirror = true; }
        arch.points.sort((m: any, n: any) => m.t - n.t);
      }
      for (let pt of arch.points) pt.z = Math.min(Math.max(pt.z, 0), arch.archHeight);
    }
    if (plate.gougedFluting) plate.fluting = plate.gougedFluting;
    else if (plate.fluting && plate.fluting.sweepRadius === undefined) delete plate.fluting;
    if (plate.gougedCross) plate.cross = plate.gougedCross;
    else if (plate.cross && !isCurrentCross(plate.cross)) delete plate.cross;
    plate.fluting ??= cerutiGouge(c.height);
    plate.cross ??= { type: 'cycloid', d: 0.4, pct: 0.9 };
  }
}

function isCurrentCross(cross: any): boolean {
  if (cross.type === 'catenary') return true;
  if (cross.type !== 'spline' && cross.type !== 'cycloid') return false;
  return cross.type === 'spline' ? cross.points.every((pt: any) => typeof pt.x === 'number') : !('left' in cross || 'right' in cross);
}

// each stage only once the stages its panel stands on are there, as the panels unlock
function legacyParams(c: any): ViolinFamilyParams {
  let b = c.bouts ?? {};
  let p: ViolinFamilyParams = { body: { height: c.height, width: b.LBW ?? c.width, overhang: c.overhang, rib: c.rib } };
  let bouts = legacyBouts(c);
  if (!bouts) return p;
  p.bouts = bouts;
  let corners = legacyCorners(c);
  if (!corners) return p;
  p.corners = corners;
  let mould = legacyMould(c);
  if (mould) p.mould = mould;
  let outer = legacyOuterContour(c);
  if (!outer) return p;
  p.outerContour = outer;
  let fHoles = legacyPlacement(c.fHoles);
  let fHoleContours = fHoles && legacyContours(c);
  if (fHoles) p.fHoles = fHoles;
  if (fHoleContours) p.fHoleContours = fHoleContours;
  if (!c.arching && c.outerFlutingDepth == null) return p;
  p.fluting = legacyFluting(c);
  let arching = legacyArching(c);
  if (arching) p.arching = arching;
  return p;
}

function legacyBouts(c: any): MainBoutsParams | undefined {
  let b = c.bouts;
  if (!b || ![b.U0, b.U1, b.L0, b.L1, b.C0].every(isArc) || ![b.UBW, b.CBW].every(Number.isFinite)) return undefined;
  let V0: LegacyArc | null = c.viol?.V0;
  return {
    UBW: b.UBW, U0R: b.U0.r, U1R: b.U1.r, L0R: b.L0.r, L1R: b.L1.r,
    useViolNeck: !!c.options.useViolNeck,
    // V0 ran counterclockwise from the join, which turns the outline down from the level top face
    viol: isArc(V0) ? {
      width: c.viol.width, neckRadius: c.viol.neckRadius ?? 0, V0R: V0.r,
      joinTurn: round(270 - normalizeRadians(V0.start) / TURN.degree), V0Sweep: deg(normalizeRadians(V0.end - V0.start)),
    } : null,
    CBW: b.CBW, C0R: b.C0.r, C0Y: b.C0.y,
    useKellyC0: !!c.options.useKellyC0,
  };
}

// what 0.9.0 seeds a compound corner's sweep with, for one Ceruti never made compound
const COMPOUND_SWEEP = { U31: 30, L31: 45, C21: 65, C11: 60 };

// a compound corner's second arc ran from where it took over to the tip, so its turn is the sweep.
// One left single kept the radius last typed for it, but its arc is a placeholder
function legacyCorners(c: any): CornersParams | undefined {
  let b = c.bouts;
  let o = c.options;
  if (![b.U2, b.U3, b.L2, b.L3, b.C2, b.C1].every(isArc) || !b.UCr || !b.LCr) return undefined;
  let compound = (key: keyof typeof COMPOUND_SWEEP, on: boolean) => {
    let arc = b[key];
    let live = on && isArc(arc);
    return {
      [`${key}R`]: arc.r,
      [`${key}Sweep`]: live ? deg(turn(arc)) : COMPOUND_SWEEP[key],
      [`${key}DoubleArc`]: live,
    };
  };
  return {
    UCr: { x: b.UCr.x, y: b.UCr.y },
    LCr: { x: b.LCr.x, y: b.LCr.y },
    U2R: b.U2.r, U3R: b.U3.r,
    useViolCornerUC: !!o.useViolCornerUC,
    L2R: b.L2.r, L3R: b.L3.r,
    useViolCornerLC: !!o.useViolCornerLC,
    C2R: b.C2.r, C1R: b.C1.r,
    ...compound('U31', o.U31DoubleArc),
    ...compound('L31', o.L31DoubleArc),
    ...compound('C21', o.C21DoubleArc),
    ...compound('C11', o.C11DoubleArc),
  } as CornersParams;
}

// Ceruti stored each plate corner arc's end; a cutoff is how far it runs on past the rib arc's,
// along the rib arc's own travel
function cutoff(inner: LegacyArc | null, outer: LegacyArc | null): number {
  if (!isArc(inner) || !isArc(outer)) return 0;
  return deg(Math.sign(signedRadianDelta(inner.end - inner.start)) * signedRadianDelta(outer.end - inner.end));
}

function legacyOuterContour(c: any): OuterContourParams | undefined {
  let oc = c.outerCorners;
  if (!oc || ![oc.U3, oc.C2, oc.C1, oc.L3].every(isArc)) return undefined;
  let b = c.bouts;
  return {
    button: legacyButton(c),
    purflingOffset: c.purflingOffset,
    purflingChannelDepth: c.purflingChannelDepth,
    U3Cutoff: cutoff(b.U3, oc.U3), U31Cutoff: cutoff(b.U31, oc.U31),
    C2Cutoff: cutoff(b.C2, oc.C2), C21Cutoff: cutoff(b.C21, oc.C21),
    C1Cutoff: cutoff(b.C1, oc.C1), C11Cutoff: cutoff(b.C11, oc.C11),
    L3Cutoff: cutoff(b.L3, oc.L3), L31Cutoff: cutoff(b.L31, oc.L31),
    upperRounding: c.options.ucCornerSharpness ?? 0,
    lowerRounding: c.options.lcCornerSharpness ?? 0,
  };
}

// Ceruti stood the cap's centre `height` above where the button's walls met the plate's edge, or
// the viol neck's face; the height now runs to the tip, from the plate's end or that face
function legacyButton(c: any): { width: number; height: number } {
  let r: LegacyRect = c.button;
  let tip = r.height + r.width / 2;
  let U0: LegacyArc = c.bouts.U0;
  let R = U0.r + c.overhang + c.rib;
  let wall = r.width / 2 - U0.x;
  // a button wider than the bout it stands on was never drawn
  if (c.options.useViolNeck || Math.abs(wall) > R) return { width: r.width, height: round(tip) };
  return { width: r.width, height: round(U0.y + Math.sqrt(R * R - wall * wall) + tip - c.height) };
}

function legacyPlacement(f: any): FholePlacementParams | undefined {
  if (!f?.UEye || !f.LEye || !f.stem?.center || ![f.URise, f.LRise, f.stem.width, f.stem.angle].every(Number.isFinite)) return undefined;
  return {
    UEye: { x: f.UEye.x, y: f.UEye.y, r: f.UEye.r },
    LEye: { x: f.LEye.x, y: f.LEye.y, r: f.LEye.r },
    URise: f.URise,
    LRise: f.LRise,
    stem: { center: { x: f.stem.center.x, y: f.stem.center.y }, width: f.stem.width, angle: deg(f.stem.angle) },
    // a ceruti file predates the notches; they come in on as a fresh draft would
    notches: true,
  };
}

// a shoulder leaves its eye where the two touch and turns clockwise to its arm; the arm's sweep is
// to where a second arm takes over, or half its run when it has none, as the panel seeds it. A
// wing's angle is read at its tip, against the cut's own direction
function legacyContours(c: any): FholeContourParams | undefined {
  let f = c.fHoles;
  let o = c.options;
  if (![f.U1, f.U2, f.U3, f.L1, f.L2, f.L3, f.S1, f.S2, f.S3, f.S4].every(isArc) || !f.UCut || !f.LCut || !Number.isFinite(f.stem.arcR)) return undefined;
  let shoulder = (eye: any, arc: LegacyArc) => {
    let start = arc.r >= eye.r ? Math.atan2(eye.y - arc.y, eye.x - arc.x) : Math.atan2(arc.y - eye.y, arc.x - eye.x);
    return deg(normalizeRadians(start - arc.end));
  };
  let arm = (shoulderArc: LegacyArc, first: LegacyArc, second: LegacyArc | null, on: boolean) =>
    on && isArc(second) ? deg(normalizeRadians(shoulderArc.end - second.start)) : round(turn(first) / 2 / TURN.degree);
  let wing = (arc: LegacyArc, cut: any, up: 1 | -1) => round(90 - up * signedRadianDelta(arc.end - cut.slope) / TURN.degree);
  let cut = (k: any) => ({ angleOnEye: deg(k.angleOnEye), slope: deg(k.slope), length: k.length });
  let U21 = !!o.U21DoubleArc && isArc(f.U21);
  let L21 = !!o.L21DoubleArc && isArc(f.L21);
  return {
    U1R: f.U1.r, U1Sweep: shoulder(f.UEye, f.U1),
    U2R: f.U2.r, U21DoubleArc: U21, U21R: U21 ? f.U21.r : f.U2.r, U2Sweep: arm(f.U1, f.U2, f.U21, U21),
    U3R: f.U3.r, U3Angle: wing(f.U3, f.UCut, 1), UCut: cut(f.UCut),
    L1R: f.L1.r, L1Sweep: shoulder(f.LEye, f.L1),
    L2R: f.L2.r, L21DoubleArc: L21, L21R: L21 ? f.L21.r : f.L2.r, L2Sweep: arm(f.L1, f.L2, f.L21, L21),
    L3R: f.L3.r, L3Angle: wing(f.L3, f.LCut, -1), LCut: cut(f.LCut),
    stemArcR: f.stem.arcR, stemArcsIndependent: !!o.stemArcsIndependent,
    S1R: f.S1.r, S2R: f.S2.r, S3R: f.S3.r, S4R: f.S4.r,
  };
}

// Ceruti typed the gouge's sweep; a channel is now its width, the chord that sweep cuts at the depth
function legacyFluting(c: any): FlutingParams {
  let chord = (R: number, depth: number) => round(2 * Math.sqrt(Math.max(depth * (2 * R - depth), 0)));
  let channel = (g = cerutiGouge(c.height)): ChannelParams => ({
    width: chord(g.sweepRadius, g.depth),
    depth: g.depth,
    cBoutWidth: chord(g.sweepRadius_cBout ?? g.sweepRadius, g.depth),
    useCBoutGouge: g.sweepRadius_cBout != null,
  });
  // absent reads as on
  return {
    flutingEdge: c.outerFlutingDepth,
    cornerGouge: c.arching?.top?.fluting?.cornerGouge ?? true,
    top: channel(c.arching?.top?.fluting),
    back: channel(c.arching?.bottom?.fluting),
  };
}

function legacyArching(c: any): ArchingParams | undefined {
  let a = c.arching;
  if (!a?.top?.arch || !a.bottom?.arch) return undefined;
  let plate = (old: any) => ({ thickness: old.thickness, arch: longArch(old.arch), cross: crossArch(old.cross) });
  return { ribHeightLower: a.ribHeightLower, ribHeightUpper: a.ribHeightUpper, top: plate(a.top), back: plate(a.bottom) };
}

// a cycloid long arch has no counterpart now, so it becomes a spline through the cycloid's own
// heights; a fraction of the span is a percentage
function longArch(arch: any): LongArchParams {
  if (arch.type === 'spline')
    return { type: 'spline', height: arch.archHeight, peak: pct(arch.peak ?? 0.5), points: arch.points.map((pt: any) => ({ t: pct(pt.t), z: pt.z, mirror: !!pt.mirror })) };
  if (arch.type === 'cycloid')
    return {
      type: 'spline', height: arch.archHeight, peak: 50,
      points: [0.0625, 0.125, 0.25, 0.375].map(t => ({ t: pct(t), z: round(cycloidZAt(arch.archHeight, 1, arch.d, t)), mirror: true })),
    };
  return { type: 'catenary', height: arch.archHeight, peak: 50, points: [] };
}

// a crown point's signed fraction of its own side becomes a position across the whole plate
function crossShape(shape: any): CrossShapeParams {
  return {
    d: shape.type === 'cycloid' ? pct(shape.d) : 40,
    pct: shape.type === 'cycloid' ? pct(shape.pct) : 90,
    peak: shape.type === 'spline' ? pct(shape.peak ?? 0.5) : 50,
    points: shape.type === 'spline' ? shape.points.map((pt: any) => ({ x: 50 + pct(pt.x) / 2, z: pct(pt.z), mirror: !!pt.mirror })) : [],
  };
}

function crossArch(cross: any): CrossArchParams {
  return {
    type: cross.type,
    ...crossShape(cross),
    stations: (cross.type === 'catenary' ? [] : cross.stations ?? []).map((st: any) => ({ y: st.y, ...crossShape({ ...st, type: cross.type }) })),
  };
}

// Ceruti always cut a clamp box, with its default bit unless one was typed
function legacyMould(c: any): MouldParams | undefined {
  let b = c.blocks;
  if (!b || ![b.U, b.CU, b.CL, b.L].every(r => r && Number.isFinite(r.width) && Number.isFinite(r.height))) return undefined;
  return {
    neckBlock: { width: b.U.width, height: b.U.height },
    upperCornerBlock: { width: b.CU.width, height: b.CU.height, pad: { x: b.CUPad, y: -b.CUPad } },
    lowerCornerBlock: { width: b.CL.width, height: b.CL.height, pad: { x: b.CLPad, y: b.CLPad } },
    endBlock: { width: b.L.width, height: b.L.height },
    bitDiameter: c.bitDiameter ?? 6.35,
    clampBox: true,
  };
}

const panelId = (id: string) => id === 'outerTrace' ? 'outerContour' : id;

// Ceruti scoped an image by lists: hidden hid it, `panels` named where it showed, `excludePanels`
// where it didn't, and a default image filled the panels no other image named. An image without
// pixels was dropped on load, and the single `referenceImage` came before the list
function legacyImages(file: any): ReferenceImage[] {
  let list: any[] = Array.isArray(file.referenceImages) ? file.referenceImages : file.referenceImage ? [file.referenceImage] : [];
  list = list.filter(img => !!img?.href);
  return list.map(img => {
    let { panels = [], excludePanels = [], isDefault, hidden, 'xlink:href': _xlink, ...kept } = img;
    let only: string[] = panels.map(panelId);
    let except: string[] = excludePanels.map(panelId);
    let named = list.filter(other => other !== img && !other.hidden).flatMap(other => (other.panels ?? []).map(panelId));
    let scope = hidden ? { only: [] }
      : only.length ? { only: only.filter(id => !except.includes(id)) }
      : isDefault ? { except: [...new Set([...except, ...named])] }
      : { except };
    if ('except' in scope && !scope.except.length) return kept;
    return { ...kept, scope };
  });
}

// a hidden layer is one scoped nowhere now, and a stroke drawn freehand without a width took 2
function legacyToolbox(state: any): object {
  let next = JSON.parse(JSON.stringify(state));
  if (Array.isArray(next.layers)) next.layers = next.layers.map(({ visible, ...layer }: any) => visible === false ? { ...layer, scope: { only: [] } } : layer);
  if (Array.isArray(next.shapes)) for (let shape of next.shapes) if (shape?.type === 'freehand') shape.strokeWidth ??= 2;
  return next;
}
