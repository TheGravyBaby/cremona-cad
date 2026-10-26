import { Pt } from '../../models/types';
import { makeNaturalSpline, polylineCumulativeLengths } from '../../helpers/math/vibeMath';
import { pointOnCircle, normalizeRadians, TURN } from '../../helpers/math/simpleGeometry';
import { DxfEntity, DxfText, buildDxfFile, pathToDxfEntities } from '../../helpers/dxfExporter';
import { DEFAULT_TEXT_SIZE_MM, DraftShape, angleSweep, dimensionGeometry } from './toolbox-shape';
import {
  SECTION_THICKNESS_MM, TEXT_LINE_HEIGHT_RATIO, curveDivisions, freehandPathData, tickLengthMm,
} from './shape-renderer';

/**
 * Drawn shapes as a DXF file and back, for a CNC or CAD package: the geometry shape-svg.ts
 * writes, without colour, weight or groups. Arcs and circles go out as true arcs, each shape on
 * the DXF layer `layerOf` names. World and DXF are both Y-up, so nothing flips.
 *
 * Reading back is geometry only, as from any other program: a dimension returns as its lines and
 * label, not as a dimension. Blocks (INSERT) are not expanded.
 */

type Out = { entities: DxfEntity[]; texts: DxfText[] };

const deg = (rad: number): number => normalizeRadians(rad) / TURN.degree;

export function shapesToDxf(shapes: DraftShape[], layerOf: (shape: DraftShape) => string | undefined = () => undefined): string {
  const out: Out = { entities: [], texts: [] };
  for (const shape of shapes) {
    const layer = layerOf(shape);
    const before = { entities: out.entities.length, texts: out.texts.length };
    shapeToDxf(shape, out);
    for (const e of out.entities.slice(before.entities)) e.layer = layer;
    for (const t of out.texts.slice(before.texts)) t.layer = layer;
  }
  return buildDxfFile(out.entities, out.texts);
}

function line(out: Out, a: Pt, b: Pt): void {
  out.entities.push({ type: 'LINE', x0: a.x, y0: a.y, x1: b.x, y1: b.y });
}

function polyline(out: Out, points: Pt[], closed = false): void {
  for (let i = 1; i < points.length; i++) line(out, points[i - 1], points[i]);
  if (closed && points.length > 2) line(out, points[points.length - 1], points[0]);
}

function arc(out: Out, center: Pt, r: number, startAngle: number, endAngle: number): void {
  out.entities.push({ type: 'ARC', cx: center.x, cy: center.y, r, startAngleDeg: deg(startAngle), endAngleDeg: deg(endAngle) });
}

// DXF TEXT is one line, so a multi-line text is stacked, centred about its anchor as the canvas draws it
function text(out: Out, position: Pt, body: string, height: number, rotationDeg: number, align?: 'left'): void {
  const rows = body.split('\n');
  const step = height * TEXT_LINE_HEIGHT_RATIO;
  const up = { x: -Math.sin(rotationDeg * TURN.degree), y: Math.cos(rotationDeg * TURN.degree) };
  rows.forEach((row, i) => {
    const k = ((rows.length - 1) / 2 - i) * step;
    if (row) out.texts.push({ text: row, x: position.x + up.x * k, y: position.y + up.y * k, height, rotationDeg, align });
  });
}

