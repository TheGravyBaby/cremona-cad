import { APP_VERSION, Arc, Circle, Pt, Rectangle, RecipeInterface } from '../../models/types';
import { SolveFailure } from '../../helpers/validators';
import { PolylineIndex } from '../../helpers/math/vibeMath';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FholeRatios, ViolinFamilyRatios } from './violin-family-seed';

// Every data shape the Violin Family recipe passes around, in one place. Three families:
//
//   params  what the user typed, or a seed wrote in their place. The file. Solvers only read it.
//   solved  what each panel's solver derives from the params: arcs, points, failures. Rebuilt,
//           never saved. A later panel reads an earlier one's by calling its solver.
//   ratios  the proportions the drawing reads at, for study. Derived like the solved stages, and
//           stamped onto the file as a record; nothing reads them back.
//
// the seeds live in violin-family-seed.ts.

// one sub-object per drafting stage, absent until that stage is first opened and seeded
export interface ViolinFamilyParams {
  body: BodyParams;
  bouts?: MainBoutsParams;
  corners?: CornersParams;
  outerContour?: OuterContourParams;
  fluting?: FlutingParams;
  fHoles?: FholePlacementParams;
  fHoleContours?: FholeContourParams;
  arching?: ArchingParams;
  neck?: NeckParams;
  scroll?: ScrollParams;
  stringSetup?: StringSetupParams;
  mould?: MouldParams;
}

// the outer envelope of the finished body. Every field is a number once typed, null while a field
// is cleared; a solver reports a missing or out-of-range value rather than drawing it
export interface BodyParams {
  height: number;
  // the lower bout's width, outside to outside. Main Bouts edits the same number as the lower bout's
  width: number;
  overhang: number;
  rib: number;
}

// widths are outer measurements; radii are of the rib outline, inside the inset. The lower bout's
// width is the body's (`body.width`), so the two panels can't disagree about it. The center bout
// is a bout, so C0 lives here too, seeded with the others and edited on the Center Bout panel
export interface MainBoutsParams {
  UBW: number;
  U0R: number;
  U1R: number;
  L0R: number;
  L1R: number;
  useViolNeck: boolean;
  // kept when the toggle goes off, so turning it back on returns the same neck
  viol: ViolNeckParams | null;
  CBW: number;
  C0R: number;
  C0Y: number;
  // Kelly's four circles: C0 is placed where it touches both join arcs, and CBW and C0Y are
  // read off it rather than typed
  useKellyC0: boolean;
}

export interface ViolNeckParams {
  width: number;
  neckRadius: number;
  V0R: number;
  // degrees: how far the join turns the outline down from the level top face, and how far V0 then
  // sweeps on from that heading before U0 takes over
  joinTurn: number;
  V0Sweep: number;
}

// the corner tips and the arcs that turn each bout into them. The tips are typed points: the seed
// puts them on their guide circles and the Default button puts them back there. Radii are of the
// rib outline. Where a corner is compound, the sweep is how far the second arc turns, in degrees,
// from where it takes over to the tip; the solve finds where the first hands it over. The center bout's corner arcs
// (C2 under the upper tip, C1 over the lower) are corners too, so they live here, seeded with the
// others and edited on the Center Bout panel
export interface CornersParams {
  UCr: Pt;
  LCr: Pt;
  // the join arcs' centre heights, where they're let off their bout arc's; absent, level with it.
  // Read only while the solve's height flex is on
  U2Y?: number;
  L2Y?: number;
  U2R: number;
  U3R: number;
  U31R: number;
  U31Sweep: number;
  U31DoubleArc: boolean;
  useViolCornerUC: boolean;
  L2R: number;
  L3R: number;
  L31R: number;
  L31Sweep: number;
  L31DoubleArc: boolean;
  useViolCornerLC: boolean;
  C2R: number;
  C21R: number;
  C21Sweep: number;
  C21DoubleArc: boolean;
  C1R: number;
  C11R: number;
  C11Sweep: number;
  C11DoubleArc: boolean;
}

