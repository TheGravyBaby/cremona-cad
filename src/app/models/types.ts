export class Pt { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } };
export class Circle { x: number; y: number; r: number; constructor(x: number, y: number, r: number) { this.x = x; this.y = y; this.r = r; } }
export class Line { m: number; b: number; constructor(m: number, b: number) { this.m = m; this.b = b; } }
export class Rectangle { Pt1: Pt; Pt2: Pt; constructor(Pt1: Pt, Pt2: Pt) { this.Pt1 = Pt1; this.Pt2 = Pt2; } }
export class Fraction { n: number; d: number; constructor(n: number, d: number) { this.n = n; this.d = d; } }

export type Axis = "x" | "y";
export type RefImageFit = "fit" | "cover" | "stretch";
export type ReferenceImage = {

  x: number;
  y: number;
  width: number;
  height: number;
  "xlink:href"?: string;
  href: string;
}

export interface RecipeInterface {
    recipeName: string;
    fileName: string;
    version: string;
    params: any;
    calcs: any; 
    referenceImage?: ReferenceImage;
}