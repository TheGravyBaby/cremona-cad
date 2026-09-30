import { Pt } from '../../models/types';
import { Matrix2D, applyMatrix, multiplyMatrices, parseSvgTransform, transformPath } from '../../helpers/math/pathMath';
import { pointOnCircle, normalizeRadians } from '../../helpers/math/simpleGeometry';
import { RecordedElement } from '../../helpers/layer-recorder';
import {
  DEFAULT_SHAPE_COLOR, DEFAULT_TEXT_SIZE_MM, DraftShape, TextShape, angleSweep, dimensionGeometry,
} from './toolbox-shape';
import {
  SECTION_THICKNESS_MM, TEXT_LINE_HEIGHT_RATIO, curveDivisions, freehandPathData, polylinePathData, tickLengthMm,
} from './shape-renderer';
import { composedTransform, shapeFromElement } from './scene-index';
import { shapeBounds } from './shape-hit-test';

/**
 * Drawn shapes as an SVG document and back — the clipboard's one format, and soon the file
 * export's. Real size: user units are millimetres, so a paste into Inkscape lands at scale.
 *
 * The world is Y-up and SVG is Y-down, so every coordinate is flipped on the way out and back —
 * flipped into the numbers themselves, not hidden behind a `scale(1,-1)` group, so another
 * program sees plain objects rather than a transform on each one. A `<metadata>` block carries
 * the shapes as they are, so a paste back into Cremona restores sections, ticks, dimensions and
 * text sizes exactly; anything else is read as ordinary SVG on a best-effort basis.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const METADATA_TAG = 'cremona-cad';
const STROKE_MM = 0.5;

/** Emitted SVG coordinates are world coordinates with y negated. */
const TO_SVG: Matrix2D = [1, 0, 0, -1, 0, 0];

const fmt = (n: number): string => String(Math.round(n * 1e4) / 1e4);
const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (name: string, value: string | number | undefined): string =>
  value === undefined || value === '' ? '' : ` ${name}="${escapeXml(String(value))}"`;

/** The clipboard copy carries no id and no layer: both are decided where it lands. */
function detached(shape: DraftShape): Omit<DraftShape, 'id' | 'layerId'> {
  const { id, layerId, ...rest } = shape;
  return rest;
}

export function shapesToSvg(shapes: DraftShape[]): string {
  const exportable = shapes.filter(s => s.type !== 'image');
  // a group goes out as a <g>, where its first member falls, so it stays a group in Inkscape
  const body: string[] = [];
  const emitted = new Set<string>();
  for (const shape of exportable) {
    if (!shape.groupId) {
      body.push(shapeToSvg(shape));
    } else if (!emitted.has(shape.groupId)) {
      emitted.add(shape.groupId);
      body.push(`<g>${exportable.filter(s => s.groupId === shape.groupId).map(shapeToSvg).join('')}</g>`);
    }
  }
  const bounds = svgBounds(body.join(''));
  const metadata = JSON.stringify({ version: 1, shapes: exportable.map(detached) });
  return [
    `<svg xmlns="${SVG_NS}" width="${fmt(bounds.width)}mm" height="${fmt(bounds.height)}mm"`
    + ` viewBox="${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(bounds.width)} ${fmt(bounds.height)}">`,
    `<metadata><${METADATA_TAG}>${escapeXml(metadata)}</${METADATA_TAG}></metadata>`,
    ...body,
    `</svg>`,
  ].join('\n');
}

function stroke(shape: { color?: string; dashed?: boolean }, extra = ''): string {
  return attr('fill', 'none') + attr('stroke', shape.color ?? DEFAULT_SHAPE_COLOR)
    + attr('stroke-width', STROKE_MM) + (shape.dashed ? attr('stroke-dasharray', '2 1.5') : '') + extra;
}

function svgLine(a: Pt, b: Pt, style: string): string {
  const p = applyMatrix(TO_SVG, a), q = applyMatrix(TO_SVG, b);
  return `<line${attr('x1', fmt(p.x))}${attr('y1', fmt(p.y))}${attr('x2', fmt(q.x))}${attr('y2', fmt(q.y))}${style}/>`;
}

