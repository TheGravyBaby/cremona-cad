import { Arc, Circle, NamedReferenceImage, Pt, Rectangle, ReferenceImage } from "../models/types";

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  purflingOffset: number | null;
  purflingChannelDepth: number | null;
  innerFlutingDepth: number | null;
  outerFlutingDepth: number | null;
  button: Rectangle | null,
  bouts: {
    UBW: number | null;
    U0: Arc | null;
    U1: Arc | null;
    U2: Arc | null;
    U3: Arc | null;
    U31: Arc | null;
    U4?: Arc | null;
    CBW: number | null;
    C2: Arc | null;
    C21?: Arc | null;
    C0: Arc | null;
    C1: Arc | null;
    C11: Arc | null;
    LBW: number | null;
    L4?: Arc | null;
    L3: Arc | null;
    L31: Arc | null;
    L2: Arc | null;
    L1: Arc | null;
    L0: Arc | null;
    UCr: Pt | null;
    LCr: Pt | null;
  },
  outerCorners: {
    U3 : Arc | null,
    U31: Arc | null,
    C2: Arc | null,
    C21: Arc | null,
    C1: Arc | null,
    C11: Arc | null,
    L3: Arc | null,
    L31: Arc | null
  },
  blocks: {
    U: Rectangle | null;
    CU: Rectangle | null;
    CUPad: number | null;
    CL: Rectangle | null;
    CLPad: number | null;
    L: Rectangle | null;
  },
  viol: {
    width: number | null;
    V0: Arc | null;
    neckRadius?: number | null;
  },
  options: {
    useViolNeck: boolean,
    useViolCornerUC: boolean,
    useViolCornerLC: boolean,
    useKellyC0: boolean // four circles based theory of clean intersection along center bout,
    U31DoubleArc: boolean;
    C21DoubleArc: boolean;
    C11DoubleArc: boolean;
    L31DoubleArc: boolean;
    ucCornerSharpness?: number;
    lcCornerSharpness?: number;
  },
  ratios: {
    HtoW: number;
    UBtoLB: number;
    U0toUBW: number;
    U1toUBW: number;
    U2toUBW: number;
    U3toLBW: number;
    U31toLBW: number;
    CBWtoLBW: number;
    C0toLBW: number;
    C0YtoH: number;
    C2toLBW: number;
    C21toLBW: number;
    C1toLBW: number;
    C11toLBW: number;
    LBtoH: number;
    L0toLBW: number;
    L1toLBW: number;
    L2toLBW: number;
    L3toLBW: number;
    L31toLBW: number;
    UCYtoH: number;
    LCYtoH: number;

    FLtoW: number;
    FUtoL: number;
  },
  fHoles?: FholeParams;
  arching?: ArchingParams;
}

export interface ArchingParams {
  surfaceMethod: 'proportional';
  ribHeightLower: number;
  ribHeightUpper: number;
  top: ArchPlate;
  bottom: ArchPlate;
}

// each of U1-U3/L1-L3/S1-S4 is named for where it physically sits, not which curve drew it — a
// single outline edge crosses both halves. Springing from UEye: U1 shoulder, U2 arm, S2 the
// stem-tangent arc, S4 the stem-to-wing arc, L3 the wing (it reaches down by LTip, so it takes
// the L letter its position earns, not the U of the eye it left). Springing from LEye,
// mirrored: L1, L2, S3, S1, U3. S1-S4 sit in the stem strip itself, named by quadrant —
// S1 upper-left, S2 upper-right, S3 lower-left, S4 lower-right — see FholeStem.arcR.
export interface FholeParams {
  UEye: Circle | null;
  LEye: Circle | null;
  URise: number | null;
  LRise: number | null;
  UCut: FholeCut | null;
  LCut: FholeCut | null;
  /** Derived each pass from the eye + its own cut; not a free field. */
  UTip: Pt | null;
  LTip: Pt | null;

  stem: FholeStem;

  /** `U1.end` is sticky past the apex — see getShoulderExtendDeg. */
  U1: Arc | null;
  U2: Arc | null;
  /** The wing hung off UTip — belongs to the edge that springs from LEye, but named for where it
   * sits, not where it started. */
  U3: Arc | null;

