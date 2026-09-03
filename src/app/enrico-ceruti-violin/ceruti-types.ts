import { Arc, Circle, NamedReferenceImage, Pt, Rectangle, ReferenceImage } from "../models/types";

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
    /** Whether each f-hole arm is split in two — off, the second arc stands in for both. */
    upperArmDoubleArc?: boolean;
    lowerArmDoubleArc?: boolean;
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
  /**
   * Rib height at the lower end of the body, and at the upper. Classical ribs
   * taper — they are planed down toward the upper block once the back is glued
   * on — so the back's gluing plane stays square to the body while the top's
   * tilts. Both are measured perpendicular to the rib's own top edge, which is
   * how a caliper reads the stock; `ribHeightAt` in ceruti-arching.ts converts
   * that to a vertical height above the back plane.
   */
  ribHeightLower: number;
  ribHeightUpper: number;
  top: ArchPlate;
  bottom: ArchPlate;
}

/**
 * One f-hole, named by where each piece is drawn rather than by which contour solves it.
 *
 * The hole has two edges, and each runs the whole length of it: the one springing off the upper
 * eye crosses to the outer stem edge and ends at a tip beside the *lower* eye, and the other is
 * that construction turned half a turn. So an edge is not a thing you can point at on the
 * drawing, and naming after it puts the upper contour's wing down at the bottom of the picture.
 *
 * `upper` and `lower` instead hold what is drawn at each end of the hole — which means each one
 * carries an arm off one edge and the far edge's wing, sitting side by side the way they do on
 * the plate. The crossing lives in the solver, where it is a fixed rule, instead of in the names.
 */
export interface FholeParams {
  upper: FholeEnd;
  lower: FholeEnd;
  stem: FholeStem;
}

/** One end of the hole: an eye, the arm springing off it, and the far edge's wing reaching back
 * up beside that same eye. Everything here is drawn within its own third of the drawing. */
export interface FholeEnd {
  eye: Circle | null;
  /** How far past the eye the hole bulges — the gap between the eye and the bound the shoulder
   * is tangent to, so it sets the widest point of this end. */
  rise: number | null;

  /** Tangent to both the eye and the bound, so its radius alone places it. */
  shoulder: Arc | null;
  arm: Arc | null;
  /** The arm's second half, present only when this end's arm is compound. */
  arm2: Arc | null;

  /** The flared blade past the stem. Its radius and its own two boundary angles are its whole
   * shape; hanging its far end on `tip` is what places it. */
  wing: Arc | null;
  /** The straight cut that closes the outline back into the eye, and so places the tip. */
  cut: FholeCut | null;
  /** Where the wing stops and the cut begins. SOLVED from `cut` — kept so renders and exports
   * needn't re-derive it. */
  tip: Pt | null;
}

/**
 * The straight cut closing one end of the hole: it runs from a point on the eye out to the wing's
 * tip, and the eye's own rim carries the outline the rest of the way round to the shoulder.
 *
 * Where the cut starts and how far it runs are measured against the eye it is cut into, so the
 * contour holds its shape wherever the placement panel puts that eye. The datum for `at` is the
 * ray toward the *other* eye — the hole's own axis, fixed once the eyes are placed and unmoved by
 * anything the contour panel does. Which way the cut runs is a plain plate angle; see `slope`.
 */
export interface FholeCut {
  /** Where on the eye the cut lands, round from the ray toward the other eye. */
  at: number | null;
  /** Which way the cut runs, as a plain angle in the plate's own frame — the one number here that
   * is not measured against the eye, deliberately: a slope read off the drawing has to keep its
   * meaning while `at` slides the cut around the eye, or the two fields fight each other. It must
   * still point out of the eye rather than back across it. */
  slope: number | null;
  /** How far the cut runs, from the eye out to the tip. */
  length: number | null;
}

/**
 * The straight middle, and the four arcs that get onto and off it. Each edge of the hole lands on
 * one side of the stem and stays there — arrives, runs straight, leaves — so `outer*` is the whole
 * passage of the contour from the upper eye and `inner*` the passage of the other.
 *
 * These four are the only arcs in the model with no number of their own: the stem line uses up the
 * last freedom in each, which is why they draw in the stem's colour rather than either end's.
 */
export interface FholeStem {
  center: Pt | null;
  width: number | null;
  /** Which way the stem runs, as a plain plate angle in radians — 90° stands it upright, and a
   * violin's leans a few degrees past that. An angle rather than the run-per-rise it replaced in
   * September 2026: a maker reads a stem off the drawing with a bevel, and every other angle in
   * this model is already radians here and degrees in the field. Geometry wants the run, not the
   * angle — take it from `stemRun`. */
  angle: number | null;