// the plate's edge: the rib outline stood off by the inset, each corner's arcs run on past the rib
// corner and cut off across a flat, the button on the back, and the purfling lines inside the
// edge. A cutoff is how far a corner arc runs on past the rib outline's corner, in degrees along
// its own direction of travel, so an inverted corner's follows it round; the Ceruti recipe typed
// the arc's whole span instead. Rounding (0 to 1) swaps the flat for a curve
export interface OuterContourParams {
  button: ButtonParams;
  purflingOffset: number;
  purflingChannelDepth: number;
  U3Cutoff: number;
  U31Cutoff: number;
  C2Cutoff: number;
  C21Cutoff: number;
  C1Cutoff: number;
  C11Cutoff: number;
  L3Cutoff: number;
  L31Cutoff: number;
  upperRounding: number;
  lowerRounding: number;
}

// width is the cap's diameter; height is how far the tip stands beyond the plate's end
export interface ButtonParams {
  width: number;
  height: number;
}

// the fluting channel each plate is gouged with, inside the flat left round the edge. The fluting
// edge, where that flat ends and the channel begins, is one number for both plates: it belongs to
// the outline and the purfling, not to a gouge. The corners are smoothed down to the channel in
// one operation at the bench, so one toggle for both
export interface FlutingParams {
  flutingEdge: number;
  cornerGouge: boolean;
  top: ChannelParams;
  back: ChannelParams;
}

// a channel is its width, chord to chord where the gouge enters the plate and comes back out, and
// its depth at the trough; the gouge that cuts it follows from the two. A second, narrower channel
// may take the waist, where the bouts' gouge can't follow the C bout's curve
export interface ChannelParams {
  width: number;
  depth: number;
  cBoutWidth: number;
  useCBoutGouge: boolean;
}

// the plates' arching: the ribs the top plate stands on, and for each plate its edge thickness, the
// arch along the body and the crown across it. Stored as the fields show them: millimetres, and
// percent where a position or a height is a share of something solved (the body's length, the
// plate's half width at a station, the arch's height there). A plate carries every field of every
// curve type at once, so switching type only reveals
export interface ArchingParams {
  // a caliper reading square to the rib edge, at the lower bout and at the upper block
  ribHeightLower: number;
  ribHeightUpper: number;
  top: PlateArchParams;
  back: PlateArchParams;
}

export interface PlateArchParams {
  thickness: number;
  arch: LongArchParams;
  cross: CrossArchParams;
}

// the arch along the body: its height at the peak, where the peak sits (% of the length, 50 the
// middle) and, for a spline, the control points it runs through. Where it starts and ends is solved,
// not typed: it runs into the fluting channel and stops where it meets it tangentially. peakRow is
// the peak's row among the points in the table (0 first); the solver sorts by position, so the
// table's order is the maker's, for reading
export interface LongArchParams {
  type: 'catenary' | 'spline';
  height: number;
  peak: number;
  peakRow?: number;
  points: LongArchPoint[];
}

// t is % along the body from the lower end, z mm above the plate's edge; a mirrored point is
// repeated at 100 - t
export interface LongArchPoint {
  t: number;
  z: number;
  mirror: boolean;
}

// the crown across the plate at one station: a cycloid of factor d (% from a raised cosine to a
// full cycloid) over pct of its window, or a spline through points, peaking at peak (% across, 50
// the joint). Which is read is the plate's type. peakRow places the crown among the points in the
// table, as on the long arch
export interface CrossShapeParams {
  d: number;
  pct: number;
  peak: number;
  peakRow?: number;
  points: CrossArchPoint[];
}

// the plate's crown everywhere there is no station, anchoring both ends; stations are overrides
// between, which the crown ramps through
export interface CrossArchParams extends CrossShapeParams {
  type: 'catenary' | 'cycloid' | 'spline';
  stations: CrossStationParams[];
}

