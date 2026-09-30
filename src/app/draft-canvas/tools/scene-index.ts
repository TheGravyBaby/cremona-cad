import { Injectable } from '@angular/core';
import { Pt } from '../../models/types';
import { RecordableLayer, RecordedElement, recordLayers } from '../../helpers/layer-recorder';
import {
  IDENTITY_MATRIX, Matrix2D, applyMatrix, arcCenterFromEndpoints, multiplyMatrices, parseSvgTransform, transformPath,
} from '../../helpers/math/pathMath';
import { angleFromCenter } from '../../helpers/math/simpleGeometry';
import { DraftShape } from './toolbox-shape';
import { absolutePathData, tokenizePathData } from './svg-path-arcs';

// distributes over the union, which a plain ShapeBody would collapse
type ShapeBody = DraftShape extends infer S ? (S extends DraftShape ? Omit<S, 'id'> : never) : never;

/**
 * The recipe's rendered geometry as read-only DraftShapes, so a piece of the instrument can be
 * hit-tested, haloed, read off in the settings bar and duplicated with the same code that serves
 * drawn shapes — without the recipe knowing any of this is happening.
 *
 * Built by running the recipe's render layers through helpers/layer-recorder.ts rather than by
 * reading the DOM: the recorder is DOM-free, so this works in a test, and it sees a layer's
 * output as a tree, so a `transform` on an enclosing group (body-section.render.ts turns the
 * side elevation this way) is composed into every child's geometry.
 *
 * Rebuilt lazily: setLayers only marks the index stale, and nothing runs the layers again until
 * something asks for shapes — a Select-mode click, a marquee, a selection that holds a scene ref.
 * The recipe re-emits on every hover and keystroke, and most of those never get asked.
 *
 * Ids are fingerprints of the geometry, so a selection survives a re-render that drew the same
 * arc again, and drops when the params moved it — the honest thing for derived geometry.
 */
@Injectable({ providedIn: 'root' })
export class SceneStore {
  private layers: RecordableLayer[] = [];
  private dirty = true;
  private cached: DraftShape[] = [];
  private listeners = new Set<() => void>();

  setLayers(layers: RecordableLayer[]): void {
    this.layers = layers;
    this.dirty = true;
    this.notify();
  }

  get shapes(): DraftShape[] {
    if (this.dirty) {
      this.cached = sceneShapesFromLayers(this.layers);
      this.dirty = false;
    }
    return this.cached;
  }

  find(id: string): DraftShape | undefined {
    return this.shapes.find(s => s.id === id);
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }
}

/** Every shape the layers draw into world space, decoration and labels left out. A layer that
 * throws contributes nothing rather than taking the rest down with it. */
export function sceneShapesFromLayers(layers: RecordableLayer[]): DraftShape[] {
  const shapes: DraftShape[] = [];
  const seen = new Map<string, number>();
  for (const layer of layers) {
    let elements: RecordedElement[];
    try {
      elements = recordLayers([layer]).elements;
    } catch {
      continue;
    }
    for (const el of elements) {
      if (el.layer !== 'g' || isDecoration(el)) continue;
      const shape = shapeFromElement(el, composedTransform(el));
      if (!shape) continue;
      const key = fingerprint(shape);
      const ordinal = seen.get(key) ?? 0;
      seen.set(key, ordinal + 1);
      shapes.push({ ...shape, id: `scene-${key}${ordinal ? `-${ordinal}` : ''}` } as DraftShape);
    }
  }
  return shapes;
}

// text is a label, a group is a container, and the rest never come out of a render
const GEOMETRY_TAGS = new Set(['path', 'line', 'circle', 'rect', 'polygon', 'polyline']);

// halos, crosshairs and section banding are marked where they're drawn (renderFuncs.ts's
// data-decoration); data-no-snap is the toolbox renderer's own mark for the same idea
function isDecoration(el: RecordedElement): boolean {
  if (!GEOMETRY_TAGS.has(el.tag)) return true;
  for (let node: RecordedElement | undefined = el; node; node = node.parent) {
    if ('data-decoration' in node.attrs || 'data-no-snap' in node.attrs) return true;
  }
  return el.attrs['stroke'] === 'none' && (el.attrs['fill'] === 'none' || el.attrs['fill'] === undefined);
}