function shapeToDxf(shape: DraftShape, out: Out): void {
  switch (shape.type) {
    case 'line':
      return line(out, shape.start, shape.end);
    case 'circle':
      out.entities.push({ type: 'CIRCLE', cx: shape.center.x, cy: shape.center.y, r: shape.radius });
      return;
    case 'arc':
      return arc(out, shape.center, shape.radius, shape.startAngle, shape.endAngle);
    case 'rect': {
      const { p1, p2 } = shape;
      return polyline(out, [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }], true);
    }
    case 'path':
      out.entities.push(...pathToDxfEntities(shape.d));
      return;
    case 'freehand':
      out.entities.push(...pathToDxfEntities(freehandPathData(shape.points)));
      return;
    case 'point':
      out.entities.push({ type: 'POINT', x: shape.position.x, y: shape.position.y });
      return;
    case 'text':
      return text(out, shape.position, shape.text, shape.fontSize ?? DEFAULT_TEXT_SIZE_MM, shape.rotationDeg ?? 0, 'left');
    case 'dimension': {
      const geo = dimensionGeometry(shape.start, shape.end, shape.offset);
      if (!geo) return;
      line(out, geo.p1, geo.p2);
      line(out, shape.start, geo.p1);
      line(out, shape.end, geo.p2);
      const angle = Math.atan2(geo.dir.y, geo.dir.x) / TURN.degree;
      const upright = angle > 90 || angle <= -90 ? angle + 180 : angle;
      return text(out, { x: geo.mid.x + geo.normal.x * 2, y: geo.mid.y + geo.normal.y * 2 }, `${geo.length.toFixed(1)} mm`, 3, upright, 'left');
    }
    case 'angle': {
      const { startAngle, sweep } = angleSweep(shape.vertex, shape.start, shape.end);
      line(out, shape.vertex, shape.start);
      line(out, shape.vertex, shape.end);
      arc(out, shape.vertex, shape.radius, startAngle, startAngle + sweep);
      const labelPos = pointOnCircle({ ...shape.vertex, r: shape.radius + 2 }, startAngle + sweep / 2);
      // %%d is DXF's degree sign: R12 text isn't reliably UTF-8
      return text(out, labelPos, `${(sweep / TURN.degree).toFixed(1)}%%d`, 3, 0, 'left');
    }
    case 'curve-length': {
      const [first, mid, last] = curveDivisions(shape.points, [1, 1]);
      if (!mid) return;
      polyline(out, shape.points);
      for (const d of [first, last]) line(out, { x: d.at.x - d.normal.x, y: d.at.y - d.normal.y }, { x: d.at.x + d.normal.x, y: d.at.y + d.normal.y });
      return text(out, { x: mid.at.x + mid.normal.x * 2, y: mid.at.y + mid.normal.y * 2 }, `${shape.length.toFixed(1)} mm`, 3, 0, 'left');
    }
    case 'curve-ticks': {
      const divisions = curveDivisions(shape.points, shape.weights.filter(w => Number.isFinite(w) && w > 0));
      if (divisions.length === 0) return;
      polyline(out, shape.points);
      const half = tickLengthMm(polylineCumulativeLengths(shape.points).at(-1)!) / 2;
      for (const { at, normal } of divisions) {
        line(out, { x: at.x + normal.x * half, y: at.y + normal.y * half }, { x: at.x - normal.x * half, y: at.y - normal.y * half });
      }
      return;
    }
    case 'section':
    case 'ticks': {
      const dx = shape.end.x - shape.start.x, dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy);
      const weights = shape.weights.filter(w => Number.isFinite(w) && w > 0);
      const total = weights.reduce((a, b) => a + b, 0);
      if (len < 1e-6 || total <= 0) return;
      const ux = dx / len, uy = dy / len;
      const half = shape.type === 'section' ? SECTION_THICKNESS_MM / 2 : tickLengthMm(len) / 2;
      const at = (t: number, side: number): Pt => ({ x: shape.start.x + ux * t - uy * half * side, y: shape.start.y + uy * t + ux * half * side });
      if (shape.type === 'ticks') line(out, shape.start, shape.end);
      // a section's bands share their ends, so its outline is two long sides and a cross line at each division
      else { line(out, at(0, 1), at(len, 1)); line(out, at(0, -1), at(len, -1)); }
      let cursor = 0;
      for (const w of [0, ...weights]) {
        cursor += (w / total) * len;
        line(out, at(cursor, 1), at(cursor, -1));
      }
      return;
    }
    case 'image':
      return;
  }
}

type Pair = [number, string];
type DxfRecord = { type: string; pairs: Pair[] };

// $INSUNITS codes; 0 (unitless) and anything unlisted are read as mm
const UNIT_MM: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

/** Shapes out of DXF text, or null when the text isn't DXF at all. Ids are placeholders and
 * layers unset, as svgToShapes leaves them. */
export function dxfToShapes(text: string): DraftShape[] | null {
  const raw = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = raw[i].trim();
    if (!/^-?\d+$/.test(code)) return null;
    pairs.push([Number(code), raw[i + 1].trim()]);
  }
  if (!pairs.some(([c, v]) => c === 0 && v === 'SECTION')) return null;

  let section = '';
  let unit = 1;
  const records: DxfRecord[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 0 && value === 'SECTION') { section = pairs[i + 1]?.[1] ?? ''; continue; }
    if (code === 0 && value === 'ENDSEC') { section = ''; continue; }
    if (section === 'HEADER' && code === 9 && value === '$INSUNITS') unit = UNIT_MM[Number(pairs[i + 1]?.[1])] ?? 1;
    if (section !== 'ENTITIES') continue;
    if (code === 0) records.push({ type: value, pairs: [] });
    else records.at(-1)?.pairs.push(pairs[i]);
  }

  const shapes: DraftShape[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.type === 'POLYLINE') {
      const vertices: DxfRecord[] = [];
      while (records[i + 1]?.type === 'VERTEX') vertices.push(records[++i]);
      // 16 and 64 are 3D meshes, which have no plan view to draw
      if (num(rec, 70) & (16 | 64)) continue;
      const pts = vertices.map(v => ({ x: num(v, 10), y: num(v, 20), bulge: num(v, 42) }));
      pushShape(shapes, polylinePath(pts, (num(rec, 70) & 1) === 1, unit));
    } else {
      pushShape(shapes, recordToShape(rec, unit));
    }
  }
  return shapes;
}