function svgText(position: Pt, text: string, fontSizeMm: number, color: string, rotationDeg: number): string {
  const lines = text.split('\n');
  const lineHeight = fontSizeMm * TEXT_LINE_HEIGHT_RATIO;
  const anchor = applyMatrix(TO_SVG, position);
  // rotate(−θ): a counterclockwise turn in the Y-up world is a negative one in SVG's Y-down frame
  const transform = rotationDeg ? attr('transform', `rotate(${fmt(-rotationDeg)} ${fmt(anchor.x)} ${fmt(anchor.y)})`) : '';
  const tspans = lines.map((line, i) => {
    const y = anchor.y - ((lines.length - 1) / 2 - i) * lineHeight;
    return `<tspan${attr('x', fmt(anchor.x))}${attr('y', fmt(y))}>${escapeXml(line)}</tspan>`;
  }).join('');
  return `<text${attr('font-size', fmt(fontSizeMm))}${attr('font-family', 'sans-serif')}${attr('fill', color)}`
    + `${attr('text-anchor', 'start')}${attr('dominant-baseline', 'central')}${transform}>${tspans}</text>`;
}

function shapeToSvg(shape: DraftShape): string {
  const color = shape.color ?? DEFAULT_SHAPE_COLOR;
  switch (shape.type) {
    case 'line':
      return svgLine(shape.start, shape.end, stroke(shape));
    case 'circle': {
      const c = applyMatrix(TO_SVG, shape.center);
      return `<circle${attr('cx', fmt(c.x))}${attr('cy', fmt(c.y))}${attr('r', fmt(shape.radius))}${stroke(shape)}/>`;
    }
    case 'arc': {
      const start = pointOnCircle({ ...shape.center, r: shape.radius }, shape.startAngle);
      const end = pointOnCircle({ ...shape.center, r: shape.radius }, shape.endAngle);
      const large = normalizeRadians(shape.endAngle - shape.startAngle) > Math.PI ? 1 : 0;
      // sweep 1 is counterclockwise in the world; the Y flip turns that into a clockwise walk
      const d = transformPath(`M ${start.x} ${start.y} A ${shape.radius} ${shape.radius} 0 ${large} 1 ${end.x} ${end.y}`, TO_SVG);
      return `<path${attr('d', d)}${stroke(shape)}/>`;
    }
    case 'rect': {
      const x0 = Math.min(shape.p1.x, shape.p2.x), x1 = Math.max(shape.p1.x, shape.p2.x);
      const y0 = Math.min(shape.p1.y, shape.p2.y), y1 = Math.max(shape.p1.y, shape.p2.y);
      return `<rect${attr('x', fmt(x0))}${attr('y', fmt(-y1))}${attr('width', fmt(x1 - x0))}${attr('height', fmt(y1 - y0))}${stroke(shape)}/>`;
    }
    case 'path':
      return `<path${attr('d', transformPath(shape.d, TO_SVG))}${stroke(shape)}/>`;
    case 'freehand':
      return `<path${attr('d', transformPath(freehandPathData(shape.points), TO_SVG))}${attr('fill', 'none')}`
        + `${attr('stroke', color)}${attr('stroke-width', STROKE_MM)}${attr('stroke-linecap', 'round')}`
        + `${attr('opacity', shape.opacity)}/>`;
    case 'point': {
      const c = applyMatrix(TO_SVG, shape.position);
      return `<circle${attr('cx', fmt(c.x))}${attr('cy', fmt(c.y))}${attr('r', 0.6)}${attr('fill', color)}/>`;
    }
    case 'text':
      return svgText(shape.position, shape.text, shape.fontSize ?? DEFAULT_TEXT_SIZE_MM, color, shape.rotationDeg ?? 0);
    case 'dimension': {
      const geo = dimensionGeometry(shape.start, shape.end, shape.offset);
      if (!geo) return '';
      const style = stroke({ color });
      const label = `${geo.length.toFixed(1)} mm`;
      const angle = Math.atan2(geo.dir.y, geo.dir.x) * 180 / Math.PI;
      const upright = angle > 90 || angle <= -90 ? angle + 180 : angle;
      const labelPos = { x: geo.mid.x + geo.normal.x * 2, y: geo.mid.y + geo.normal.y * 2 };
      return `<g>${svgLine(geo.p1, geo.p2, style)}${svgLine(shape.start, geo.p1, style)}${svgLine(shape.end, geo.p2, style)}`
        + `${svgText(labelPos, label, 3, color, upright)}</g>`;
    }
    case 'angle': {
      const { startAngle, endAngle, sweep } = angleSweep(shape.vertex, shape.start, shape.end);
      const style = stroke({ color });
      const a = pointOnCircle({ ...shape.vertex, r: shape.radius }, startAngle);
      const b = pointOnCircle({ ...shape.vertex, r: shape.radius }, endAngle);
      const d = transformPath(`M ${a.x} ${a.y} A ${shape.radius} ${shape.radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${b.x} ${b.y}`, TO_SVG);
      const labelPos = pointOnCircle({ ...shape.vertex, r: shape.radius + 2 }, startAngle + sweep / 2);
      return `<g>${svgLine(shape.vertex, shape.start, style)}${svgLine(shape.vertex, shape.end, style)}<path${attr('d', d)}${style}/>`
        + `${svgText(labelPos, `${(sweep * 180 / Math.PI).toFixed(1)}°`, 3, color, 0)}</g>`;
    }
    case 'curve-length': {
      const [first, mid, last] = curveDivisions(shape.points, [1, 1]);
      if (!mid) return '';
      const style = stroke({ color });
      const tick = (d: { at: Pt; normal: Pt }) => svgLine(
        { x: d.at.x - d.normal.x, y: d.at.y - d.normal.y }, { x: d.at.x + d.normal.x, y: d.at.y + d.normal.y }, style);
      const labelPos = { x: mid.at.x + mid.normal.x * 2, y: mid.at.y + mid.normal.y * 2 };
      return `<g><path${attr('d', transformPath(polylinePathData(shape.points), TO_SVG))}${style}/>${tick(first)}${tick(last)}`
        + `${svgText(labelPos, `${shape.length.toFixed(1)} mm`, 3, color, 0)}</g>`;
    }
    case 'curve-ticks': {
      const divisions = curveDivisions(shape.points, shape.weights.filter(w => Number.isFinite(w) && w > 0));
      if (divisions.length === 0) return '';
      const style = stroke({ color });
      const lengths = shape.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - shape.points[i].x, p.y - shape.points[i].y), 0);
      const half = tickLengthMm(lengths) / 2;
      const ticks = divisions.map(({ at, normal }) => svgLine(
        { x: at.x + normal.x * half, y: at.y + normal.y * half }, { x: at.x - normal.x * half, y: at.y - normal.y * half }, style));
      return `<g><path${attr('d', transformPath(polylinePathData(shape.points), TO_SVG))}${style}/>${ticks.join('')}</g>`;
    }
    case 'section': {
      const dx = shape.end.x - shape.start.x, dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy);
      const weights = shape.weights.filter(w => Number.isFinite(w) && w > 0);
      const total = weights.reduce((a, b) => a + b, 0);
      if (len < 1e-6 || total <= 0) return '';
      const ux = dx / len, uy = dy / len;
      const nx = -uy * SECTION_THICKNESS_MM / 2, ny = ux * SECTION_THICKNESS_MM / 2;
      let cursor = 0;
      const bands = weights.map((w, i) => {
        const a = cursor, b = cursor + (w / total) * len;
        cursor = b;
        const corners = [
          { x: shape.start.x + ux * a + nx, y: shape.start.y + uy * a + ny },
          { x: shape.start.x + ux * b + nx, y: shape.start.y + uy * b + ny },
          { x: shape.start.x + ux * b - nx, y: shape.start.y + uy * b - ny },
          { x: shape.start.x + ux * a - nx, y: shape.start.y + uy * a - ny },
        ].map(p => applyMatrix(TO_SVG, p));
        const d = corners.map((p, k) => `${k === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`).join(' ') + ' Z';
        return `<path${attr('d', d)}${attr('fill', i % 2 === 0 ? color : shape.color2)}${attr('fill-opacity', 0.25)}`
          + `${attr('stroke', color)}${attr('stroke-width', STROKE_MM / 2)}/>`;
      });
      return `<g>${bands.join('')}</g>`;
    }
    case 'ticks': {
      const dx = shape.end.x - shape.start.x, dy = shape.end.y - shape.start.y;
      const len = Math.hypot(dx, dy);
      const weights = shape.weights.filter(w => Number.isFinite(w) && w > 0);
      const total = weights.reduce((a, b) => a + b, 0);
      if (len < 1e-6 || total <= 0) return '';
      const ux = dx / len, uy = dy / len;
      const half = tickLengthMm(len) / 2;
      const nx = -uy * half, ny = ux * half;
      const style = stroke({ color });
      const ticks: string[] = [];
      let cursor = 0;
      for (const w of [0, ...weights]) {
        cursor += (w / total) * len;
        const at = { x: shape.start.x + ux * cursor, y: shape.start.y + uy * cursor };
        ticks.push(svgLine({ x: at.x + nx, y: at.y + ny }, { x: at.x - nx, y: at.y - ny }, style));
      }
      return `<g>${svgLine(shape.start, shape.end, style)}${ticks.join('')}</g>`;
    }
    case 'image':
      return '';
  }
}