export interface CrossStationParams extends CrossShapeParams {
  y: number;
}

// x is % across the whole plate (0 the bass channel edge, 50 the joint, 100 the treble), z % of
// the arch height at that station; a mirrored point is repeated at 100 - x
export interface CrossArchPoint {
  x: number;
  z: number;
  mirror: boolean;
}

// the neck set in the side elevation and its widths in plan. Length runs along the fingerboard
// plane from the mortise floor to the nut's foot, which it places; the angle is the fingerboard
// plane's tilt off the top plate's square, in degrees. The thicknesses are the wood alone, the upper
// square to that plane at the nut, the lower through the button tip. The overstand is how far the
// fingerboard plane stands off the plate's edge at the root. The nut's height and width shape the
// scroll; they are seeded here, with the neck they sit on
export interface NeckParams {
  length: number;
  angle: number;
  upperThickness: number;
  lowerThickness: number;
  topWidth: number;
  rootWidth: number;
  heelRadius: number;
  mortiseDepth: number;
  overstand: number;
  nutHeight: number;
  nutWidth: number;
}

// the string setup, reference geometry over the neck that never shapes it. The bridge stands on the
// top's arch the body stop down from the neck end, its height off the arch; the nut stands its
// thickness off the neck's front at the nut; the board runs its length down the neck from the nut,
// its thickness off the neck at the edges and its crown a cone across its width: one radius at the
// nut, another at the end, the radius between them running linearly along the board. The scoop is
// planed along the top under the strings: how far from the nut it's deepest, and how deep under a
// straightedge at the bass edge and at the treble edge, the depth running linearly across
export interface StringSetupParams {
  bodyStop: number;
  bridgeHeight: number;
  nutThickness: number;
  fingerboardLength: number;
  fingerboardThickness: number;
  fingerboardNutRadius: number;
  fingerboardEndRadius: number;
  scoopAt: number;
  scoopBass: number;
  scoopTreble: number;
}

// the inside mould: the rib outline with the blocks cut out of it. Only the blocks' sizes are typed;
// where they sit follows from the outline. The neck and end blocks stand on the centreline against
// the outline's ends; each corner block's outer corner stands `pad` off its corner tip, out past it
// and toward the waist, so the outline clips the block to the corner's shape. The clamp box is the
// windows a clamp reaches through to hold each block home; off, the mould is its outline alone
export interface MouldParams {
  neckBlock: BlockParams;
  upperCornerBlock: CornerBlockParams;
  lowerCornerBlock: CornerBlockParams;
  endBlock: BlockParams;
  bitDiameter: number;
  clampBox: boolean;
}

export interface BlockParams {
  width: number;
  height: number;
}

export interface CornerBlockParams extends BlockParams {
  pad: Pt;
}

// the scroll in its own side view: the nut at the origin on the neck's front, up the neck +y,
// toward the back -x. The volute is a style's spiral about the eye, run out two turns to its front;
// with Fit to Neck on, the eye's x is solved to bring that front flush with the neck's front, and the
// typed x waits until it's off. The back runs on from the spiral: S0 to S2 tangent each to the last,
// each through its own sweep (degrees), a straight, then S3 turning back down to hang below the
// nut, and the nape into the neck's back. The front runs up from the nut: a flat, F0 through its
// sweep, a straight, and F1 curving back until it meets the spiral. Radii in mm
export type VoluteStyle = 'fourPoint' | 'archimedean' | 'serlio' | 'salviati' | 'goldmann' | 'kelly';

