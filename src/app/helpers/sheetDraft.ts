import { Pt } from '../models/types';
import { SHEET } from '../theme/palettes';
import { PAPER_FORMATS, PaperPage, SvgPathExport, SvgTextExport } from './fileExporter';
import { Matrix2D, pathFromLine, pathFromPolygon, pathsBounds, transformPath, translatePath } from './math/pathMath';
import { dist } from './math/simpleGeometry';

// The printed sheet's drawing office, knowing nothing of what is drawn. A page is described, not
// placed: a view is paths the app already has, with a short list of marks in world millimetres,
// and a table is rows of label and value. This file turns the description into the paths and texts
// a sheet is made of: it picks each view's scale, expands the marks into arrows, extension lines
// and text, rules the tables, and frames the page with its header and footer. Annotation is sized
// in millimetres on the paper and never scales with the view. Types, then the marks, the view, the
// frame, and the two pages: the schematic's and the scaled drawings'.

export type SheetInk = 'subject' | 'note';

// the instrument is the subject, heavy unless said; anything said about it is a note, light
// unless said
export interface SheetStroke {
  d: string;
  ink?: SheetInk;
  weight?: 'heavy' | 'light';
  dashed?: boolean;
}

// what a view carries, in the view's own world mm. Offsets and reaches are mm on the paper.
//   dimension  arrows from `from` to `to`, parked `offset` off the measurement along its left
//              normal, measured from `through` when given. Its text is the measured length unless
//              `text` says otherwise, and sits `textAt` of the way along
//   station    a dashed level across the view, labelled at its `from` end
//   callout    text beside a point, `dx`, `dy` off it, with a leader back unless `bare`
//   ordinates  heights standing on a baseline at each station along it, the value written under
//              the baseline or past the height's tip, the station's position on the baseline's
//              other side when asked for
export type SheetMark =
  | { kind: 'dimension'; from: Pt; to: Pt; through?: Pt; offset?: number; text?: string; textAt?: number }
  | { kind: 'station'; y: number; from: number; to: number; label?: string; sub?: string }
  | { kind: 'callout'; at: Pt; text: string; sub?: string; dx?: number; dy?: number; bare?: boolean; anchor?: 'start' | 'middle' | 'end' }
  | { kind: 'ordinates'; origin: Pt; axis: Pt; normal: Pt; length?: number; stations: { at: number; height: number }[]; values: 'base' | 'tip' | 'none'; positions?: boolean };

export interface SheetView {
  strokes: SheetStroke[];
  marks: SheetMark[];
}

// a view that spaces its parts by the paper is asked for again at each scale tried
export type SheetViewSource = SheetView | ((scale: number) => SheetView);

// a page is columns across its drawing area, `x` in from the area's left and `w` wide, each a
// stack of blocks from the top: a view, drawn as large as fits the column's width and `h`, or
// tables side by side, each `w` wide. A table with no rows is left out
export interface SheetRow { label: string; value: string }
export type SheetBlock = { view: SheetViewSource; h: number } | { tables: SheetRow[][]; w: number };
export interface SheetColumn { x: number; w: number; blocks: SheetBlock[] }
export interface SheetPageSpec { columns: SheetColumn[] }

export interface SheetHeading { title: string; description: string; note?: string }
export interface SheetFooting { page: number; of: number; name?: string; credit: string }

// paths and texts on the paper, mm, y up
export interface SheetDrawing { paths: SvgPathExport[]; texts: SvgTextExport[] }

// the PDF writer's built-in Times, and what stands in for it on screen
export const SHEET_FONT = 'times';
export const SHEET_SCREEN_FONT = "'Times New Roman', Times, serif";
// a drawing's two text heights
export const DRAWING_TEXT = { label: 2.6, small: 2 } as const;
// a view is drawn 1 : n, the largest of these that fits its cell; past the last, 1:10 and 1:20
// keep an instrument larger than any here on the page
export const SCALE_LADDER = [1, 2, 2.5, 4, 5] as const;
const OVERSIZE_SCALES = [10, 20];

const ARROW = { length: 2.2, half: 0.4, tail: 2.5 };
const EXTENSION = { gap: 0.6, overrun: 1.2 };
const TEXT_GAP = 0.6;
const TICK = { minor: 0.8, major: 1.8 };