  outerUpper: Arc | null;
  outerLower: Arc | null;
  innerUpper: Arc | null;
  innerLower: Arc | null;
}

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
  /** The f-hole's two zones — everything drawn near the upper eye vs. near the lower one,
   * independent of which eye's arc chain it's mathematically part of. */
  fHoleUpper: string;
  fHoleUpperOff: string;
  fHoleLower: string;
  fHoleLowerOff: string;
  fHoleStem: string;
  fHoleStemOff: string;
  /** The cut is a straight edge rather than an arc, so it is coloured away from either zone —
   * warm at the top end, cool-yellow at the bottom, the same pair the center bout uses. */
  fHoleCutUpper: string;
  fHoleCutLower: string;
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
 * The view flags the shared toggle bar has a button for. Each panel names the ones it offers in
 * a `static readonly renderToggles: readonly RenderToggleKey[]`; the bar's own template fixes
 * the order they appear in, so the strip reads the same from every panel.
 *
 * Static, and collected into `CerutiViolin.panelOrder` rather than read off the mounted panel:
 * a view query for the open panel resolves *after* the bar's own binding has been evaluated, so
 * reading it there throws NG0100 the moment you switch panels. Both `@ViewChild` and signal
 * `viewChild()` do this — don't "simplify" it back. There is deliberately no default on
 * `CerutiPanelBase`: a panel that declares none should fail the build at `panelOrder`, not
 * inherit an empty list and quietly show no bar.
 */
export type RenderToggleKey = 'showModuleArcs' | 'showAllArcs' | 'showModuleCircles'
  | 'showAllCircles' | 'showModuleGuides' | 'showBlocks' | 'showInnerPath' | 'renderOuterPath';

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
  points: ArchSplinePoint[]; // interior points only, t strictly in (0, 1), in the order the panel lists them
  /**
   * Which row of the panel's table the peak is listed in — the number of
   * control points above it, 0 (the default when absent) putting it first.
   *
   * Presentation, like the order of `points` itself: the knot builder sorts by
   * position before interpolating anything. It is saved because the table is
   * something the maker arranges, and an arrangement that came back scrambled
   * after a reopen would be worse than not offering one.
   */
  peakRow?: number;
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
  /**
   * Which row of the panel's table the crown is listed in — the number of
   * knots above it, 0 (the default when absent) putting it first. Presentation
   * only, exactly as in {@link ArchSpline.peakRow}.
   */
  peakRow?: number;
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

/**
 * What a bundled instrument *is*, as distinct from what it measures — the maker, the object, and
 * the public record it can be checked against.
 *
 * Kept off `params`, which is the frozen geometry contract, and off the reference images, which
 * carry their own licence separately (see `ImageCredit`). Bout measurements are facts and carry
 * no copyright while a photograph is expression and does, so an instrument's record and its
 * photograph's terms are recorded apart rather than as one provenance.
 *
 * Absent on the blank template and on anything a user saved themselves.
 */
/**
 * Every drafting panel, in bench order. Declared here rather than only in `ceruti-violin.ts`
 * because panel ids became file-format vocabulary the moment a reference image could scope itself
 * to particular panels (`NamedReferenceImage.panels`) — a template's saved JSON now names them,
 * so a renamed panel is a migration, not a rename.
 *
 * `panelOrder` in `ceruti-violin.ts` is typed against this, so the two can't drift: adding a panel
 * there without adding its id here fails the build.
 */
export const CERUTI_PANEL_IDS = [
  'base', 'mainBouts', 'corners', 'centerBout', 'outerTrace',
  'fluting', 'longArching', 'crossArching', 'fHolePlacement', 'fHoleContours', 'mould', 'export',
] as const;

export type CerutiPanelId = typeof CERUTI_PANEL_IDS[number];

export interface TemplateMeta {
  maker: string;
  /** The instrument, named as the record names it — 'Violin "Ole Bull"', 'Viola'. */
  instrument: string;
  /** As published: '1669', 'c.1730', '1610-20'. A string, not a year, because most are ranges
   * or attributions rather than a date. */
  date: string;
  /** The public catalogue entry this instrument is drawn from, so a number can be rechecked. */
  record: {
    source: 'met' | 'si' | 'loc' | 'other';
    /** The institution's own object id — Met 898377, SI nmah_833906, LoC ihas.200154811. */
    objectId: string;
    url: string;
  };
  /** Anything a reader of the numbers needs and the fields above don't say. */
  notes?: string;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
  /** Provenance of the instrument this template is drawn from — see TemplateMeta. */
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
    FUtoL: 4/5,
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
    upperArmDoubleArc: false,
    lowerArmDoubleArc: false,
    ucCornerSharpness: 0,
    lcCornerSharpness: 0,
  }
}