export interface ScrollParams {
  style: VoluteStyle;
  eye: Circle;
  fitToNeck: boolean;
  // the Archimedean's growth a turn, Kelly's seed, the four point's radius per quarter turn
  pitch: number;
  seedLength: number;
  arcRadii: number[];
  // each back arc turns on counterclockwise from the last through its own sweep, in degrees
  S0R: number;
  S0Sweep: number;
  S1R: number;
  S1Sweep: number;
  S2R: number;
  S2Sweep: number;
  backStraight: number;
  S3R: number;
  hang: number;
  napeR: number;
  // one circle through the duck tail, tangent to the neck's back, with no square line
  napeCircle: boolean;
  flat: number;
  F0R: number;
  F0Sweep: number;
  frontStraight: number;
  F1R: number;
  widths: ScrollWidths;
  // where the pegbox's front is widest, up from the nut's top, 0 none; where the back's slope turns,
  // up from the foot at the round's top, 0 none; the wood left round the pegbox's hollow
  hipHeight: number;
  backHipHeight: number;
  wall: number;
}

// full widths, cheek to cheek. The front is the pegbox sawn straight through the blank, by height:
// out from the nut's edges to the hips, then tapering to `throat` at the foot of the front's
// straight. The back starts in the duck tail's round, `foot` wide at the round's top, out on a
// straight slope by height to `backHip` and on to `poll`, the back's furthest reach, and from there
// on a curve through the crown and each turn, by distance along the back. The last turn is as wide
// as the eye from its top on in
export interface ScrollWidths {
  hip: number;
  throat: number;
  duckTail: number;
  foot: number;
  backHip: number;
  poll: number;
  crown: number;
  turn1Bottom: number;
  turn2Top: number;
  turn2Bottom: number;
  eye: number;
}

export type BodyKey = 'height' | 'width' | 'overhang' | 'rib';
export type BodyFailure = SolveFailure<BodyKey>;

// the boxes are null while a measurement is missing or out of range
export interface BodySolve {
  inset: number;
  outer: Rectangle | null;
  ribBox: Rectangle | null;
  failures: BodyFailure[];
}

export type MainBoutKey = 'U0' | 'U1' | 'L0' | 'L1';
export type MainBoutFailure = SolveFailure<MainBoutKey>;

// the right half of the rib outline; renders mirror it. A bout whose section failed is null
export interface MainBoutsSolve {
  U0: Arc | null;
  U1: Arc | null;
  L0: Arc | null;
  L1: Arc | null;
  V0: Arc | null;
  // the neck's top face and join, at the rib line and at the plate edge
  violCap: ViolNeckCap | null;
  violOuterCap: ViolNeckCap | null;
  violJoin: ViolNeckJoin | null;
  failures: MainBoutFailure[];
}

export interface ViolNeckCap {
  v0Start: number;
  fillet: Arc | null;
  topX: number;
  topY: number;
}

// how far the neck reaches across against how far the upper bout can receive it
export interface ViolNeckJoin {
  reach: number;
  limit: number;
  headroom: number;
}

export type CornerKey = 'U2' | 'U3' | 'U31' | 'U4' | 'L2' | 'L3' | 'L31' | 'L4';
export type CornerFailure = SolveFailure<CornerKey>;

// the right-hand corners; renders mirror them. U1 and L1 are the main bouts' arcs with their ends
// moved to where U2 and L2 take over: a render under or after this stage draws the bouts with
// these in place of the main bouts' own. A corner whose section failed leaves its arcs null and
// its bout arc untrimmed
export interface CornersSolve {
  U1: Arc | null;
  U2: Arc | null;
  U3: Arc | null;
  U31: Arc | null;
  U4: Arc | null;
  L1: Arc | null;
  L2: Arc | null;
  L3: Arc | null;
  L31: Arc | null;
  L4: Arc | null;
  failures: CornerFailure[];
}

export type CenterBoutKey = 'C0' | 'C1' | 'C11' | 'C2' | 'C21';
export type CenterBoutFailure = SolveFailure<CenterBoutKey>;

// the right-hand C bout; renders mirror it. C0 runs from where C2 takes over down to where C1
// does, and is null until both corners solve. CBW is the width in use: the typed one, or the one
// the fit found
export interface CenterBoutSolve {
  C0: Arc | null;
  C2: Arc | null;
  C21: Arc | null;
  C1: Arc | null;
  C11: Arc | null;
  CBW: number | null;
  failures: CenterBoutFailure[];
}