// a page's margin and its two text heights
interface SheetFace { margin: number; title: number; text: number }
const SCHEMATIC_FACE: SheetFace = { margin: 10, title: 4.8, text: 2.8 };
const DRAWING_FACE: SheetFace = { margin: 8, title: 6, text: 3.5 };
const SCHEMATIC_PAPER = PAPER_FORMATS['A4'];

// Times-Roman's advance widths in thousandths of an em, for the characters a sheet prints; a
// character not here is taken as a digit's width
const TIMES_ADVANCES: [number, string][] = [
  [250, ' .,'], [278, '/:;ijlt'], [333, "-()fIr'"], [389, 'sJ'], [400, '°'], [444, 'acez'], [556, 'FPS'], [564, '×+=~'],
  [611, 'ELTZ'], [667, 'BCR'], [722, 'ADGHKNOQUVXYw'], [778, 'm&'], [889, 'M'], [944, 'W'],
];
const TIMES_ADVANCE = new Map(TIMES_ADVANCES.flatMap(([advance, chars]) => [...chars].map(ch => [ch, advance] as [string, number])));

export function timesWidth(text: string, size: number): number {
  let advance = 0;
  for (let ch of text) advance += TIMES_ADVANCE.get(ch) ?? 500;
  return advance * size / 1000;
}

// a length as a sheet prints it: to `places`, no trailing zeros
export function formatMm(v: number, places = 1): string {
  return String(+v.toFixed(places) || 0);
}

function formatHeight(v: number): string {
  return (Math.round(v * 10) / 10 || 0).toFixed(1);
}

function inkStroke(d: string, ink: SheetInk, light: boolean, dashed = false): SvgPathExport {
  return { d, stroke: SHEET[ink], fill: 'none', strokeWidth: light ? SHEET.light : SHEET.heavy, ...(dashed ? { dash: SHEET.dash } : {}) };
}

function noteLine(a: Pt, b: Pt, dashed = false): SvgPathExport {
  return inkStroke(pathFromLine(a, b), 'note', true, dashed);
}

function noteText(text: string, at: Pt, size: number, face: Partial<SvgTextExport> = {}): SvgTextExport {
  return { text, x: at.x, y: at.y, fontSize: size, color: SHEET.note, font: SHEET_FONT, ...face };
}

function along(from: Pt, direction: Pt, by: number): Pt {
  return new Pt(from.x + direction.x * by, from.y + direction.y * by);
}

// a filled head with its tip on `tip`, pointing along `direction`
function arrowHead(tip: Pt, direction: Pt): SvgPathExport {
  let base = along(tip, direction, -ARROW.length);
  let across = new Pt(-direction.y, direction.x);
  return { d: pathFromPolygon([tip, along(base, across, ARROW.half), along(base, across, -ARROW.half)]), stroke: 'none', fill: SHEET.note, strokeWidth: 0 };
}

type Dimension = Extract<SheetMark, { kind: 'dimension' }>;
type Station = Extract<SheetMark, { kind: 'station' }>;
type Callout = Extract<SheetMark, { kind: 'callout' }>;
type Ordinates = Extract<SheetMark, { kind: 'ordinates' }>;

// the text reads left to right, bottom to top on an upright line, and stands over the line. A
// measure too short for its own arrows takes them outside, pointing in, the text past the far one
function drawDimension(out: SheetDrawing, mark: Dimension, k: number): void {
  let a = new Pt(mark.from.x * k, mark.from.y * k), b = new Pt(mark.to.x * k, mark.to.y * k);
  let length = dist(a, b);
  if (length < 1e-9) return;
  let u = new Pt((b.x - a.x) / length, (b.y - a.y) / length);
  let n = new Pt(-u.y, u.x);
  let off = (mark.offset ?? 0) + (mark.through ? (mark.through.x * k - a.x) * n.x + (mark.through.y * k - a.y) * n.y : 0);
  let A = along(a, n, off), B = along(b, n, off);
  if (Math.abs(off) > 1e-6) {
    let side = Math.sign(off);
    out.paths.push(noteLine(along(a, n, side * EXTENSION.gap), along(A, n, side * EXTENSION.overrun)));
    out.paths.push(noteLine(along(b, n, side * EXTENSION.gap), along(B, n, side * EXTENSION.overrun)));
  }
  let label = mark.text ?? formatMm(dist(mark.from, mark.to));
  let reading = u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y < 0) ? new Pt(-u.x, -u.y) : u;
  let rotationDeg = Math.atan2(reading.y, reading.x) * 180 / Math.PI;
  let size = DRAWING_TEXT.label;
  if (length >= 2 * ARROW.length + 0.2) {
    out.paths.push(noteLine(A, B), arrowHead(A, new Pt(-u.x, -u.y)), arrowHead(B, u));
    let on = along(A, u, length * (mark.textAt ?? 0.5));
    out.texts.push(noteText(label, along(on, new Pt(-reading.y, reading.x), TEXT_GAP + size / 2), size, { rotationDeg }));
  } else {
    let reach = ARROW.length + ARROW.tail;
    out.paths.push(noteLine(along(A, u, -reach), A), noteLine(B, along(B, u, reach)), arrowHead(A, u), arrowHead(B, new Pt(-u.x, -u.y)));
    out.texts.push(noteText(label, along(B, u, reach + 0.8 + timesWidth(label, size) / 2), size, { rotationDeg }));
  }
}

