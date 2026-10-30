import { Arc, Circle, Pt, Rectangle } from '../../models/types';
import { SolveFailure } from '../../helpers/validators';
import { PolylineIndex } from '../../helpers/math/vibeMath';
import { ScrollWidths } from './violin-family-types';

// what each panel's solver derives from the params: arcs, points, failures. Rebuilt every draw,
// never saved. A later panel reads an earlier one's by calling its solver.

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

export type PlateContourKey = 'top' | 'back' | 'purfling';
export type PlateContourFailure = SolveFailure<PlateContourKey>;
export type OuterCornerKey = 'U3' | 'U31' | 'C2' | 'C21' | 'C1' | 'C11' | 'L3' | 'L31';

// the plates' outlines as closed SVG paths, the corner arcs at the plate edge with their cutoffs
// (right-hand side; a viol corner has none), and the button the back carries
export interface PlateContourSolve {
  top: string | null;
  back: string | null;
  purfling: string | null;
  outerPurfling: string | null;
  corners: Partial<Record<OuterCornerKey, Arc>>;
  button: { path: string; cap: Arc } | null;
  failures: PlateContourFailure[];
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
// `lowerThickness` the lower thickness square to the fingerboard plane through the button tip,
// `heelCorner` where the foot off the tip at the heel angle meets the back, the corner the heel
// rounds. The heel is null where it can't stand,
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
  heelCorner: Pt | null;
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

export type ScrollWidthsKey = keyof ScrollWidths | 'hipHeight' | 'duckTailStraight' | 'wall';
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

export type GraduationKey = 'lining' | 'edgeInset' | 'blockMargin' | 'fHoleThickness';
export type GraduationFailure = SolveFailure<GraduationKey>;

// the ground the plates are graduated on. The neck and end blocks sit inside the rib line, their
// inner faces flat and the corners of those faces rounded. The lining line is the glue platform's
// inner edge: a loop inside the rib line with the corners bypassed as the fluting channel does,
// stepping round the blocks. The boundary is the loop the gouge starts at, cut straight across at
// each block's inner face. Null when a loop can't be made; shared by both plates, the back's drawn
// beside the top
export interface GraduationSolve {
  blocks: { neck: string; end: string } | null;
  lining: string | null;
  boundary: string | null;
  // the boundary as a polyline with its extent, what the layouts, the field and the map all read
  ground: GraduationGround | null;
  // the top's holes as polylines, treble then bass; empty until the contours close
  holes: Pt[][];
  failures: GraduationFailure[];
}

export interface GraduationGround { loop: Pt[]; minX: number; maxX: number; minY: number; maxY: number }