function pushShape(shapes: DraftShape[], shape: DraftShape | null): void {
  if (shape) shapes.push(shape);
}

function values(rec: DxfRecord, code: number): string[] {
  return rec.pairs.filter(([c]) => c === code).map(([, v]) => v);
}

function num(rec: DxfRecord, code: number, fallback = 0): number {
  const v = Number(values(rec, code)[0]);
  return Number.isFinite(v) ? v : fallback;
}

/** Each x code with the y that follows it, in file order: how LWPOLYLINE and SPLINE list points. */
function points(rec: DxfRecord, xCode: number, scale: number): Pt[] {
  const out: Pt[] = [];
  for (const [c, v] of rec.pairs) {
    if (c === xCode) out.push({ x: Number(v) * scale, y: 0 });
    else if (c === xCode + 10 && out.length) out[out.length - 1].y = Number(v) * scale;
  }
  return out;
}

const SPECIAL: Record<string, string> = { d: '°', c: '⌀', p: '±' };
const plainText = (t: string): string => t.replace(/%%([dcp])/gi, (_, k: string) => SPECIAL[k.toLowerCase()]);

// MTEXT carries inline formatting: \P is a paragraph, \X...; a font or height switch, braces scope them
const mtextPlain = (t: string): string =>
  plainText(t.replace(/\\P/g, '\n').replace(/\\[A-OQ-Za-oq-z][^;\\{}]*;/g, '').replace(/\\(.)/g, '$1').replace(/[{}]/g, ''));

function recordToShape(rec: DxfRecord, k: number): DraftShape | null {
  const at = (xCode: number): Pt => ({ x: num(rec, xCode) * k, y: num(rec, xCode + 10) * k });
  switch (rec.type) {
    case 'LINE':
      return { id: '', type: 'line', start: at(10), end: at(11) };
    case 'CIRCLE':
      return { id: '', type: 'circle', center: at(10), radius: num(rec, 40) * k };
    case 'ARC':
      return {
        id: '', type: 'arc', center: at(10), radius: num(rec, 40) * k,
        startAngle: normalizeRadians(num(rec, 50) * TURN.degree), endAngle: normalizeRadians(num(rec, 51) * TURN.degree),
      };
    case 'POINT':
      return { id: '', type: 'point', position: at(10) };
    case 'LWPOLYLINE': {
      // a bulge belongs to the vertex it follows in the file
      const pts: Array<Pt & { bulge: number }> = [];
      for (const [c, v] of rec.pairs) {
        if (c === 10) pts.push({ x: Number(v), y: 0, bulge: 0 });
        else if (c === 20 && pts.length) pts[pts.length - 1].y = Number(v);
        else if (c === 42 && pts.length) pts[pts.length - 1].bulge = Number(v);
      }
      return polylinePath(pts, (num(rec, 70) & 1) === 1, k);
    }
    case 'SPLINE': {
      const degree = num(rec, 71, 3);
      const knots = values(rec, 40).map(Number);
      const control = points(rec, 10, k);
      const weights = values(rec, 41).map(Number);
      const pts = control.length > degree && knots.length === control.length + degree + 1
        ? splinePoints(degree, knots, control, weights.length === control.length ? weights : control.map(() => 1))
        : throughFitPoints(points(rec, 11, k));
      return pts.length > 1 ? { id: '', type: 'path', d: pathFromPoints(pts, (num(rec, 70) & 1) === 1) } : null;
    }
    case 'ELLIPSE': {
      const c = at(10), major = at(11), ratio = num(rec, 40, 1);
      const t0 = num(rec, 41, 0);
      let t1 = num(rec, 42, TURN.full);
      if (t1 <= t0) t1 += TURN.full;
      const full = t1 - t0 >= TURN.full - 1e-9;
      const n = Math.max(8, Math.ceil(64 * (t1 - t0) / TURN.full));
      const pts = Array.from({ length: n + (full ? 0 : 1) }, (_, i) => {
        const t = t0 + (t1 - t0) * i / n;
        return {
          x: c.x + major.x * Math.cos(t) - major.y * ratio * Math.sin(t),
          y: c.y + major.y * Math.cos(t) + major.x * ratio * Math.sin(t),
        };
      });
      return { id: '', type: 'path', d: pathFromPoints(pts, full) };
    }
    case 'TEXT': {
      const body = plainText(values(rec, 1)[0] ?? '');
      if (!body.trim()) return null;
      const height = num(rec, 40, DEFAULT_TEXT_SIZE_MM / k) * k;
      const rotationDeg = num(rec, 50);
      const justified = num(rec, 72) !== 0 || num(rec, 73) !== 0;
      // a Cremona text hangs off its anchor at mid-height; an unjustified DXF one sits on its baseline
      const lift = justified ? 0 : height / 2;
      const base = at(justified ? 11 : 10);
      const position = { x: base.x - Math.sin(rotationDeg * TURN.degree) * lift, y: base.y + Math.cos(rotationDeg * TURN.degree) * lift };
      return { id: '', type: 'text', position, text: body, fontSize: height, ...(rotationDeg ? { rotationDeg } : {}) };
    }
    case 'MTEXT': {
      const body = mtextPlain([...values(rec, 3), ...values(rec, 1)].join(''));
      if (!body.trim()) return null;
      const direction = values(rec, 11).length ? Math.atan2(num(rec, 21), num(rec, 11)) : num(rec, 50);
      const rotationDeg = direction / TURN.degree;
      return {
        id: '', type: 'text', position: at(10), text: body, fontSize: num(rec, 40, DEFAULT_TEXT_SIZE_MM / k) * k,
        ...(rotationDeg ? { rotationDeg } : {}),
      };
    }
    default:
      return null;
  }
}