function drawStation(out: SheetDrawing, mark: Station, k: number): void {
  let y = mark.y * k;
  out.paths.push(noteLine(new Pt(mark.from * k, y), new Pt(mark.to * k, y), true));
  let x = mark.from * k - 1.2;
  if (mark.label) out.texts.push(noteText(mark.label, new Pt(x, y), DRAWING_TEXT.label, { anchor: 'end' }));
  if (mark.sub) out.texts.push(noteText(mark.sub, new Pt(x, y - (mark.label ? DRAWING_TEXT.label : 0)), DRAWING_TEXT.small, { anchor: 'end' }));
}

function drawCallout(out: SheetDrawing, mark: Callout, k: number): void {
  let at = new Pt(mark.at.x * k, mark.at.y * k);
  let dx = mark.dx ?? 0, dy = mark.dy ?? 0;
  let from = new Pt(at.x + dx, at.y + dy);
  let reach = Math.hypot(dx, dy);
  if (!mark.bare && reach > ARROW.length) {
    out.paths.push(noteLine(from, at), arrowHead(at, new Pt(-dx / reach, -dy / reach)));
  }
  let anchor = mark.anchor ?? (dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle');
  let x = from.x + (anchor === 'start' ? 0.8 : anchor === 'end' ? -0.8 : 0);
  out.texts.push(noteText(mark.text, new Pt(x, from.y + (mark.sub ? 1.4 : 0)), DRAWING_TEXT.label, { anchor }));
  if (mark.sub) out.texts.push(noteText(mark.sub, new Pt(x, from.y - 1.4), DRAWING_TEXT.small, { anchor }));
}

// values under a level baseline step down over as many lines, up to three, as keeps each clear of the next on its own
function drawOrdinates(out: SheetDrawing, mark: Ordinates, k: number): void {
  let origin = new Pt(mark.origin.x * k, mark.origin.y * k);
  let { axis, normal, stations } = mark;
  if (!stations.length) return;
  let length = (mark.length ?? Math.max(...stations.map(st => st.at))) * k;
  out.paths.push(noteLine(origin, along(origin, axis, length)));
  let level = Math.abs(normal.y) >= Math.abs(normal.x);
  let size = DRAWING_TEXT.label;
  let widest = Math.max(...stations.map(st => timesWidth(formatHeight(st.height), size)));
  let pitch = Math.min(...stations.slice(1).map((st, i) => Math.abs(st.at - stations[i].at) * k));
  let lines = mark.values === 'base' && level && stations.length > 1 ? Math.min(3, Math.max(1, Math.ceil((widest + 1) / pitch))) : 1;
  // a height below the baseline pushes every value under the lowest, so they stay on one line
  let dip = Math.max(0, ...stations.map(st => -st.height * k));
  let outward: 'start' | 'end' = normal.x > 0 ? 'start' : 'end';
  let inward: 'start' | 'end' = normal.x > 0 ? 'end' : 'start';
  stations.forEach((st, i) => {
    let base = along(origin, axis, st.at * k);
    let rise = st.height * k;
    let tip = along(base, normal, rise);
    if (Math.abs(rise) > 0.05) out.paths.push(noteLine(base, tip));
    let value = formatHeight(st.height);
    if (mark.values === 'base') {
      let drop = TEXT_GAP + 0.5 + dip + (i % lines) * (size + 0.4);
      if (level) out.texts.push(noteText(value, along(base, normal, -(drop + size / 2)), size));
      else out.texts.push(noteText(value, along(base, normal, -drop), size, { anchor: inward }));
    }
    if (mark.values === 'tip') {
      let past = along(base, normal, Math.max(rise, 0) + TEXT_GAP + 0.4);
      if (level) out.texts.push(noteText(value, along(past, normal, size / 2), size));
      else out.texts.push(noteText(value, past, size, { anchor: outward }));
    }
    if (mark.positions) {
      out.paths.push(noteLine(base, along(base, normal, -TICK.minor)));
      let under = along(base, normal, -(TICK.minor + TEXT_GAP));
      if (level) out.texts.push(noteText(formatMm(st.at), along(under, normal, -DRAWING_TEXT.small / 2), DRAWING_TEXT.small));
      else out.texts.push(noteText(formatMm(st.at), under, DRAWING_TEXT.small, { anchor: inward }));
    }
  });
}

// marks in world mm, drawn 1 : `scale` in mm on the paper about the world's own origin
export function expandMarks(marks: SheetMark[], scale: number): SheetDrawing {
  let out: SheetDrawing = { paths: [], texts: [] };
  let k = 1 / scale;
  for (let mark of marks) {
    if (mark.kind === 'dimension') drawDimension(out, mark, k);
    else if (mark.kind === 'station') drawStation(out, mark, k);
    else if (mark.kind === 'callout') drawCallout(out, mark, k);
    else drawOrdinates(out, mark, k);
  }
  return out;
}

export function drawView(view: SheetView, scale: number): SheetDrawing {
  let shrink: Matrix2D = [1 / scale, 0, 0, 1 / scale, 0, 0];
  let strokes = view.strokes.filter(s => s.d.trim()).map(s => {
    let ink = s.ink ?? 'subject';
    return inkStroke(transformPath(s.d, shrink), ink, (s.weight ?? (ink === 'subject' ? 'heavy' : 'light')) === 'light', s.dashed);
  });
  let marks = expandMarks(view.marks, scale);
  return { paths: [...strokes, ...marks.paths], texts: marks.texts };
}

type Box = { minX: number; maxX: number; minY: number; maxY: number };

// a text's box from Times' own widths, turned with the text
function textBox(t: SvgTextExport): Box {
  let size = t.fontSize ?? DRAWING_TEXT.label;
  let w = timesWidth(t.text, size);
  let from = t.anchor === 'start' ? 0 : t.anchor === 'end' ? -w : -w / 2;
  let a = (t.rotationDeg ?? 0) * Math.PI / 180;
  let corners = [[from, -size / 2], [from + w, -size / 2], [from + w, size / 2], [from, size / 2]]
    .map(([x, y]) => new Pt(t.x + x * Math.cos(a) - y * Math.sin(a), t.y + x * Math.sin(a) + y * Math.cos(a)));
  return { minX: Math.min(...corners.map(c => c.x)), maxX: Math.max(...corners.map(c => c.x)), minY: Math.min(...corners.map(c => c.y)), maxY: Math.max(...corners.map(c => c.y)) };
}

export function calcDrawingBounds(drawing: SheetDrawing): Box {
  let b = pathsBounds(drawing.paths.map(path => path.d));
  let boxes = [...(drawing.paths.length ? [b] : []), ...drawing.texts.map(textBox)];
  if (!boxes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return {
    minX: Math.min(...boxes.map(box => box.minX)), maxX: Math.max(...boxes.map(box => box.maxX)),
    minY: Math.min(...boxes.map(box => box.minY)), maxY: Math.max(...boxes.map(box => box.maxY)),
  };
}

// the view at the largest scale whose drawing, marks and all, fits w by h; the smallest there is
// when none does
export function fitView(source: SheetViewSource, w: number, h: number): { drawing: SheetDrawing; bounds: Box; scale: number } {
  let fitted!: { drawing: SheetDrawing; bounds: Box; scale: number };
  for (let scale of [...SCALE_LADDER, ...OVERSIZE_SCALES]) {
    let drawing = drawView(typeof source === 'function' ? source(scale) : source, scale);
    let bounds = calcDrawingBounds(drawing);
    fitted = { drawing, bounds, scale };
    if (bounds.maxX - bounds.minX <= w + 1e-6 && bounds.maxY - bounds.minY <= h + 1e-6) break;
  }
  return fitted;
}

function moveDrawing(drawing: SheetDrawing, dx: number, dy: number): SheetDrawing {
  return {
    paths: drawing.paths.map(path => ({ ...path, d: translatePath(path.d, dx, dy) })),
    texts: drawing.texts.map(t => ({ ...t, x: t.x + dx, y: t.y + dy })),
  };
}

// the header and footer both pages share, in the sheet's frame (centred on x = 0, y up from the
// page's foot), and where the drawing area between them starts and ends, down from the page's
// top. Everything starts at the left margin. A line is kept for the description even when there
// is none, so the area is the same on every page
function drawFrame(width: number, height: number, face: SheetFace, heading: SheetHeading, footing: SheetFooting, withNote: boolean): { drawing: SheetDrawing; top: number; bottom: number } {
  let { margin, title, text } = face;
  let left = margin - width / 2;
  let drawing: SheetDrawing = { paths: [], texts: [] };
  let y = margin;
  drawing.texts.push(noteText(heading.title, new Pt(left, height - (y + title / 2)), title, { anchor: 'start' }));
  y += title * 1.2;
  if (heading.description) drawing.texts.push(noteText(heading.description, new Pt(left, height - (y + text * 0.6)), text, { anchor: 'start', italic: true }));
  y += text * 1.2;
  if (withNote) {
    if (heading.note) drawing.texts.push(noteText(heading.note, new Pt(left, height - (y + text * 0.6)), text, { anchor: 'start' }));
    y += text * 1.2;
  }
  y += text * 0.7;
  drawing.paths.push(noteLine(new Pt(left, height - y), new Pt(width / 2 - margin, height - y)));

  let x = left;
  for (let item of [`${footing.page} / ${footing.of}`, footing.name, footing.credit]) {
    if (!item) continue;
    drawing.texts.push(noteText(item, new Pt(x, margin + text / 2), text, { anchor: 'start' }));
    x += timesWidth(item, text) + text * 1.7;
  }
  return { drawing, top: y + text, bottom: height - margin - 2 * text };
}

const SCHEMATIC_FRAME = drawFrame(SCHEMATIC_PAPER.width, SCHEMATIC_PAPER.height, SCHEMATIC_FACE, { title: '', description: '' }, { page: 0, of: 0, credit: '' }, false);
// the schematic's drawing area, which a page's cells and tables are placed in
export const SCHEMATIC_AREA = { width: SCHEMATIC_PAPER.width - 2 * SCHEMATIC_FACE.margin, height: SCHEMATIC_FRAME.bottom - SCHEMATIC_FRAME.top } as const;

const BLOCK_GAP = 6;
const TABLE_GAP = 8;
const ROW_PITCH = 1.85;

function drawTable(rows: SheetRow[], w: number, face: SheetFace): SheetDrawing {
  let pitch = face.text * ROW_PITCH;
  let drawing: SheetDrawing = { paths: [], texts: [] };
  rows.forEach((row, i) => {
    let y = -(i + 0.5) * pitch;
    drawing.paths.push(noteLine(new Pt(0, -i * pitch), new Pt(w, -i * pitch)));
    drawing.texts.push(noteText(row.label, new Pt(0.8, y), face.text, { anchor: 'start' }));
    drawing.texts.push(noteText(row.value, new Pt(w - 0.8, y), face.text, { anchor: 'end' }));
  });
  drawing.paths.push(noteLine(new Pt(0, -rows.length * pitch), new Pt(w, -rows.length * pitch)));
  return drawing;
}

// one page of the schematic, A4 upright: each column's blocks one under the last, a view at its
// scale against the top left of what the column has left
export function buildSchematicPage(spec: SheetPageSpec, heading: SheetHeading, footing: SheetFooting): PaperPage {
  let { width, height } = SCHEMATIC_PAPER;
  let frame = drawFrame(width, height, SCHEMATIC_FACE, heading, footing, false);
  let left = SCHEMATIC_FACE.margin - width / 2;
  let top = height - frame.top;
  let parts = [frame.drawing];
  for (let column of spec.columns) {
    let y = 0;
    for (let block of column.blocks) {
      if ('view' in block) {
        let { drawing, bounds } = fitView(block.view, column.w, Math.min(block.h, SCHEMATIC_AREA.height - y));
        parts.push(moveDrawing(drawing, left + column.x - bounds.minX, top - y - bounds.maxY));
        y += bounds.maxY - bounds.minY + BLOCK_GAP;
      } else {
        let tables = block.tables.filter(rows => rows.length);
        tables.forEach((rows, i) => parts.push(moveDrawing(drawTable(rows, block.w, SCHEMATIC_FACE), left + column.x + i * (block.w + TABLE_GAP), top - y)));
        y += Math.max(0, ...tables.map(rows => rows.length)) * SCHEMATIC_FACE.text * ROW_PITCH + BLOCK_GAP;
      }
    }
  }
  return { width, height, paths: parts.flatMap(part => part.paths), texts: parts.flatMap(part => part.texts) };
}

// one page of the scaled drawings: a drawing at full size, in its own frame (centred on x = 0, y up from
// 0), set in the middle of what the header, the footer and the two scales leave of the page. The
// scales run down the left edge and along the bottom only, a tick every 10 mm and a longer one
// numbered every 50, counted from the drawing's own origin. The drawing takes the sheet's inks
// here: red, light where it is etched rather than cut, and its labels the drawing's text
export function buildDrawingPage(
  content: { width: number; height: number; paths: SvgPathExport[]; texts?: SvgTextExport[]; centreline?: boolean },
  page: { width: number; height: number },
  heading: SheetHeading,
  footing: SheetFooting,
): PaperPage {
  let { width, height } = page;
  let frame = drawFrame(width, height, DRAWING_FACE, heading, footing, true);
  let size = DRAWING_TEXT.label;
  let axisX = DRAWING_FACE.margin + TICK.major + 0.5 + 2 * size;
  let axisY = frame.bottom - (TICK.major + 0.5 + size + 0.3);
  let right = width - DRAWING_FACE.margin;
  let originX = (axisX + right) / 2;
  let originY = axisY - (axisY - frame.top - content.height) / 2;
  // from the page, down from its top left, into the sheet's frame
  let onSheet = (x: number, y: number) => new Pt(x - width / 2, height - y);
  let shift = onSheet(originX, originY);

  let paths: SvgPathExport[] = [];
  let texts: SvgTextExport[] = [];
  if (content.centreline) paths.push(noteLine(onSheet(originX, Math.min(axisY, originY + 5)), onSheet(originX, Math.max(frame.top, originY - content.height - 5)), true));
  for (let path of content.paths) {
    paths.push({ ...inkStroke(path.d, 'subject', path.laser === 'etch'), transform: `translate(${shift.x} ${shift.y}) ${path.transform ?? ''}`.trim() });
  }
  for (let t of content.texts ?? []) texts.push(noteText(t.text, new Pt(t.x + shift.x, t.y + shift.y), size, { rotationDeg: t.rotationDeg }));

  paths.push(noteLine(onSheet(axisX, frame.top), onSheet(axisX, axisY)), noteLine(onSheet(axisX, axisY), onSheet(right, axisY)));
  for (let mm = Math.ceil((originY - axisY) / 10) * 10; mm <= originY - frame.top; mm += 10) {
    let y = originY - mm;
    let major = mm % 50 === 0;
    paths.push(noteLine(onSheet(axisX, y), onSheet(axisX - (major ? TICK.major : TICK.minor), y)));
    if (major) texts.push(noteText(String(mm), onSheet(axisX - TICK.major - 0.5, y), size, { anchor: 'end' }));
  }
  for (let mm = Math.ceil((axisX - originX) / 10) * 10; mm <= right - originX; mm += 10) {
    let x = originX + mm;
    let major = mm % 50 === 0;
    paths.push(noteLine(onSheet(x, axisY), onSheet(x, axisY + (major ? TICK.major : TICK.minor))));
    if (major) texts.push(noteText(String(Math.abs(mm)), onSheet(x, axisY + TICK.major + 0.5 + size / 2), size));
  }
  return { width, height, paths: [...frame.drawing.paths, ...paths], texts: [...frame.drawing.texts, ...texts] };
}
