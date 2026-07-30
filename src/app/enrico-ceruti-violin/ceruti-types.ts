import { Arc, NamedReferenceImage, Pt, Rectangle, ReferenceImage } from "../models/types";

/** Resolved palette returned by CerutiViolin's `colors` getter, threaded into every panel and render fn. */
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
}

/** A plate's costly 3D/topo overlay is one-at-a-time: rendering both is what made the panel slow. */
export type PlateViewMode = 'none' | 'contours' | 'wireframe';

/** Ephemeral, non-persisted view toggles shared across panels and their render functions. */
export interface CerutiViewFlags {
  showModuleArcs: boolean;
  showModuleCircles: boolean;
  showAllArcs: boolean;
  showAllCircles: boolean;
  showModuleGuides: boolean;
  renderOuterPath: boolean;
  showBlocks: boolean;
  showInnerPath: boolean;
  simpleClampBox: boolean;
  /** Body height (mm) of the cross-section station being viewed; null = resolve a default on first activation. */
  crossSectionY: number | null;
  /** Top plate's overlay above the section view: contour map, oblique wireframe, or neither. */
  topPlateView: PlateViewMode;
  /** Back plate's overlay above the section view: contour map, oblique wireframe, or neither. */
  backPlateView: PlateViewMode;
  /**
   * Rotation around the X axis (degrees). Tilts body length to reveal the
   * arch profile. Shared by both the wireframe and 3D contour views — they're
   * the same oblique projection at zero rotation, just different geometry.
   */
  plateRotXDeg: number;
  /** Rotation around the Y axis (degrees). Rolls the body on its length axis. */
  plateRotYDeg: number;
  /** Rotation around the Z axis (degrees). Spins the plan view. */
  plateRotZDeg: number;
}

/**
 * Generic panel-to-parent render request payload.
 * Panels describe how to build their render layers; the parent applies shared
 * policy (debounce/history/session/panel-flow) before executing it.
 */
export interface PanelRenderRequest {
  /**
   * When true, bypasses debounce delay and runs immediately (used for hover/
   * focus previews and initial panel activation draws).
   */
  immediate?: boolean;
  /**
   * When true, parent refreshes panel enablement after applying this request
   * (used by panels whose edits unlock downstream panels).
   */
  refreshEnabledPanels?: boolean;
  /**
   * When false, parent skips writing recipe data to session storage after this
   * request. Defaults to persisted when omitted.
   */
  persistSession?: boolean;
  /**
   * Builds the render layer stack for the current panel state.
   */
  run: () => Array<(g: any, ui: any) => void>;
}

export const DEFAULT_CERUTI_VIEW_FLAGS: CerutiViewFlags = {
  showModuleArcs: true,
  showModuleCircles: false,
  showAllArcs: false,
  showAllCircles: false,
  showModuleGuides: false,
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

/**
 * Increment this when the shape of a saved recipe file changes in a
 * backward-incompatible (or additive) way. Old files will still load
 * but the user will see a warning in the message center.
 */
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
  /**
   * When true the point repeats at 1 − t, mirrored about the plate's mid-length
   * (not about the peak, which is free to sit off-centre). Absent marks a point
   * saved before asymmetric splines, whose `t` was a half-span position
   * (0 = plate edge, 1 = peak) and was always mirrored — see normalizeArchCurve.
   */
  mirror?: boolean;
}

export interface ArchSpline {
  type: 'spline';
  archHeight: number;
  /**
   * Normalized full-span position of the peak — the one knot pinned to
   * `archHeight`. 0.5 (the default when absent) centres the arch; moving it
   * off 0.5 is what makes the arch asymmetric end to end.
   */
  peak?: number;
  points: ArchSplinePoint[]; // interior points only, t strictly in (0, 1), kept sorted by t
}

export type ArchCurve = ArchCatenary | ArchCycloid | ArchSpline;

/** One side's trochoid shape — see {@link CrossArchShape}'s `d`/`pct` for field meaning. */
export interface CrossArchSide {
  d: number;
  pct: number;
}

/**
 * A cross-arch section shape: one trochoid shared across the full width, or —
 * when the owning plate is asymmetric — independent halves either side of the
 * centerline. Carried both by the plate itself ({@link CrossArchParams}, the
 * base shape) and by each {@link CrossArchStation} along the body.
 */
export interface CrossArchShape {
  d: number; // trochoid factor: 0 = raised cosine, 1 = standard cycloid (valid range 0–1)
  pct: number; // cycloid window: 1 = full arch (flat edge takeoff), <1 clips the flat cusp ends for a steeper edge (valid range 0.05–1)
  /** Shape for x<0, used only while the plate's cross arch is asymmetric. */
  left?: CrossArchSide;
  /** Shape for x>0, used only while the plate's cross arch is asymmetric. */
  right?: CrossArchSide;
}

/** A cross-arch shape pinned to one body-length position. */
export interface CrossArchStation extends CrossArchShape {
  /** Body-length position in mm, held strictly inside the plate ends. */
  y: number;
}