export type OuterContourKey = 'top' | 'back' | 'purfling';
export type OuterContourFailure = SolveFailure<OuterContourKey>;
export type OuterCornerKey = 'U3' | 'U31' | 'C2' | 'C21' | 'C1' | 'C11' | 'L3' | 'L31';

// the plates' outlines as closed SVG paths, the corner arcs at the plate edge with their cutoffs
// (right-hand side; a viol corner has none), and the button the back carries
export interface OuterContourSolve {
  top: string | null;
  back: string | null;
  purfling: string | null;
  outerPurfling: string | null;
  corners: Partial<Record<OuterCornerKey, Arc>>;
  button: { path: string; cap: Arc } | null;
  failures: OuterContourFailure[];
}

// where the two f-holes sit on the top plate: the eyes first, everything else hung off them. Each
// eye is a typed circle on the treble side; the bass side mirrors it. The rise is how far the hole
// runs on past its eye, and the stem's lean is in degrees past upright, positive toward the upper eye
export interface FholePlacementParams {
  UEye: Circle;
  LEye: Circle;
  URise: number;
  LRise: number;
  stem: FholeStemParams;
  // the nicks in the stem's edges, drawn and cut, or left off the hole altogether
  notches: boolean;
}

export interface FholeStemParams {
  center: Pt;
  width: number;
  angle: number;
}

// what bends between the eyes and the stem: each end's shoulder (U1/L1, with the bearing it ends
// on, so a new radius still hands over in the same place), arm (U2/L2, or a compound pair, with how far the first sweeps before the second
// takes over), wing (U3/L3) and the cut that sets the wing's tip, and the four arcs that land the
// outline on the stem, one radius for all four. Radii in mm, angles in degrees as
// the fields show them
export interface FholeContourParams {
  U1R: number;
  U1End: number;
  U2R: number;
  U21DoubleArc: boolean;
  U21R: number;
  U2Sweep: number;
  U3R: number;
  // the angle the wing meets its cut at, read at the tip
  U3Angle: number;
  UCut: FholeCutParams;
  L1R: number;
  L1End: number;
  L2R: number;
  L21DoubleArc: boolean;
  L21R: number;
  L2Sweep: number;
  L3R: number;
  L3Angle: number;
  LCut: FholeCutParams;
  stemArcR: number;
}

// the notch cut from the eye to the wing's tip: where on the eye it starts (degrees round the eye),
// the direction it runs (degrees) and how far
export interface FholeCutParams {
  angleOnEye: number;
  slope: number;
  length: number;
}

export type FlutingKey = 'top' | 'back';
export type FlutingFailure = SolveFailure<FlutingKey>;

// one plate's channel as three closed loops: its outer edge on the fluting edge, its centreline,
// and its inner edge, each half the channel's width further in, with the inner edge's offset from
// the plate edge read off for the arching, and the sweep of the gouge that cuts each width. The
// fluting edge itself is the plate edge that width in, corners followed, which the channel bypasses
export interface ChannelSolve {
  outer: string;
  center: string;
  inner: string;
  sweep: number;
  cBoutSweep: number;
  innerEdgeOffset: number;
  innerEdgeOffset_cBout: number;
}

export interface FlutingSolve {
  outerEdge: string | null;
  top: ChannelSolve | null;
  back: ChannelSolve | null;
  failures: FlutingFailure[];
}

export type FholeArcKey = 'U1' | 'U2' | 'U21' | 'U3' | 'L1' | 'L2' | 'L21' | 'L3' | 'S1' | 'S2' | 'S3' | 'S4';
export type FholeFailure = SolveFailure<FholeArcKey>;

