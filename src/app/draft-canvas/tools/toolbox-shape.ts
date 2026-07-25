import { Pt } from '../../models/types';

export type LineShape = {
  id: string;
  type: 'line';
  start: Pt;
  end: Pt;
};

export type ArcShape = {
  id: string;
  type: 'arc';
  center: Pt;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians; sweeps counterclockwise from startAngle — see arc-geometry.ts
};

// Extend this union as new tools are added (e.g. CircleShape, RectShape).
export type DraftShape = LineShape | ArcShape;

let shapeIdSeq = 0;

/** Generates a stable-enough unique id for a toolbox shape. */
export function makeShapeId(): string {
  shapeIdSeq += 1;
  return `shape-${Date.now().toString(36)}-${shapeIdSeq.toString(36)}`;
}