/** The union box of everything emitted, read off the markup — the one geometry the viewBox needs.
 * Padded a little so a stroke isn't clipped at the edge. */
function svgBounds(markup: string): { x: number; y: number; width: number; height: number } {
  const doc = parseSvg(`<svg xmlns="${SVG_NS}">${markup}</svg>`);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const include = (p: Pt) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
  if (doc) {
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const shape of shapesFromSvgElement(el, [1, 0, 0, 1, 0, 0])) {
        const b = shapeBounds({ ...shape, id: '' } as DraftShape);
        include({ x: b.x0, y: b.y0 });
        include({ x: b.x1, y: b.y1 });
      }
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: 1, height: 1 };
  const pad = STROKE_MM;
  return { x: x0 - pad, y: y0 - pad, width: Math.max(x1 - x0 + pad * 2, 1), height: Math.max(y1 - y0 + pad * 2, 1) };
}

function parseSvg(text: string): Document | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  return doc.querySelector('parsererror') ? null : doc;
}

const KNOWN_TYPES = new Set<DraftShape['type']>([
  'line', 'arc', 'circle', 'dimension', 'angle', 'curve-length', 'curve-ticks', 'rect', 'section', 'ticks', 'text', 'point', 'freehand', 'path',
]);

/**
 * Shapes out of SVG text, or null when the text isn't SVG at all. Cremona's own metadata wins
 * when present; otherwise the geometry elements are read as they stand, transforms composed,
 * `style` attributes honoured (Inkscape writes its stroke there), and user units scaled to mm
 * from the root's width and viewBox. Ids are fresh placeholders and layers unset — placing the
 * result is the caller's job (see SelectionActions.paste).
 */
