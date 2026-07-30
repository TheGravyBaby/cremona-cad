/**
 * ## Prototypes here are not durable — the calc pass restores them
 *
 * `Circle`, `Arc` and `Rectangle` instances are stored inside `EnricoCerutiParams` (see
 * ceruti-types.ts: `button`, `bouts.U0`, `outerCorners.*`, ...), and params are JSON-serialized
 * into recipe files. `JSON.parse` returns **plain objects with no prototype**, so on load every
 * one of these arrives as bare data — `instanceof` is false and any class member that isn't an
 * own data property is gone.
 *
 * What keeps that from being visible is ceruti-calcs.ts: it reassigns essentially every arc
 * through `new Arc` / `arcFromCircle*` / `offsetArcRadius` / `redefineArcCircle` before anything
 * renders, so real instances exist by the time a template binds to one. `Arc.degreeDiff` below is
 * a getter, and ~13 number inputs across the corner/bout panels depend on exactly that.
 *
 * Two rules follow, and breaking either fails only after a save-and-reopen:
 *  - Don't add a getter or method to these classes unless the calc pass reassigns every field
 *    that holds one. A plain data field is always safe; a prototype member is not.
 *  - Don't reuse these classes across a serialization boundary that has no calc pass. The
 *    draft-canvas toolbox is exactly such a boundary — see DraftShape in
 *    draft-canvas/tools/toolbox-shape.ts, a deliberately method-free plain-object union, because
 *    ToolboxStore round-trips it through sessionStorage on every edit and onto an undo stack.
 *    Sharing geometry *math* across the two is fine and encouraged (helpers/draftMath.ts);
 *    sharing these *types* is not.
 *
 * The same reasoning makes the field names below effectively frozen: `Pt1`/`Pt2` and `start`/`end`
 * appear verbatim in every saved recipe, so renaming them needs a loader migration.
 */
export class Pt { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } };
export class Circle { x: number; y: number; r: number; constructor(x: number, y: number, r: number) { this.x = x; this.y = y; this.r = r; } }
/**
 * An **infinite** line in slope-intercept form (y = mx + b) — not a segment, and deliberately not
 * interchangeable with draft-canvas's `LineShape`, which is a bounded start→end segment. Kept
 * distinct because the two answer different questions: this one is for intersection/solving
 * (see lineFromTwoPoints, renderDashLineMxB), a segment is for drawing and hit-testing.
 *
 * Note that most segment-flavored math in helpers/draftMath.ts (offsetLineByDistance,
 * distPointToSegment) takes two points rather than this type.
 */
export class SlopeInterceptLine { m: number; b: number; constructor(m: number, b: number) { this.m = m; this.b = b; } }
export class Rectangle { Pt1: Pt; Pt2: Pt; height: number | null; width: number | null;
  constructor(Pt1: Pt, Pt2: Pt) { this.Pt1 = Pt1; this.Pt2 = Pt2; this.height = Math.abs(Pt2.y - Pt1.y); this.width = Math.abs(Pt2.x - Pt1.x); } 
}
export class Fraction { n: number; d: number; constructor(n: number, d: number) { this.n = n; this.d = d; } }

/**
 * ## Minor-sweep convention — the opposite of draft-canvas's ArcShape
 *
 * `start`/`end` are boundary angles in radians, and every renderer of this type draws the
 * **minor (<=180°) arc between them**, whichever way round that is: pathFromArc hardcodes
 * `largeArcFlag = 0` and picks `sweepFlag` from the sign of the span; renderArcFromArc does the
 * same. Swapping `start` and `end` therefore does *not* select the other arc — it draws the same
 * curve. Getting the major arc requires an out-of-band argument (`renderArcFromArc`'s `longArc`),
 * which means an Arc value alone does not determine what appears on screen.
 *
 * draft-canvas's `ArcShape` stores the same four numbers under `center`/`radius`/`startAngle`/
 * `endAngle` and means something different by them: `arcPathData` sweeps **strictly
 * counterclockwise** from start to end, so the ordering itself chooses minor vs major and the
 * value is self-contained. That is why the Arc/Tangent-arc/Join-arc tools can draw >180° sweeps
 * and this type cannot.
 *
 * The two are deliberately not unified. Converting an ArcShape into this type is lossy whenever
 * its sweep exceeds 180°, so don't write a blind converter between them — go through the
 * renderers' own flags instead.
 */
