export type Pt = { x: number; y: number };
export type Circle = { x: number; y: number, r: number }
export type Line = { m: number; b: number };
export type Fraction = { n: number; d: number };
export type Axis = "x" | "y";
export type RefImageFit = "fit" | "cover" | "stretch";
export type ReferenceImage = {
  href: string;
  "xlink:href"?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecipeInterface {
    recipeName: string;
    fileName: string;
    version: string;
    params: any;
    calcs: any; 
    referenceImage?: ReferenceImage;
}