export function svgToShapes(text: string): DraftShape[] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('<')) return null;
  const doc = parseSvg(trimmed);
  const root = doc?.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') return null;

  const own = root.querySelector(`metadata ${METADATA_TAG}`)?.textContent;
  if (own) {
    try {
      const parsed = JSON.parse(own);
      if (Array.isArray(parsed?.shapes)) {
        return parsed.shapes
          .filter((s: unknown) => !!s && typeof s === 'object' && KNOWN_TYPES.has((s as DraftShape).type))
          .map((s: object) => ({ ...s, id: '' }) as DraftShape);
      }
    } catch {
      // fall through to the geometry
    }
  }

  const scale = userUnitMm(root);
  const base = multiplyMatrices([1, 0, 0, -1, 0, 0], [scale, 0, 0, scale, 0, 0]);
  const shapes: DraftShape[] = [];
  const members = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const groupId = groupOf(el, root);
    for (const shape of shapesFromSvgElement(el, base)) {
      shapes.push({ ...shape, id: '', groupId } as DraftShape);
      if (groupId) members.set(groupId, (members.get(groupId) ?? 0) + 1);
    }
  }
  // a <g> round one shape is wrapping, not a group
  return shapes.map(s => s.groupId && members.get(s.groupId) === 1 ? { ...s, groupId: undefined } : s);
}

/** The nearest <g> above `el` that stands for a group: not the root, and not one of Inkscape's
 * layers, which are <g>s too. Flat, like the store's groups, so the innermost wins. */
function groupOf(el: Element, root: Element): string | undefined {
  for (let g = el.parentElement; g && g !== root; g = g.parentElement) {
    if (g.tagName.toLowerCase() !== 'g' || g.getAttribute('inkscape:groupmode') === 'layer') continue;
    if (!g.hasAttribute('data-cremona-group')) g.setAttribute('data-cremona-group', `svg-group-${groupSeq++}`);
    return g.getAttribute('data-cremona-group')!;
  }
  return undefined;
}

let groupSeq = 0;

const MM_PER_UNIT: Record<string, number> = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96, pt: 25.4 / 72, pc: 25.4 / 6, '': 25.4 / 96 };

/** How many mm one user unit is: the root's width divided by its viewBox width, or 1 when the
 * document says nothing (its numbers are then taken as mm, which is what Cremona writes). */