  L1: Arc | null;
  L2: Arc | null;
  /** The wing hung off LTip — belongs to the edge that springs from UEye. */
  L3: Arc | null;

  /** Upper-left stem-tangent/flare arc. */
  S1: Arc | null;
  /** Upper-right. */
  S2: Arc | null;
  /** Lower-left. */
  S3: Arc | null;
  /** Lower-right. */
  S4: Arc | null;
}

/** The straight cut closing one end of the hole, from a point on the eye out to the wing's tip. */
export interface FholeCut {
  /** Where on the eye the cut lands, absolute in the plate's frame. */
  angleOnEye: number | null;
  slope: number | null;
  length: number | null;
}

/** The shared reference frame both edges land their stem-tangent arc on. */
export interface FholeStem {
  center: Pt | null;
  width: number | null;
  /** radians; geometry should read `stemRun`, not this. */
  angle: number | null;
  /** Shared radius for all four stem-tangent/flare arcs (S1-S4) — one compass setting for
   * the whole stem, the way a maker would actually fit it. */
  arcR: number | null;
}

/** Resolved palette from CerutiViolin's `colors` getter, threaded into every panel and render fn. */
export interface CerutiColors {
  upperBout: string;
  upperBoutOff: string;
  upperBoutOff2: string;
  centerBoutUp: string;
  centerBoutUpOff: string;
  centerBoutUpOff2: string;
  centerBout: string;
  centerBoutOff: string;
  centerBoutOff2: string;
  centerBoutLow: string;
  centerBoutLowOff: string;
  centerBoutLowOff2: string;
  lowerBout: string;
  lowerBoutOff: string;
  lowerBoutOff2: string;
  violNeck: string;
  innerTrace: string;
  outerTrace: string;
  mouldTrace: string;
  fluting: string;
  archTop: string;
  archBack: string;
  fHoleUpperDark: string;
  fHoleUpper: string;
  fHoleUpperMuted: string;
  fHoleUpperLight: string;
  fHoleLowerDark: string;
  fHoleLower: string;
  fHoleLowerMuted: string;
  fHoleLowerLight: string;
  fHoleStem: string;
  fHoleStemOff: string;
  fHoleCut: string;
}

/** A plate's 3D/topo overlay is one-at-a-time — rendering both is too slow. */
export type PlateViewMode = 'none' | 'contours' | 'wireframe';

/** Ephemeral, non-persisted view toggles shared across panels and their render functions. */
export interface CerutiViewFlags {
  showModuleArcs: boolean;
  showModuleCircles: boolean;
  showAllArcs: boolean;
  showAllCircles: boolean;
  showModuleGuides: boolean;
  showFholeBounds: boolean;
  showFholePlacementGuides: boolean;
  renderOuterPath: boolean;
  showBlocks: boolean;
  showInnerPath: boolean;
  simpleClampBox: boolean;
  /** Body height (mm) of the cross-section station being viewed; null resolves a default. */
  crossSectionY: number | null;
  topPlateView: PlateViewMode;
  backPlateView: PlateViewMode;
  /** Degrees. Shared by the wireframe and 3D contour views — the same oblique projection. */
  plateRotXDeg: number;
  plateRotYDeg: number;
  plateRotZDeg: number;
}

// read off `CerutiViolin.panelOrder`, not the mounted panel: a view query for the open panel
// resolves after the bar's binding evaluates, throwing NG0100 on switch — don't "simplify" this
// back to @ViewChild/viewChild(). No default on CerutiPanelBase, so omitting renderToggles fails the build.
export type RenderToggleKey = 'showModuleArcs' | 'showAllArcs' | 'showModuleCircles'
  | 'showAllCircles' | 'showModuleGuides' | 'showFholeBounds' | 'showFholePlacementGuides'
  | 'showBlocks' | 'showInnerPath' | 'renderOuterPath';

/**
 * A panel's render request. Panels describe how to build their layers; the parent applies shared
 * policy (debounce, history, session, panel flow) before running it.
 */