// one f-hole's arcs on the treble side, the two tips its cuts place, and its outline as one closed
// path; renders mirror them. An arc whose section failed is null, and so is the path
export interface FholeContoursSolve {
  U1: Arc | null;
  U2: Arc | null;
  U21: Arc | null;
  U3: Arc | null;
  L1: Arc | null;
  L2: Arc | null;
  L21: Arc | null;
  L3: Arc | null;
  S1: Arc | null;
  S2: Arc | null;
  S3: Arc | null;
  S4: Arc | null;
  UTip: Pt | null;
  LTip: Pt | null;
  path: string | null;
  failures: FholeFailure[];
}

export type Plate = 'top' | 'back';
export type LongArchingKey = 'ribs' | Plate;
export type LongArchingFailure = SolveFailure<LongArchingKey>;

// the tilted plane the top plate glues to, from the two rib heights: those heights as vertical rise
// above the back plane, the tilt in radians, and the most the pair may differ by on this body
export interface RibTaper {
  yLower: number;
  yUpper: number;
  zLower: number;
  zUpper: number;
  angle: number;
  max: number;
}

// where an arch lands on the channel: how far from the channel's centreline (0 the trough,
// negative on the outer flank), how deep it is there, the channel's slope there, and whether the
// meeting is a true tangency or the closest the arch could come
export interface ArchTakeoff {
  contactS: number;
  takeoffDepth: number;
  slope: number;
  tangent: boolean;
}

// a long arch in the solver's own terms: fractions of its span, heights in mm
export interface LongArchCurve {
  type: 'catenary' | 'spline';
  archHeight: number;
  peak: number;
  points: { t: number; z: number; mirror: boolean }[];
}

// the long arch terminated where it meets the channel at each end; `lowered` is the arch restated
// against the start takeoff, `farZ` the far end's height in that frame
export interface LongArchSolve {
  span: number;
  yStart: number;
  yEnd: number;
  takeoff: ArchTakeoff;
  farTakeoff: ArchTakeoff;
  lowered: LongArchCurve;
  farZ: number;
  halfWidth: number;
  centerY: number;
}

export interface LongArchingSolve {
  ribs: RibTaper | null;
  top: LongArchSolve | null;
  back: LongArchSolve | null;
  failures: LongArchingFailure[];
}

export type CrossArchingKey = Plate;
export type CrossArchingFailure = SolveFailure<CrossArchingKey>;

// one authored point of a crown, as fractions: x of the way from the joint to the channel's inner
// edge, z of the arch height
export interface CrossArchKnot {
  x: number;
  z: number;
}

// a crown shape resolved to one station: its knots each side, still fractional, and where the crown
// sits (fraction of the chord, 0.5 the joint). A catenary carries no knots; a cycloid's knots are
// fractions of each side's takeoff rather than of the fixed frame
export interface CrossArchRow {
  left: CrossArchKnot[];
  right: CrossArchKnot[];
  peak?: number;
  catenary?: boolean;
  fromTakeoff?: boolean;
}

// a plate's transverse surface at one station, the transition solved on both sides. zAt is the
// height above the plate's outer surface at x across the plate, 0 the joint
export interface CrossArchSection {
  centerHalf: number;
  halfWidth: number;
  width: number;
  archH: number;
  xPeak: number;
  left: ArchTakeoff | null;
  right: ArchTakeoff | null;
  xEndLeft: number;
  xEndRight: number;
  innerEdge: number;
  datumLeft: number;
  datumRight: number;
  zAt: (x: number) => number;
}

// the channel as the surface reads it, with the band between the corners the C bout width takes
export interface SurfaceGouge {
  width: number;
  depth: number;
  cBoutWidth: number;
  cornerGouge: boolean;
  lowerCornerY: number;
  upperCornerY: number;
}

// one plate's carved surface: the loops it is measured against, the gouge, the crown resolver and
// the long arch. Heights come from surfaceZAt, relative to the plate's outer surface
export interface PlateSurface {
  outline: Pt[];
  flutingEdge: Pt[];
  flutingEdgeIdx: PolylineIndex;
  centerPoly: Pt[];
  centerIdx: PolylineIndex;
  gouge: SurfaceGouge;
  resolveCross: (y: number) => CrossArchRow;
  longArch: LongArchSolve | null;
}

