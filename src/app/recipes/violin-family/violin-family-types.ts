import { APP_VERSION, Arc, Circle, Pt, RecipeInterface } from '../../models/types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS, FholeRatios, ViolinFamilyRatios } from './violin-family-seed';

// The data shapes the Violin Family recipe saves and passes around. Three families:
//
//   params  what the user typed, or a seed wrote in their place. The file. Solvers only read it.
//   solved  what each panel's solver derives from the params: arcs, points, failures. Rebuilt,
//           never saved. A later panel reads an earlier one's by calling its solver. They live in
//           violin-family-solves.ts.
//   ratios  the proportions the drawing reads at, for study. Derived like the solved stages, and
//           stamped onto the file as a record; nothing reads them back.
//
// the seeds live in violin-family-seed.ts.

// one sub-object per drafting stage, absent until that stage is first opened and seeded
export interface ViolinFamilyParams {
  body: BodyParams;
  bouts?: MainBoutsParams;
  corners?: CornersParams;
  plateContour?: PlateContourParams;
  fluting?: FlutingParams;
  fHoles?: FholePlacementParams;
  fHoleContours?: FholeContourParams;
  arching?: ArchingParams;
  graduation?: GraduationParams;
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
export interface PlateContourParams {
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
  long: LongArchParams;
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

// the plates' thicknesses. The glue platform is shared: `lining` and `edgeInset` are read in from
// the rib line (the ribs' inner face), the lining being the strip glued inside the ribs, so the
// platform ends that far in, and the edge inset where the gouge may start; `blockMargin` is read
// from the neck and end blocks' inner faces, positive holding the gouge short of a block, negative
// trimming the block back as blocks are once off the mould. The lining sits here only until the
// linings have a stage of their own. The f-holes are the top's own: each hole's outline reads
// `fHoleThickness`, what its wings carry. Inside the boundary each plate's thickness is its
// readings, no mirroring: the two halves are read apart. A template carries no readings unless
// they were read off a real instrument
export interface GraduationParams {
  lining: number;
  edgeInset: number;
  blockMargin: number;
  fHoleThickness: number;
  top: PlateGraduationParams;
  back: PlateGraduationParams;
}

export interface PlateGraduationParams {
  points: GraduationPoint[];
}

// one caliper reading in the plate's own frame: x across from the joint, y up the body. A zone
// point keeps its name
export interface GraduationPoint {
  x: number;
  y: number;
  thickness: number;
  label?: string;
}

// the neck set in the side elevation and its widths in plan. Length runs along the fingerboard
// plane from the mortise floor to the nut's foot, which it places; the angle is the fingerboard
// plane's tilt off the top plate's square, in degrees. The thicknesses are the wood alone, the upper
// square to that plane at the nut, the lower through the button tip. The heel angle is the foot's
// heading off the button tip, in degrees counterclockwise from level; at the neck's angle the foot is
// cut square to the neck. The overstand is how far the fingerboard plane stands off the plate's edge
// at the root. The nut's height and width shape the
// scroll; they are seeded here, with the neck they sit on
export interface NeckParams {
  length: number;
  angle: number;
  upperThickness: number;
  lowerThickness: number;
  topWidth: number;
  rootWidth: number;
  heelRadius: number;
  heelAngle: number;
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
  // the line from the duck tail to the nape, in degrees off square, rising toward the neck's back
  napeAngle: number;
  flat: number;
  F0R: number;
  F0Sweep: number;
  frontStraight: number;
  F1R: number;
  widths: ScrollWidths;
  // where the pegbox's front is widest, up from the nut's top, 0 none; how far the duck tail's round
  // runs on straight up to the foot, by height, 0 none; the wood left round the pegbox's hollow
  hipHeight: number;
  duckTailStraight: number;
  wall: number;
}

// full widths, cheek to cheek. The front is the pegbox sawn straight through the blank, by height:
// out from the nut's edges to the hips, then tapering to `throat` at the foot of the front's
// straight. The back starts in the duck tail's round, its sides running on straight up to the foot,
// `foot` wide there, out on a straight slope by height to `poll`, the back's furthest reach, and from there
// on a curve through the crown and each turn, by distance along the back. The last turn is as wide
// as the eye from its top on in
export interface ScrollWidths {
  hip: number;
  throat: number;
  duckTail: number;
  foot: number;
  poll: number;
  crown: number;
  turn1Bottom: number;
  turn2Top: number;
  turn2Bottom: number;
  eye: number;
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
  // the corner-bypassing loop at the rib line itself, the wood a block has to fill
  showRibJoin: boolean;
  // the figure a volute style finds its centres on
  showVoluteConstruction: boolean;
  showFingerboard: boolean;
  // equal-tempered semitones marked up the string, as far as the board reaches
  showFretMarks: boolean;
  // the board's scoop drawn exaggerated above the strings, since at scale it's a hair
  showScoopGuide: boolean;
  showBlocks: boolean;
  showRibOutline: boolean;
  // the graduation points themselves, dots and readings; off, the thickness map stands alone
  showGraduationPoints: boolean;
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
  showRibJoin: false,
  showVoluteConstruction: true,
  showFingerboard: true,
  showFretMarks: false,
  showScoopGuide: true,
  showBlocks: true,
  showRibOutline: false,
  showGraduationPoints: true,
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
export const VIOLIN_FAMILY_PANEL_IDS = ['base', 'mainBouts', 'corners', 'centerBout', 'plateContour', 'fluting', 'fHolePlacement', 'fHoleContours', 'longArching', 'crossArching', 'neck', 'volute', 'scroll', 'scrollWidths', 'stringSetup', 'mould', 'export', 'devFingerboard', 'devGraduation', 'devExport'] as const;
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