/**
 * Cross-arch shape parameters for one plate. The section curve at any station
 * is a trochoid whose span (fluting inner-boundary chord) and peak (long-arch
 * height there) are both derived; this fixes the remaining freedom, its
 * transverse shape.
 *
 * `d`/`pct` (and `left`/`right`) here are the plate's *base* shape, which
 * anchors both body ends. `stations` are interior overrides the shape ramps
 * through in between — the same edges-plus-interior-points relationship
 * {@link ArchSpline} has along the long arch.
 */
export interface CrossArchParams extends CrossArchShape {
  /**
   * When true, `left` (x<0) and `right` (x>0) each carry their own d/pct
   * instead of sharing `d`/`pct` — e.g. a flatter bass-side shoulder against
   * a fuller treble-side one. Applies to the base shape and every station
   * alike. The symmetric `d`/`pct` are kept (not overwritten) while
   * asymmetric is on, so toggling back off restores the prior shape.
   * Default false/absent (symmetric).
   */
  asymmetric?: boolean;
  /**
   * Interior shape overrides along the body, kept sorted by `y`. Absent or
   * empty means one shape everywhere — the behaviour before stations existed.
   */
  stations?: CrossArchStation[];
}

/**
 * The carved fluting channel for one plate — the vertical dimension of the
 * platform annulus already defined in plan view. The transverse profile is a
 * single circular arc (gouge cut) from the platform's outer boundary to the
 * cross arch's takeoff, tangent to the arch there — fully determined by
 * edgeDepth and the arch, with no separate trough position to set.
 */
export interface FlutingChannelParams {
  /**
   * When true the annulus stays a flat platform at the plate surface with a
   * 90° ledge dropping to the arch takeoff at the inner boundary — the
   * pre-channel state a maker cuts the purfling on before gouging the channel.
   * When false (default) the carved gouge-arc channel is used.
   */
  flatPlatform: boolean;
}

export interface ArchPlate {
  arch: ArchCurve;
  thickness: number;
  cross?: CrossArchParams;
  fluting?: FlutingChannelParams;
  /** mm below the plate outer surface where both the long arch and cross arch take off (default 0). */
  edgeDepth: number;
}

export interface ArchingParams {
  surfaceMethod: 'proportional';
  ribHeight: number;
  top: ArchPlate;
  bottom: ArchPlate;
}

/**
 * The recipe's saved parameters — serialized verbatim into the file's `params`.
 *
 * Note the `Arc`/`Rectangle`-typed fields below (`button`, `bouts.*`, `outerCorners.*`). Those
 * are **class instances in memory but plain objects on disk**: a loaded file yields prototype-less
 * data, and ceruti-calcs.ts is what restores real instances by reassigning them through
 * `arcFromCircle*` / `offsetArcRadius` / `redefineArcCircle` before anything renders. That is the
 * only reason `Arc.degreeDiff` resolves in the corner and bout panels.
 *
 * So: a new field here is safe if it holds plain data. A field holding a class whose behavior
 * lives on the prototype is safe *only* if the calc pass reassigns it — otherwise it works until
 * someone saves and reopens. See the header note in models/types.ts.
 */
export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  clampChannelWidth: number;
  purflingOffset: number | null;
  purflingChannelDepth: number | null;
  innerFlutingDepth: number | null;
  innerFlutingDepth_cBout: number | null;
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
    useCBoutFlutingDepth: boolean;
  },
  ratios: {
    HtoW: number;
    UBtoLB: number;
    U0toUBW: number;
    U1toUBW: number;
    U2toUBW: number;
    U3toLBW: number;
    CBWtoLBW: number;
    C0toLBW: number;
    C0YtoH: number;
    C2toLBW: number;
    C1toLBW: number;
    LBtoH: number;
    L0toLBW: number;
    L1toLBW: number;
    L2toLBW: number;
    L3toLBW: number;
    UCYtoH: number;
    LCYtoH: number;
  };
  arching?: ArchingParams;
}

/** A single named, precalculated SVG path — the shared cache read by export (and eventually render). */
export interface PathEntry {
  key: string;
  path: string;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
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
  clampChannelWidth: 5,
  purflingOffset: null,
  purflingChannelDepth: null,
  innerFlutingDepth: null,
  innerFlutingDepth_cBout: null,
  outerFlutingDepth: null,
  ratios: {
    HtoW: 7 / 4,

    UBtoLB: 4 / 5,
    U0toUBW: 5 / 8,
    U1toUBW: 1 / 3,
    U2toUBW: 1 / 2,
    U3toLBW: 1 / 8,

    CBWtoLBW: 1 / 2,
    C0YtoH: 9 / 16,
    C0toLBW: 4/9,
    C2toLBW: 1 / 12,
    C1toLBW: 1 / 8,

    LBtoH: 4 / 7,
    L0toLBW: 7 / 8,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,

    UCYtoH: 2 / 3,
    LCYtoH: 6 / 15,
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
    V0: null
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
    useCBoutFlutingDepth: false,
  }
}
