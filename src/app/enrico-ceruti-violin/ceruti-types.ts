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
   * When true, the request waits out the debounce even where the parent would
   * otherwise have run it straight away — an arrow-key nudge or a spinner click,
   * both of which the host listeners read as "show me this move".
   *
   * For a panel whose run is a redraw that is exactly right. For one whose run
   * re-solves a surface it is not: a held arrow key would queue a second of work
   * per key repeat and the panel would fall progressively further behind the
   * input. Panels that know their own cost set this and get one recompute at the
   * end of the burst instead. Ignored when `immediate` is set.
   */
  coalesce?: boolean;
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


// ===== Arching model =====
// The gouge is the given: a real tool has one sweep and one depth, and a maker
// just keeps running it, so the channel's section is the same everywhere. What
// gets solved is where the arch stops being the template and starts being the
// transition into the channel — a contact point free to slide along the
// channel's inner flank.
//
// This is the order of operations at the bench, and it is the reverse of the
// obvious one: deriving the channel from the arch instead makes the gouge's
// sweep an output that swings around the body, widest exactly at the corners,
// where no maker's channel widens at all.

/**
 * The gouge that cuts a plate's fluting channel, plus where it runs. A real
 * gouge has one sweep and one depth, so the channel's transverse section is
 * the same everywhere — including through the corners, which the channel
 * bypasses rather than follows.
 */
export interface FlutingParams {
  /** Sweep radius of the gouge (mm). With `depth`, fixes the section entirely. */
  sweepRadius: number;
  /** Depth of the channel at its trough, below the plate outer surface (mm). */
  depth: number;
  /**
   * A second, usually narrower gouge run through the C-bout. Null uses
   * `sweepRadius` throughout.
   *
   * Only the sweep changes: the channel still starts at the same land edge and
   * still cuts to the same `depth`, so what moves is the *inner* edge — a
   * tighter gouge reaches less far in. That is why this is expressible at all.
   * Varying the channel's position instead would mean offsetting the C-bout arc
   * against its neighbours, and while the biarc joins would absorb it, the
   * outer edge would then wander away from the purfling it is cut against.
   */
  sweepRadius_cBout: number | null;
  /**
   * Whether to run the gouge into the corners as a second pass.
   *
   * The channel proper bypasses the corners, leaving a wedge of flat wood
   * between it and the platform boundary — real, and the reason the corner is a
   * separate operation at the bench rather than a distortion of the channel.
   * This carves that wedge, with the cut's outer edge riding the platform
   * boundary the whole way round the corner.
   *
   * A *second cut*, not a redefinition. It only removes material, and only on
   * the channel side of the arch's takeoff, so the channel's structure and
   * everything solved against it upstream are untouched — which is the order of
   * operations at the bench, where the corners are gouged to meet a channel that
   * is already established. Absent reads as on.
   */
  cornerGouge?: boolean;
}

/**
 * A cross-arch control point.
 *
 * Anchored to the crown rather than to the local fluting chord. A point that
 * measures itself against the chord describes a curve that *stretches* station
 * to station, so "the same cross arch" is physically a different shape at the
 * waist than at the widest bout. A template a maker holds against the wood does
 * not stretch. Only the skirt outside the last control point adapts, and that
 * part is solved rather than authored.
 */
export interface CrossArchPoint {
  /**
   * Signed position across the plate as a fraction of this side's own crown:
   * 0 is the *joint*, ±1 the takeoff where the crown runs into the channel.
   * Negative is the bass side.
   *
   * From the joint, not from the crown — the crown may sit off-centre, and a
   * knot is a place on the section rather than an offset from the ridge, so it
   * holds still while the ridge is dialled into place around it. A knot can
   * therefore end up on the far side of the crown from the flank it was
   * authored on; `crossProfile` sorts rather than assuming. The sign only ever
   * says which flank the knot counts its fraction along.
   *
   * The panel shows this as a plain 0–100 across the whole plate with 50 at the
   * joint, which is the reading in which a mirrored pair looks like one.
   *
   * A fraction rather than millimetres, deliberately. Absolute distances make
   * the crown a rigid object of fixed size, and the plate it sits on is not —
   * carried up the body onto a narrower station, a fixed-width crown swells to
   * fill it and the section reads wrong. A fraction is a *shape*, which is what
   * a maker actually carries from station to station.
   *
   * Measured against the takeoff rather than the channel centerline, which is a
   * hair further out. That matters less as description than as arithmetic: the
   * takeoff is solved, so anchoring to the channel instead would let it slide
   * past a knot mid-solve, and a knot leaving the spline steps the very slope
   * the solve is trying to match. See `crossProfile`.
   */
  x: number;
  /** Height as a fraction of the local arch height: 1 is the crown, 0 the plate surface. */
  z: number;
  /** Repeats at −x. Leaving it off confines the point to its own side, which is where asymmetry comes from. */
  mirror?: boolean;
}