export function composedTransform(el: RecordedElement): Matrix2D {
  const chain: RecordedElement[] = [];
  for (let node: RecordedElement | undefined = el; node; node = node.parent) chain.unshift(node);
  let m = IDENTITY_MATRIX;
  for (const node of chain) {
    const t = node.attrs['transform'];
    if (typeof t === 'string' && t) m = multiplyMatrices(m, parseSvgTransform(t));
  }
  return m;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function isRotated(m: Matrix2D): boolean {
  return Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9;
}

function pointsPath(points: Pt[], close: boolean): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (close ? ' Z' : '');
}

// colour is deliberately left off: a scene shape is never drawn through shape-renderer.ts, and
// a duplicate of one should take the pen colour like any newly drawn shape. Also the reader
// shape-svg.ts's import goes through, which adds the colour back itself.
export function shapeFromElement(el: RecordedElement, m: Matrix2D): ShapeBody | null {
  const a = el.attrs;
  const dashed = typeof a['stroke-dasharray'] === 'string' && a['stroke-dasharray'] !== '' ? true : undefined;
  switch (el.tag) {
    case 'line': {
      const start = applyMatrix(m, { x: num(a['x1']), y: num(a['y1']) });
      const end = applyMatrix(m, { x: num(a['x2']), y: num(a['y2']) });
      return { type: 'line', start, end, dashed };
    }
    case 'circle': {
      const radius = num(a['r']) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      if (radius <= 0) return null;
      return { type: 'circle', center: applyMatrix(m, { x: num(a['cx']), y: num(a['cy']) }), radius, dashed };
    }
    case 'rect': {
      const x = num(a['x']), y = num(a['y']), w = num(a['width']), h = num(a['height']);
      if (w <= 0 || h <= 0) return null;
      const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(p => applyMatrix(m, p));
      if (isRotated(m)) return { type: 'path', d: pointsPath(corners, true), dashed };
      // low corner to high corner, whichever way the matrix turned the box
      const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
      return {
        type: 'rect', dashed,
        p1: { x: Math.min(...xs), y: Math.min(...ys) },
        p2: { x: Math.max(...xs), y: Math.max(...ys) },
      };
    }
    case 'polygon':
    case 'polyline': {
      const nums = String(a['points'] ?? '').trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);
      const points: Pt[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push(applyMatrix(m, { x: nums[i], y: nums[i + 1] }));
      if (points.length < 2) return null;
      return { type: 'path', d: pointsPath(points, el.tag === 'polygon'), dashed };
    }
    case 'path': {
      const raw = typeof a['d'] === 'string' ? a['d'] : '';
      if (!raw.trim()) return null;
      const d = transformPath(absolutePathData(raw), m);
      return arcFromPathData(d) ?? lineFromPathData(d) ?? { type: 'path', d, dashed };
    }
  }
  return null;
}

/** `M x y A r r rot large sweep x y` and nothing else — the form renderArcFromArc and every
 * arc tool emit — as an ArcShape. A sweep of 1 runs counterclockwise from the first point in
 * this Y-up world, which is ArcShape's own direction; a sweep of 0 is the same arc walked the
 * other way, so its ends swap. */
function arcFromPathData(d: string): ShapeBody | null {
  const cmds = tokenizePathData(d);
  if (cmds.length !== 2 || cmds[0].type !== 'M' || cmds[1].type !== 'A') return null;
  const [rx, ry, , large, sweep, ex, ey] = cmds[1].args;
  if (Math.abs(rx - ry) > 1e-6 || rx <= 0) return null;
  const start = { x: cmds[0].args[0], y: cmds[0].args[1] };
  const end = { x: ex, y: ey };
  const center = arcCenterFromEndpoints(start, end, rx, large, sweep);
  const startAngle = angleFromCenter(center, start);
  const endAngle = angleFromCenter(center, end);
  return sweep
    ? { type: 'arc', center, radius: rx, startAngle, endAngle }
    : { type: 'arc', center, radius: rx, startAngle: endAngle, endAngle: startAngle };
}

function lineFromPathData(d: string): ShapeBody | null {
  const cmds = tokenizePathData(d);
  if (cmds.length !== 2 || cmds[0].type !== 'M' || cmds[1].type !== 'L') return null;
  return {
    type: 'line',
    start: { x: cmds[0].args[0], y: cmds[0].args[1] },
    end: { x: cmds[1].args[0], y: cmds[1].args[1] },
  };
}

// djb2 over the geometry, so the same arc drawn on the next render keeps its id and a moved one
// gets a new one. Rounded so floating-point noise between two solves of the same params can't
// change it.
function fingerprint(shape: ShapeBody): string {
  const text = JSON.stringify(shape, (_, v) => typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}