export interface PanelRenderRequest {
  /** Bypasses the debounce — hover/focus previews and the first draw on activation. */
  immediate?: boolean;
  /**
   * Waits out the debounce even where the parent would have run straight away, as an arrow-key
   * nudge or spinner click otherwise would. For a panel whose run is a redraw that is wrong; for
   * one that re-solves a surface it is right, since a held key would queue a second of work per
   * repeat and fall progressively further behind. Ignored when `immediate` is set.
   */
  coalesce?: boolean;
  /** Refresh panel enablement after this request — for edits that unlock downstream panels. */
  refreshEnabledPanels?: boolean;
  /** Skip writing to session storage. Persists when omitted. */
  persistSession?: boolean;
  run: () => Array<(g: any, ui: any) => void>;
}

export const DEFAULT_CERUTI_VIEW_FLAGS: CerutiViewFlags = {
  showModuleArcs: true,
  showModuleCircles: false,
  showAllArcs: false,
  showAllCircles: false,
  showModuleGuides: false,
  showFholeBounds: true,
  showFholePlacementGuides: false,
  renderOuterPath: true,
  showBlocks: true,
  showInnerPath: false,
  simpleClampBox: false,
  crossSectionY: null,
  topPlateView: 'none',
  backPlateView: 'none',
  plateRotXDeg: -30,
  plateRotYDeg: -10,
  plateRotZDeg: 0,
};

/** Increment when a saved recipe's shape changes. Old files still load, with a warning. */
export const RECIPE_SCHEMA_VERSION = '1';

export interface ArchCatenary {
  type: 'catenary';
  archHeight: number;
}

export interface ArchCycloid {
  type: 'cycloid';
  archHeight: number;
  d: number; // trochoid factor: 0 = raised cosine, 1 = standard cycloid (valid range 0–1)
}

export interface ArchSplinePoint {
  t: number; // normalized full-span position: 0 = upper plate edge, 1 = lower plate edge
  z: number; // arch height at this point (mm above the plate edge)
  /** Repeats at 1 − t, mirrored about the plate's mid-length, not about the off-centre peak.
   * Absent marks a pre-asymmetric point whose `t` was a half-span position — see
   * `normalizeArchCurve`. */
  mirror?: boolean;
}

export interface ArchSpline {
  type: 'spline';
  archHeight: number;
  /** Full-span position of the peak, the one knot pinned to `archHeight`. 0.5 when absent; off
   * 0.5 is what makes the arch asymmetric end to end. */
  peak?: number;
  points: ArchSplinePoint[]; // interior points only, t strictly in (0, 1), in the panel's order
  /** which panel row the peak sits in; cosmetic — the solve sorts by position — but saved since the maker arranged it. */
  peakRow?: number;
}

export type ArchCurve = ArchCatenary | ArchCycloid | ArchSpline;


// ===== Arching model =====
// The gouge is the given: one sweep, one depth, run the whole way round, so the
// channel's section is the same everywhere. What gets solved is where the arch
// stops being the template and becomes the transition into the channel.
//
// That is the bench's order and the reverse of the obvious one — deriving the
// channel from the arch makes the gouge's sweep an output that swings around the
// body, widest at the corners, where no maker's channel widens at all.

/** The gouge that cuts a plate's fluting channel, and where it runs. The corners are bypassed
 * rather than followed. */
export interface FlutingParams {
  /** Sweep radius of the gouge (mm). With `depth`, fixes the section entirely. */
  sweepRadius: number;
  /** Depth of the channel at its trough, below the plate outer surface (mm). */
  depth: number;
  /**
   * A second, usually narrower gouge through the C-bout. Null uses `sweepRadius` throughout.
   *
   * Only the sweep changes — same land edge, same `depth` — so what moves is the *inner* edge,
   * which is what makes this expressible at all. Varying the channel's position instead would
   * walk the outer edge away from the purfling it is cut against.
   */
  sweepRadius_cBout: number | null;
  /**
   * Runs the gouge into the corners as a second pass, carving the wedge of flat wood the
   * bypassing channel leaves against the platform boundary.
   *
   * A second *cut*, not a redefinition: it only removes material, and only on the channel side of
   * the arch's takeoff, so nothing solved upstream moves. Absent reads as on.
   */
  cornerGouge?: boolean;
}

