import { Arc } from '../models/types';

// the whole model: three radii and the length they have to fit in
export interface FourCirclesParams {
  bodyLength: number;
  upperR: number;
  centerR: number;
  lowerR: number;
}

export const FOUR_CIRCLES_DEFAULTS: FourCirclesParams = {
  bodyLength: 355,
  upperR: 84,
  centerR: 50,
  lowerR: 104,
};

// the right half only: three arcs, each still carrying the circle it was cut from. the left is a
// mirror, taken at draw time with the flip*AboutY helpers
export interface FourCircles {
  upper: Arc;
  center: Arc;
  lower: Arc;
}

export interface FourCirclesViewFlags {
  showCircles: boolean;
  showArcs: boolean;
}