/**
 * A cross-arch section shape built from control points: the crown template
 * only. Its peak sits at the long arch's height for that station; its outer end
 * is *not* here, because the takeoff point is solved for tangency against the
 * channel (see `solveArchTakeoff`) rather than entered.
 */
export interface CrossArchSplineShape {
  type: 'spline';
  points: CrossArchPoint[];
  /**
   * Where the crown sits across the plate, as a fraction of the full width
   * between the channel centerlines: 0.5 is the joint, below it the bass side.
   * Absent means 0.5, which is how every template read before this existed.
   * Held well inside 0–1 — the crown has to stay an interior knot.
   *
   * Measured against the *centerline chord* rather than against the solved
   * takeoffs, unlike {@link CrossArchPoint.x}. A knot must not cross the
   * takeoff mid-solve, so it is anchored to it; the crown must not move at all
   * mid-solve, so it is anchored to something the solve does not touch.
   *
   * The position reached where there is arch to carry a ridge, not at every
   * station: toward the caps it eases back onto the joint. See
   * `PEAK_TAPER_DEPTHS` for why that is a matter of the surface holding together
   * rather than a style choice.
   *
   * Real plates rarely peak on the joint, and a scan traced onto a centred
   * crown has to absorb that error somewhere else in the shape.
   */
  peak?: number;
}

/**
 * A cross-arch section shape built from a trochoid. Symmetric by construction —
 * asymmetry lives in the control-point form, where it is a property of the
 * points rather than a second pair of curve settings.
 *
 * `pct` clips the flat cusp, which decides how steeply the crown runs out, and
 * that in turn sets where along the channel flank the tangency lands. A flatter
 * run-out (`pct` near 1) can only meet the channel near its trough.
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

/**
 * A cross-arch shape pinned to one body-length position — either curve
 * type. Split per type rather than left as `CrossArchShape & { y }` so a
 * plate's station list narrows along with the plate: knowing a plate is a
 * trochoid should be enough to read `d` off its stations.
 */
export type CrossArchStation = CrossArchSplineStation | CrossArchCycloidStation;

/**
 * Cross-arch parameters for one plate: a base template anchoring both body
 * ends, plus optional interior stations the shape ramps through.
 *
 * Split by curve type, so a plate's `points` or `d`/`pct` are reachable without
 * a cast once its type is known.
 */
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
  /**
   * The gouge that cuts this plate's fluting channel. Seeded from the outline
   * on first use, so a recipe that predates the panel still opens on a sane
   * tool rather than on nothing.
   */
  fluting?: FlutingParams;
  /** The plate's cross-arch crown. Absent until authored. */
  cross?: CrossArchParams;
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
 * The `Arc`/`Rectangle`-typed fields below are class instances in memory but plain objects on
 * disk, restored by ceruti-calcs.ts before anything renders. So a new field here is safe if it
 * holds plain data; one holding a class whose behavior lives on the prototype is safe *only* if
 * the calc pass reassigns it. See the header note in models/types.ts.
 */
export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  purflingOffset: number | null;
  purflingChannelDepth: number | null;
  /**
   * How far in from the plate edge the carved area begins, in mm. No longer
   * editable — the channel's own reach is an output of the gouge that cuts it,
   * see {@link ChannelPaths.innerEdgeOffset} — but still the band the
   * long arch is spanned across, so it is defaulted on load and read by
   * {@link longArchHeightAt}. Retiring it would recompress every plate's arch,
   * which is a shape decision rather than a cleanup.
   */
  innerFlutingDepth: number | null;
  /**
   * Distance from the plate edge in to the edge of the flat land, where the
   * channel starts. Live and current: it is what the gouge's outer flank is
   * anchored to, set in the Fluting Channel panel as Land Edge.
   */
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

/**
 * The keys the shared path cache can hold. Enumerated rather than left as a
 * bare string because the cache is filled by `ensure*` and read by `getPath`,
 * which asserts — so a typo used to be a runtime crash on a panel nobody had
 * opened yet. `purfling`/`outerPurfling` are the two that can legitimately be
 * absent; read those through `getPathOrNull`.
 */
export type PathKey = 'inner' | 'top' | 'back' | 'purfling' | 'outerPurfling';

/** A single named, precalculated SVG path — the shared cache read by export (and eventually render). */
export interface PathEntry {
  key: PathKey;
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