export class Arc extends Circle {
  start: number;
  end: number;

  constructor(x:number, y:number, r:number, start?: number, end?: number){
    super(x, y, r);
    this.start = start ?? 0;
    this.end = end ?? Math.PI*2;
  };

  /** The magnitude of the angular span of this arc in degrees. */
  get degreeDiff(): number {
    return Math.round((this.end - this.start) * (180 / Math.PI));
  }
}

/**
 * Adjusts the arc's `start` angle so that (end − start) equals `degrees`.
 * The `end` angle is kept fixed.
 */
export function setArcStartByDegreeDiff(arc: Arc, degrees: number): void {
  arc.start = arc.end - degrees * (Math.PI / 180);
}

/**
 * Adjusts the arc's `end` angle so that (end − start) equals `degrees`.
 * The `start` angle is kept fixed.
 */
export function setArcEndByDegreeDiff(arc: Arc, degrees: number): void {
  arc.end = arc.start + degrees * (Math.PI / 180);
}

export function arcFromCircle(circle: Circle, start?: number, end?: number): Arc {
  return new Arc(circle.x, circle.y, circle.r, start, end);
}

export function arcFromCircleAndPoints(circle: Circle, startPt: Pt, endPt: Pt): Arc {
  let startAngle = Math.atan2(startPt.y - circle.y, startPt.x - circle.x);
  let endAngle = Math.atan2(endPt.y - circle.y, endPt.x - circle.x);
  return new Arc(circle.x, circle.y, circle.r, startAngle, endAngle);
}


export type Axis = "x" | "y";
export type ReferenceImage = {

  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  "xlink:href"?: string;
  href: string;
}

/**
 * One reference image as it appears in a recipe file or a built-in template — the durable,
 * on-disk form. Converted to and from the canvas's own `ImageShape` by
 * draft-canvas/tools/reference-image-schema.ts, which is the only code that should touch this
 * type. Every field past `href`/`x`/`y`/`width`/`height` is optional so the templates and saved
 * files that predate it keep loading unchanged.
 */
export type NamedReferenceImage = ReferenceImage & {
  id?: string;
  label?: string;
  /** Render opacity, 0–1. Was a single global setting; now per-image. Omitted means the default. */
  opacity?: number;
  /** Whether near-white pixels are faded out for dark-mode legibility. Omitted means on, which
   * is what this did unconditionally before it became a toggle. */
  suppressWhite?: boolean;
  /** Mirrors the image content left-right about its own center. Omitted means unmirrored. */
  mirrored?: boolean;
  /** Hidden from the canvas. Omitted means visible. */
  hidden?: boolean;
  /** Protected from being selected or dragged on the canvas. **Omitted means locked** — every
   * template and every file saved before this field existed should open protected rather than
   * one stray click away from a nudged reference. */
  locked?: boolean;
}

export interface RecipeInterface {
    recipeName: string;
    fileName: string;
    version: string;
    params: any;
    paths: any;
    /** @deprecated legacy single-image field; migrated into `referenceImages` on load. */
    referenceImage?: ReferenceImage;
    referenceImages?: NamedReferenceImage[];
    /** Shapes drawn with the draft-canvas toolbox — see ToolboxStore.exportState/loadState.
     * Untyped here (rather than importing DraftShape) to avoid a models/types.ts <-> draft-canvas
     * circular import; recipe-base.ts is the only code that reads/writes it. */
    toolboxState?: object;
}