// what one station row of the surface shares between every sample on it: the outline's crossings
// decide what is wood, the half chord the run the centreline sits in, which a hooked corner's tip
// lies outside
export interface SurfaceRow {
  outerCrossings: number[];
  outerHalf: number | null;
  landCrossings: number[];
  section: CrossArchSection | null;
  centerCrossings: number[];
}

export interface CrossArchingSolve {
  top: PlateSurface | null;
  back: PlateSurface | null;
  failures: CrossArchingFailure[];
}

export type NeckKey = 'neck' | 'heel';
export type NeckFailure = SolveFailure<NeckKey>;

// the neck in the side elevation, in the body section's frame (x up off the back's inner face, y up
// the body). `root` is where the fingerboard plane stands off the plate edge, `bottomFront` where it
// crosses the mortise floor, `neckTop` the nut's foot; `backNut`/`backRoot` the back line's ends,
// `lowerThickness` the line the heel's foot is cut along. The heel is null where it can't stand,
// and the back then runs straight to the root; `heelFace` is the flat on to the tip when the arc
// stops short of it
export interface NeckSolve {
  plateEdge: Pt | null;
  root: Pt | null;
  bottomFront: Pt | null;
  neckTop: Pt | null;
  backNut: Pt | null;
  backRoot: Pt | null;
  plateAtMortise: Pt | null;
  lowerThickness: [Pt, Pt] | null;
  tip: Pt | null;
  heel: Arc | null;
  heelFace: [Pt, Pt] | null;
  failures: NeckFailure[];
}

export type StringSetupKey = 'bridge' | 'nut' | 'fingerboard' | 'scoop';
export type StringSetupFailure = SolveFailure<StringSetupKey>;

// the string setup in the side elevation, over the neck it was solved on: the bridge's foot on the
// arch, its blank (neck-side foot, tail-side foot, tail-side top, neck-side top) and the string's
// point on its top, the string's point on the nut, and the board's end on the fingerboard plane
export interface StringSetupSolve {
  neck: NeckSolve;
  bridgeFoot: Pt | null;
  bridge: [Pt, Pt, Pt, Pt] | null;
  bridgeTop: Pt | null;
  nutTop: Pt | null;
  fingerboardEnd: Pt | null;
  failures: StringSetupFailure[];
}

export type ScrollKey = 'spiral' | 'S0' | 'S1' | 'S2' | 'S3' | 'nape' | 'backStraight' | 'F0' | 'F1' | 'flat' | 'frontStraight';
export type ScrollFailure = SolveFailure<ScrollKey>;

// the scroll's side profile, every arc placed, the spiral outermost first. An arc whose section
// failed is null, and so is everything solved after it
export interface ScrollSolve {
  eye: Circle | null;
  spiral: Arc[] | null;
  S0: Arc | null;
  S1: Arc | null;
  S2: Arc | null;
  S3: Arc | null;
  nape: Arc | null;
  F0: Arc | null;
  F1: Arc | null;
  failures: ScrollFailure[];
}

export type ScrollWidthsKey = keyof ScrollWidths | 'hipHeight' | 'backHipHeight' | 'wall';
export type ScrollWidthsFailure = SolveFailure<ScrollWidthsKey>;

// the side profile the widths hang on, and what the widths themselves say against it
export interface ScrollWidthsSolve {
  scroll: ScrollSolve;
  failures: ScrollWidthsFailure[];
}

export type MouldKey = 'neckBlock' | 'upperCornerBlock' | 'lowerCornerBlock' | 'endBlock' | 'clampBox';
export type MouldFailure = SolveFailure<MouldKey>;