function userUnitMm(root: Element): number {
  const width = root.getAttribute('width')?.trim() ?? '';
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const match = /^([\d.]+)\s*([a-z%]*)$/i.exec(width);
  if (!match) return 1;
  const widthMm = parseFloat(match[1]) * (MM_PER_UNIT[match[2].toLowerCase()] ?? NaN);
  if (!Number.isFinite(widthMm)) return 1;
  if (viewBox.length === 4 && viewBox[2] > 0) return widthMm / viewBox[2];
  return MM_PER_UNIT[match[2].toLowerCase()] ?? 1;
}

/** Inkscape keeps stroke and dash in `style`; fold those in so the element reads like one that
 * carried them as attributes. */
function attrsOf(el: Element): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  for (const name of el.getAttributeNames()) attrs[name] = el.getAttribute(name);
  const style = el.getAttribute('style');
  if (style) {
    for (const decl of style.split(';')) {
      const [k, v] = decl.split(':').map(s => s?.trim());
      if (k && v && attrs[k] === undefined) attrs[k] = v;
    }
  }
  return attrs;
}

function recorded(el: Element, root: Element): RecordedElement {
  const parent = el.parentElement && el !== root ? recorded(el.parentElement, root) : undefined;
  return { layer: 'g', tag: el.tagName.toLowerCase(), attrs: attrsOf(el), parent };
}

function colorOf(attrs: Record<string, unknown>, key: 'stroke' | 'fill'): string | undefined {
  const v = attrs[key];
  return typeof v === 'string' && v !== 'none' && !v.startsWith('url(') ? v : undefined;
}

/** The shapes one SVG element stands for — usually one, none for a group or an unknown tag. */
function shapesFromSvgElement(el: Element, base: Matrix2D): Omit<DraftShape, 'id'>[] {
  const record = recorded(el, el.ownerDocument.documentElement);
  const m = multiplyMatrices(base, composedTransform(record));
  const attrs = record.attrs;
  const tag = record.tag;

  if (tag === 'text') return textFromSvg(el, attrs, m);
  if (tag === 'ellipse') {
    const rx = num(attrs['rx']), ry = num(attrs['ry']);
    if (rx <= 0 || ry <= 0) return [];
    const cx = num(attrs['cx']), cy = num(attrs['cy']);
    const asPath = { ...record, tag: 'path', attrs: { ...attrs, d: `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z` } };
    const shape = Math.abs(rx - ry) < 1e-9
      ? shapeFromElement({ ...record, tag: 'circle', attrs: { ...attrs, r: rx } }, m)
      : shapeFromElement(asPath, m);
    return shape ? [withColor(shape, attrs)] : [];
  }
  const shape = shapeFromElement(record, m);
  return shape ? [withColor(shape, attrs)] : [];
}

function withColor(shape: Omit<DraftShape, 'id'>, attrs: Record<string, unknown>): Omit<DraftShape, 'id'> {
  const color = colorOf(attrs, 'stroke') ?? (shape.type === 'point' ? colorOf(attrs, 'fill') : undefined);
  return color ? { ...shape, color } as Omit<DraftShape, 'id'> : shape;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

function textFromSvg(el: Element, attrs: Record<string, unknown>, m: Matrix2D): Omit<TextShape, 'id'>[] {
  const tspans = Array.from(el.querySelectorAll('tspan'));
  const lines = tspans.length ? tspans.map(t => t.textContent ?? '') : [el.textContent ?? ''];
  const text = lines.join('\n').replace(/\s+$/g, '');
  if (!text.trim()) return [];
  const first = tspans[0];
  const x = num(first?.getAttribute('x') ?? attrs['x']);
  const y = num(first?.getAttribute('y') ?? attrs['y']);
  const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const fontSize = num(attrs['font-size']) * scale || DEFAULT_TEXT_SIZE_MM;
  const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
  // the anchor is the block's vertical middle, the first tspan its top line
  const anchor = applyMatrix(m, { x, y });
  const rotationDeg = Math.atan2(m[1], m[0]) * 180 / Math.PI;
  const down = { x: Math.sin(rotationDeg * Math.PI / 180), y: -Math.cos(rotationDeg * Math.PI / 180) };
  const shift = ((lines.length - 1) / 2) * lineHeight;
  const position = { x: anchor.x + down.x * shift, y: anchor.y + down.y * shift };
  const color = colorOf(attrs, 'fill');
  return [{
    type: 'text', position, text, fontSize,
    rotationDeg: Math.abs(rotationDeg) < 1e-9 ? undefined : rotationDeg,
    ...(color ? { color } : {}),
  }];
}