/** A polyline's vertices as one path: a bulge is tan(¼ of the included angle), positive turning
 * counterclockwise, which in the Y-up world is SVG's sweep 1. */
function polylinePath(pts: Array<Pt & { bulge: number }>, closed: boolean, k: number): DraftShape | null {
  if (pts.length < 2) return null;
  const v = pts.map(p => ({ x: p.x * k, y: p.y * k, bulge: p.bulge }));
  const parts = [`M ${v[0].x} ${v[0].y}`];
  const segment = (a: typeof v[number], b: typeof v[number]) => {
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(a.bulge) < 1e-9 || chord < 1e-9) { parts.push(`L ${b.x} ${b.y}`); return; }
    const r = chord * (1 + a.bulge * a.bulge) / (4 * Math.abs(a.bulge));
    parts.push(`A ${r} ${r} 0 ${Math.abs(a.bulge) > 1 ? 1 : 0} ${a.bulge > 0 ? 1 : 0} ${b.x} ${b.y}`);
  };
  for (let i = 1; i < v.length; i++) segment(v[i - 1], v[i]);
  if (closed) { segment(v[v.length - 1], v[0]); parts.push('Z'); }
  return { id: '', type: 'path', d: parts.join(' ') };
}

function pathFromPoints(pts: Pt[], closed: boolean): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '');
}

// a spline given only by fit points is the curve through them; a natural spline over chord length
// stands in for the end tangents the file may carry
function throughFitPoints(fit: Pt[]): Pt[] {
  if (fit.length < 3) return fit;
  const t = [0];
  for (let i = 1; i < fit.length; i++) t.push(t[i - 1] + Math.hypot(fit[i].x - fit[i - 1].x, fit[i].y - fit[i - 1].y));
  if (t[t.length - 1] === 0) return fit;
  const x = makeNaturalSpline(t, fit.map(p => p.x)), y = makeNaturalSpline(t, fit.map(p => p.y));
  const n = (fit.length - 1) * 8;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = t[t.length - 1] * i / n;
    return { x: x(u), y: y(u) };
  });
}

/** A NURBS curve sampled by de Boor's algorithm, in homogeneous coordinates so weights hold. */
function splinePoints(degree: number, knots: number[], control: Pt[], weights: number[]): Pt[] {
  const lo = knots[degree], hi = knots[control.length];
  const n = Math.max(16, control.length * 8);
  const out: Pt[] = [];
  for (let s = 0; s <= n; s++) {
    const t = lo + (hi - lo) * s / n;
    let span = degree;
    while (span < control.length - 1 && knots[span + 1] <= t) span++;
    const d = Array.from({ length: degree + 1 }, (_, j) => {
      const i = j + span - degree, w = weights[i];
      return { x: control[i].x * w, y: control[i].y * w, w };
    });
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = j + span - degree;
        const denom = knots[i + degree - r + 1] - knots[i];
        const a = denom === 0 ? 0 : (t - knots[i]) / denom;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
      }
    }
    out.push({ x: d[degree].x / d[degree].w, y: d[degree].y / d[degree].w });
  }
  return out;
}
