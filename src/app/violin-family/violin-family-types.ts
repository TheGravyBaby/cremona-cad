import { Arc, Pt, Rectangle, RecipeInterface } from '../models/types';
import { SolveFailure } from '../helpers/validators';

// Every data shape the Violin Family recipe passes around, in one place. Three families:
//
//   params  what the user typed, or a seed wrote in their place. The file. Solvers only read it.
//   solved  what each panel's solver derives from the params: arcs, points, failures. Rebuilt,
//           never saved. A later panel reads an earlier one's by calling its solver.
//   ratios  the proportions the drawing reads at, for study. Derived like the solved stages, and
//           stamped onto the file as a record; nothing reads them back.

// one sub-object per drafting stage, absent until that stage is first opened and seeded
export interface ViolinFamilyParams {
  body: BodyParams;
  bouts?: MainBoutsParams;
  corners?: CornersParams;
  outerContour?: OuterContourParams;
  fluting?: FlutingParams;
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
  // degrees, as the fields show them; the solver turns them to radians. Start at the join, end
  // where U0 takes over
  V0Start: number;
  V0End: number;
}

// the corner tips and the arcs that turn each bout into them. The tips are typed points: the seed
// puts them on their guide circles and the Default button puts them back there. Radii are of the
// rib outline. Where a corner is compound, the split angle is the direction from the first arc's
// centre to the point the second takes over at, in degrees as the field shows it. The center
// bout's corner arcs (C2 under the upper tip, C1 over the lower) are corners too, so they live
// here, seeded with the others and edited on the Center Bout panel
export interface CornersParams {
  UCr: Pt;
  LCr: Pt;
  U2R: number;
  U3R: number;
  U31R: number;
  U31Start: number;
  U31DoubleArc: boolean;
  useViolCornerUC: boolean;
  L2R: number;
  L3R: number;
  L31R: number;
  L31Start: number;
  L31DoubleArc: boolean;
  useViolCornerLC: boolean;
  C2R: number;
  C21R: number;
  C21Start: number;
  C21DoubleArc: boolean;
  C1R: number;
  C11R: number;
  C11Start: number;
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

// the fluting channel each plate is gouged with, inside a flat land round the edge. The land edge
// is one number for both plates: it belongs to the outline and the purfling, not to a gouge. The
// corners are smoothed down to the channel in one operation at the bench, so one toggle for both
export interface FlutingParams {
  flutingEdge: number;
  cornerGouge: boolean;
  top: GougeParams;
  back: GougeParams;
}

// a gouge is its sweep radius and how deep it is run; the channel's width follows from the two.
// A second, narrower gouge may take the waist, where the first can't follow the C bout's curve
export interface GougeParams {
  sweepRadius: number;
  depth: number;
  cBoutSweep: number;
  useCBoutGouge: boolean;
}

export const DEFAULT_VIOLIN_FAMILY_PARAMS: ViolinFamilyParams = {
  body: {
    height: 350,
    width: 200,
    overhang: 3,
    rib: 1,
  },
};

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

export type FlutingKey = 'top' | 'back';
export type FlutingFailure = SolveFailure<FlutingKey>;

// one plate's channel as three closed loops: its outer edge on the land, its centreline, and its
// inner edge, each a gouge's half width further in, with the inner edge's offset from the plate
// edge read off for the arching. The land is the plate edge the land's width in, corners followed
export interface ChannelSolve {
  outer: string;
  center: string;
  inner: string;
  width: number;
  cBoutWidth: number;
  innerEdgeOffset: number;
  innerEdgeOffset_cBout: number;
}

export interface FlutingSolve {
  land: string | null;
  top: ChannelSolve | null;
  back: ChannelSolve | null;
  failures: FlutingFailure[];
}

// named <thing>to<datum>. The radius ratios are taken against the bout's inner width (the width
// less the inset both sides), as the Ceruti recipe always measured them, so the two compare
export interface ViolinFamilyRatios {
  HtoW: number;
  UBtoLB: number;
  U0toUBW: number;
  U1toUBW: number;
  LBtoH: number;
  L0toLBW: number;
  L1toLBW: number;
  U2toUBW: number;
  U3toLBW: number;
  U31toLBW: number;
  L2toLBW: number;
  L3toLBW: number;
  L31toLBW: number;
  UCYtoH: number;
  LCYtoH: number;
  CBWtoLBW: number;
  C0toLBW: number;
  C0YtoH: number;
  C2toLBW: number;
  C21toLBW: number;
  C1toLBW: number;
  C11toLBW: number;
}

// what a stage is first drafted at
export const SEED_RATIOS: ViolinFamilyRatios = {
  HtoW: 7 / 4,
  UBtoLB: 4 / 5,
  U0toUBW: 5 / 6,
  U1toUBW: 1 / 3,
  LBtoH: 4 / 7,
  L0toLBW: 7 / 8,
  L1toLBW: 1 / 3,
  U2toUBW: 1 / 2,
  U3toLBW: 1 / 8,
  U31toLBW: 1 / 16,
  L2toLBW: 1 / 2,
  L3toLBW: 1 / 8,
  L31toLBW: 1 / 16,
  UCYtoH: 2 / 3,
  LCYtoH: 6 / 15,
  CBWtoLBW: 1 / 2,
  C0toLBW: 4 / 9,
  C0YtoH: 9 / 16,
  C2toLBW: 1 / 12,
  C21toLBW: 1 / 16,
  C1toLBW: 1 / 8,
  C11toLBW: 1 / 16,
};

export interface ViolinFamilyViewFlags {
  showModuleArcs: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
}

export type ViolinFamilyToggleKey = keyof ViolinFamilyViewFlags;

export const DEFAULT_VIOLIN_FAMILY_VIEW_FLAGS: ViolinFamilyViewFlags = {
  showModuleArcs: true,
  showModuleGuides: false,
  renderOuterPath: true,
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
export const VIOLIN_FAMILY_SCHEMA_VERSION = '1';
// its own key: the Ceruti recipe's flags are a different shape
export const VIOLIN_FAMILY_VIEW_FLAGS_KEY = 'violinFamilyViewFlags';

// ids are file-format vocabulary: reference images scope to them, and the session remembers one
export const VIOLIN_FAMILY_PANEL_IDS = ['base', 'mainBouts', 'corners', 'centerBout', 'outerContour', 'fluting'] as const;
export type ViolinFamilyPanelId = typeof VIOLIN_FAMILY_PANEL_IDS[number];

export interface ViolinFamilyRecipe extends RecipeInterface {
  recipeName: typeof VIOLIN_FAMILY_RECIPE_NAME;
  version: string;
  description?: string;
  source?: string;
  params: ViolinFamilyParams;
  ratios?: Partial<ViolinFamilyRatios>;
}

export const blankViolinFamilyRecipe = (): ViolinFamilyRecipe => ({
  recipeName: VIOLIN_FAMILY_RECIPE_NAME,
  fileName: 'New Instrument',
  version: VIOLIN_FAMILY_SCHEMA_VERSION,
  params: JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS)),
  referenceImages: [],
});
