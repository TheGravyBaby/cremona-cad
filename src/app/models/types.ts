export class Pt { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } };
export class Circle { x: number; y: number; r: number; constructor(x: number, y: number, r: number) { this.x = x; this.y = y; this.r = r; } }
export class Line { m: number; b: number; constructor(m: number, b: number) { this.m = m; this.b = b; } }
export class Rectangle { Pt1: Pt; Pt2: Pt; constructor(Pt1: Pt, Pt2: Pt) { this.Pt1 = Pt1; this.Pt2 = Pt2; } }
export class Fraction { n: number; d: number; constructor(n: number, d: number) { this.n = n; this.d = d; } }

export class Arc extends Circle { 
  start: number; 
  end: number; 

  constructor(x:number, y:number, r:number, start?: number, end?: number){
    super(x, y, r);
    this.start = start ?? 0;
    this.end = end ?? Math.PI*2;
  };
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
export type RefImageFit = "fit" | "cover" | "stretch";
export type ReferenceImage = {

  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg?: number;
  "xlink:href"?: string;
  href: string;
}

export interface RecipeInterface {
    recipeName: string;
    fileName: string;
    version: string;
    params: any;
    paths: any; 
    referenceImage?: ReferenceImage;
}