// the blocks placed (the corner blocks on the right; renders mirror them), the rib outline they are
// cut from, the mould that leaves, and the clamp box's windows. A window that can't be cut between
// its blocks is left out and said so
export interface MouldSolve {
  blocks: Record<'neck' | 'upperCorner' | 'lowerCorner' | 'end', Rectangle> | null;
  ribOutline: string | null;
  outline: string | null;
  // the outline with the notches alone, before the bit's relief is cut into their corners
  notchOutline: string | null;
  reliefs: MouldRelief[];
  clampBox: string[];
  failures: MouldFailure[];
}

// a notch's inner corner relieved for the bit: the way into the notch along the corner's diagonal,
// and how far past the corner the relief reaches
export interface MouldRelief {
  corner: Pt;
  inward: Pt;
  reach: number;
}


export interface ViolinFamilyViewFlags {
  showModuleArcs: boolean;
  // the other outline stages' arcs drawn as module arcs too, in their own inks
  showAllArcs: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
  showFholeBounds: boolean;
  showFholePlacementGuides: boolean;
  // David Beard's center ninth, and 2/9 of the body standing on the lower eye's rise
  showBeardGuides: boolean;
  // the top plate's inner channel edge, faint, where the f-holes are placed against it
  showFlutingEdge: boolean;
  // the figure a volute style finds its centres on
  showVoluteConstruction: boolean;
  showFingerboard: boolean;
  // equal-tempered semitones marked up the string, as far as the board reaches
  showFretMarks: boolean;
  // the board's scoop drawn exaggerated above the strings, since at scale it's a hair
  showScoopGuide: boolean;
  showBlocks: boolean;
  showRibOutline: boolean;
}

export type ViolinFamilyToggleKey = keyof ViolinFamilyViewFlags;

export const DEFAULT_VIOLIN_FAMILY_VIEW_FLAGS: ViolinFamilyViewFlags = {
  showModuleArcs: true,
  showAllArcs: false,
  showModuleGuides: false,
  renderOuterPath: true,
  showFholeBounds: true,
  showFholePlacementGuides: false,
  showBeardGuides: false,
  showFlutingEdge: false,
  showVoluteConstruction: true,
  showFingerboard: true,
  showFretMarks: false,
  showScoopGuide: true,
  showBlocks: true,
  showRibOutline: false,
};

export interface HighlightedArc {
  arc: Arc;
  color: string;
}

export type RenderLayer = (g: any, ui: any) => void;

// what the shell asks of whichever panel is mounted: a draw when the theme, a view toggle or an
// undo has changed the picture, and the messages once an edit has settled
export interface ViolinFamilyPanel {
  draw(): void;
  report(): void;
}

export const VIOLIN_FAMILY_RECIPE_NAME = 'violin-family-recipe';
// its own key: the Ceruti recipe's flags are a different shape
export const VIOLIN_FAMILY_VIEW_FLAGS_KEY = 'violinFamilyViewFlags';

// ids are file-format vocabulary: reference images scope to them, and the session remembers one
export const VIOLIN_FAMILY_PANEL_IDS = ['base', 'mainBouts', 'corners', 'centerBout', 'outerContour', 'fluting', 'fHolePlacement', 'fHoleContours', 'longArching', 'crossArching', 'neck', 'volute', 'scroll', 'scrollWidths', 'stringSetup', 'mould', 'export', 'devFeatures', 'devExport'] as const;
export type ViolinFamilyPanelId = typeof VIOLIN_FAMILY_PANEL_IDS[number];

export interface ViolinFamilyRecipe extends RecipeInterface<ViolinFamilyParams> {
  recipeName: typeof VIOLIN_FAMILY_RECIPE_NAME;
  description?: string;
  source?: string;
  ratios?: Partial<ViolinFamilyRatios & FholeRatios>;
}

// a recipe served as a starting point; the key tells it from the others
export interface ViolinFamilyTemplate extends ViolinFamilyRecipe {
  key: string;
}

export const blankViolinFamilyRecipe =(): ViolinFamilyRecipe => ({
  recipeName: VIOLIN_FAMILY_RECIPE_NAME,
  fileName: 'New Instrument',
  version: APP_VERSION,
  params: JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS)),
  referenceImages: [],
});
