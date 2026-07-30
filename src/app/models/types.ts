export class Pt { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } };
export class Circle { x: number; y: number; r: number; constructor(x: number, y: number, r: number) { this.x = x; this.y = y; this.r = r; } }
export class Line { m: number; b: number; constructor(m: number, b: number) { this.m = m; this.b = b; } }
export class Rectangle { Pt1: Pt; Pt2: Pt; height: number | null; width: number | null;
  constructor(Pt1: Pt, Pt2: Pt) { this.Pt1 = Pt1; this.Pt2 = Pt2; this.height = Math.abs(Pt2.y - Pt1.y); this.width = Math.abs(Pt2.x - Pt1.x); } 
}
export class Fraction { n: number; d: number; constructor(n: number, d: number) { this.n = n; this.d = d; } }

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