/**
 * A cross-arch control point, anchored to the crown rather than the local fluting chord. A point
 * measured against the chord describes a curve that *stretches* station to station; a template a
 * maker holds against the wood does not.
 */
export interface CrossArchPoint {
  /**
   * Fraction of this side's own crown: 0 the joint, ±1 the takeoff, negative the bass side —
   * a fraction rather than mm so it stays a shape as the station narrows. From the joint, not
   * the crown, so a knot can land on the far side of the crown from the flank it was authored
   * on; `crossProfile` sorts rather than assuming.
   */
  x: number;
  /** Height as a fraction of the local arch height: 1 the crown, 0 the plate surface. */
  z: number;
  /** Repeats at −x. Leaving it off confines the point to its own side — the source of asymmetry. */
  mirror?: boolean;
}

/**
 * The crown template only. Its peak sits at the long arch's height for that station; its outer
 * end is not here, since the takeoff is solved for tangency against the channel — see
 * `solveArchTakeoff`.
 */
export interface CrossArchSplineShape {
  type: 'spline';
  points: CrossArchPoint[];
  /**
   * Fraction of the width between channel centerlines: 0.5 the joint, below it the bass side,
   * 0.5 when absent. Against the centerline chord rather than the solved takeoffs (unlike
   * {@link CrossArchPoint.x}) since the crown must not move mid-solve. Eases back onto the
   * joint toward the caps — see `PEAK_TAPER_DEPTHS`.
   */
  peak?: number;
  /** Which row of the panel's table the crown sits in. Presentation only, as {@link ArchSpline.peakRow}. */
  peakRow?: number;
}

/**
 * Symmetric by construction — asymmetry lives in the control-point form. `pct` clips the flat
 * cusp, setting how steeply the crown runs out and so where along the channel flank the tangency
 * lands: a flatter run-out (`pct` near 1) can only meet the channel near its trough.
 */
export interface CrossArchCycloidShape {
  type: 'cycloid';
  /** Trochoid factor: 0 = raised cosine, 1 = standard cycloid (valid range 0–1). */
  d: number;
  /** Trochoid window: 1 = the full curve, <1 clips the flat cusp end for a steeper run-out (valid range 0.05–1). */
  pct: number;
}

/** A cross-arch section shape: a trochoid or a control-point template. */
export type CrossArchShape = CrossArchSplineShape | CrossArchCycloidShape;

/** A control-point cross-arch shape pinned to one body-length position. */
export type CrossArchSplineStation = CrossArchSplineShape & {
  /** Body-length position in mm, held strictly inside the plate ends. */
  y: number;
};

/** A trochoid cross-arch shape pinned to one body-length position. */
export type CrossArchCycloidStation = CrossArchCycloidShape & {
  /** Body-length position in mm, held strictly inside the plate ends. */
  y: number;
};

/** Split per type rather than `CrossArchShape & { y }` so a plate's station list narrows with the
 * plate — knowing it is a trochoid is enough to read `d` off its stations. */
export type CrossArchStation = CrossArchSplineStation | CrossArchCycloidStation;

/** One plate's cross-arch: a base template anchoring both body ends, plus optional interior
 * stations the shape ramps through. */
export type CrossArchSplineParams = CrossArchSplineShape & {
  stations?: CrossArchSplineStation[];
};

export type CrossArchCycloidParams = CrossArchCycloidShape & {
  stations?: CrossArchCycloidStation[];
};

export type CrossArchParams = CrossArchSplineParams | CrossArchCycloidParams;

export interface ArchPlate {
  arch: ArchCurve;
  thickness: number;
  /** Seeded from the outline on first use, so a recipe predating the panel still opens sanely. */
  fluting?: FlutingParams;
  /** Absent until authored. */
  cross?: CrossArchParams;
}

/**
 * The keys the shared path cache can hold. Enumerated rather than a bare string because the cache
 * is filled by `ensure*` and read by `getPath`, which asserts — a typo is a runtime crash, not a
 * type error. `purfling`/`outerPurfling` can legitimately be absent; read those with
 * `getPathOrNull`.
 */
