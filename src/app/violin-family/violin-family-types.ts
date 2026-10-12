import { Arc, Rectangle, RecipeInterface } from '../models/types';
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
// width is the body's (`body.width`), so the two panels can't disagree about it
export interface MainBoutsParams {
  UBW: number;
  U0R: number;
  U1R: number;
  L0R: number;
  L1R: number;
  useViolNeck: boolean;
  // kept when the toggle goes off, so turning it back on returns the same neck
  viol: ViolNeckParams | null;
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
export const VIOLIN_FAMILY_PANEL_IDS = ['base', 'mainBouts'] as const;
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
