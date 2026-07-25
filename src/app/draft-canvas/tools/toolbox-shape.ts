import { Pt } from '../../models/types';

export const DEFAULT_SHAPE_COLOR = '#1d4ed8';

// Properties shared by every shape type, regardless of geometry — extend here
// as more per-object properties (layer, stroke width, ...) are added.
type ShapeBase = {
  id: string;
  color?: string;
};

export type LineShape = ShapeBase & {
  type: 'line';
  start: Pt;
  end: Pt;
  dashed?: boolean;
};

export type ArcShape = ShapeBase & {
  type: 'arc';
  center: Pt;
  radius: number;
  startAngle: number; // radians
  endAngle: number; // radians; sweeps counterclockwise from startAngle — see arc-geometry.ts
  showCenterGuides?: boolean; // "fancy" arc: dashed radius lines + crosshair at center
};

export type CircleShape = ShapeBase & {
  type: 'circle';
  center: Pt;
  radius: number;
  dashed?: boolean;
};

export type DimensionShape = ShapeBase & {
  type: 'dimension';
  start: Pt;
  end: Pt;
};

export type RectShape = ShapeBase & {
  type: 'rect';
  p1: Pt;
  p2: Pt; // opposite corner — the box is axis-aligned between p1 and p2
};

// Extend this union as new tools are added.
export type DraftShape = LineShape | ArcShape | CircleShape | DimensionShape | RectShape;

let shapeIdSeq = 0;

/** Generates a stable-enough unique id for a toolbox shape. */
export function makeShapeId(): string {
  shapeIdSeq += 1;
  return `shape-${Date.now().toString(36)}-${shapeIdSeq.toString(36)}`;
}