export type PathKey = 'inner' | 'top' | 'back' | 'purfling' | 'outerPurfling' | 'fHole';

/** One named, precalculated SVG path — the shared cache read by export. */
export interface PathEntry {
  key: PathKey;
  path: string;
}

// panel ids are file-format vocabulary — templates scope reference images by id, so renaming one
// is a migration; `panelOrder` is typed against this list.
export const CERUTI_PANEL_IDS = [
  'base', 'mainBouts', 'corners', 'centerBout', 'outerTrace',
  'fluting', 'longArching', 'crossArching', 'fHolePlacement', 'fHoleContours', 'mould', 'export',
] as const;

export type CerutiPanelId = typeof CERUTI_PANEL_IDS[number];

// kept off `params`: measurements are facts (no copyright), a photograph is expression (has its
// own `ImageCredit`). Absent on the blank template and on anything a user saved themselves.
export interface TemplateMeta {
  maker: string;
  /** named as the record names it — 'Violin "Ole Bull"', 'Viola'. */
  instrument: string;
  /** as published: '1669', 'c.1730', '1610-20' — a string, not a year, since most are ranges. */
  date: string;
  record: {
    /** The institution's own object id — Met 898377, SI nmah_833906, LoC ihas.200154811. */
    objectId: string;
    url: string;
  };
  notes?: string;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
  meta?: TemplateMeta;
  params: EnricoCerutiParams;
  paths: PathEntry[];
  /** @deprecated legacy single-image field; migrated into `referenceImages` on load. */
  referenceImage?: ReferenceImage;
  referenceImages?: NamedReferenceImage[];
}

export const DefaultParams: EnricoCerutiParams = {
  height: 350,
  width: 200,
  overhang: 3,
  rib: 1,
  bitDiameter: 6.35,
  purflingOffset: null,
  purflingChannelDepth: null,
  innerFlutingDepth: null,
  outerFlutingDepth: null,
  ratios: {
    HtoW: 7 / 4,

    UBtoLB: 4 / 5,
    U0toUBW: 5 / 8,
    U1toUBW: 1 / 3,
    U2toUBW: 1 / 2,
    U3toLBW: 1 / 8,
    U31toLBW: 1 / 16,

    CBWtoLBW: 1 / 2,
    C0YtoH: 9 / 16,
    C0toLBW: 4/9,
    C2toLBW: 1 / 12,
    C21toLBW: 1 / 16,
    C1toLBW: 1 / 8,
    C11toLBW: 1 / 16,

    LBtoH: 4 / 7,
    L0toLBW: 7 / 8,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,
    L31toLBW: 1 / 16,

    UCYtoH: 2 / 3,
    LCYtoH: 6 / 15,

    FLtoW: 1/50,
    FUtoL: 3/4,
  },
  bouts: {
    UBW: undefined,
    U0: undefined,
    U1: undefined,
    U2: undefined,
    U3: undefined,
    U31: undefined,
    U4: undefined,
    CBW: undefined,
    C2: undefined,
    C21: undefined,
    C0: undefined,
    C1: undefined,
    C11: undefined,
    LBW: undefined,
    L4: undefined,
    L3: undefined,
    L31: undefined,
    L2: undefined,
    L1: undefined,
    L0: undefined,
    UCr: undefined,
    LCr: undefined,
  },
  viol: {
    width: null,
    V0: null,
    neckRadius: null
  },
  button: null,
  outerCorners: {
    U3: null,
    U31: null,
    C2: null,
    C21: null,
    C1: null,
    C11: null,
    L3: null,
    L31: null
  },
  blocks: {
    U: undefined,
    CU: undefined,
    CUPad: undefined,
    CL: undefined,
    CLPad: undefined,
    L: undefined,
  },
  options: {
    useViolNeck: false,
    useViolCornerUC: false,
    useViolCornerLC: false,
    useKellyC0: false, // four circles based theory of clean intersection along center bout
    U31DoubleArc: false,
    C21DoubleArc: false,
    C11DoubleArc: false,
    L31DoubleArc: false,
    ucCornerSharpness: 0,
    lcCornerSharpness: 0,
  }
}
