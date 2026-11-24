import { arcCenterFromEndpoints } from './math/pathMath';
import { normalizeRadians, TURN } from './math/simpleGeometry';

/**
 * Absent `layer` is DXF layer 0. An LWPOLYLINE is a run of straight segments, a closed one not
 * repeating its first point. A SPLINE is cubic Bézier spans end to end, [from, c1, c2, to, c1, c2, to…].
 */
export type DxfEntity = (
  | { type: 'LINE'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'ARC'; cx: number; cy: number; r: number; startAngleDeg: number; endAngleDeg: number }
  | { type: 'CIRCLE'; cx: number; cy: number; r: number }
  | { type: 'POINT'; x: number; y: number }
  | { type: 'LWPOLYLINE'; points: { x: number; y: number }[]; closed: boolean }
  | { type: 'SPLINE'; points: { x: number; y: number }[] }
) & { layer?: string };

/** Centred on (x, y) unless `align` is 'left', which hangs the text off it at mid-height. */
export type DxfText = { text: string; x: number; y: number; height: number; rotationDeg?: number; layer?: string; align?: 'left' };

/**
 * Converts an absolute SVG path string (the M/L/A/Q/C/Z subset this app emits) into DXF-ready
 * entities, every curve kept as the curve it is: arcs as ARCs, and each run of Béziers as one
 * SPLINE, a quadratic raised to the cubic it equals. Each run of straight segments is one
 * LWPOLYLINE, closed where the path closes it; a segment on its own is a LINE.
 *
 * This app's draft coordinates are already Y-up (the canvas applies its own
 * scale(1,-1) only to render them in Y-down SVG/screen space) — DXF is
 * natively Y-up too, so coordinates pass through unchanged, no flip needed.
 */
export function pathToDxfEntities(d: string): DxfEntity[] {
  const entities: DxfEntity[] = [];

  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let spline: { x: number; y: number }[] | null = null;
  const endSpline = () => {
    if (spline) entities.push({ type: 'SPLINE', points: spline });
    spline = null;
  };
  let run: { x: number; y: number }[] | null = null;
  const endRun = (closed = false) => {
    if (run && run.length === 2 && !closed) entities.push({ type: 'LINE', x0: run[0].x, y0: run[0].y, x1: run[1].x, y1: run[1].y });
    else if (run) entities.push({ type: 'LWPOLYLINE', points: run, closed });
    run = null;
  };

  // Restricted to this app's command set so exponent letters in scientific
  // notation (e.g. "6.12e-15", which JS produces for near-zero coordinates)
  // aren't mistaken for new path commands.
  const commands = d.match(/[MLAQCZ][^MLAQCZ]*/gi) ?? [];

  for (const command of commands) {
    const cmd = command[0].toUpperCase();
    const nums = command.slice(1).trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);
    if (cmd !== 'C' && cmd !== 'Q') endSpline();
    if (cmd !== 'L' && cmd !== 'Z') endRun();

    switch (cmd) {
      case 'M': {
        const point = { x: nums[0], y: nums[1] };
        current = point;
        subpathStart = point;
        break;
      }
      case 'L': {
        for (let i = 0; i < nums.length; i += 2) {
          const next = { x: nums[i], y: nums[i + 1] };
          run ??= [current];
          run.push(next);
          current = next;
        }
        break;
      }
      case 'A': {
        for (let i = 0; i < nums.length; i += 7) {
          const r = nums[i];
          const largeArcFlag = nums[i + 3];
          const sweepFlag = nums[i + 4];
          const next = { x: nums[i + 5], y: nums[i + 6] };

          const { x: cx, y: cy } = arcCenterFromEndpoints(current, next, r, largeArcFlag, sweepFlag);
          let startAngle = Math.atan2(current.y - cy, current.x - cx);
          let endAngle = Math.atan2(next.y - cy, next.x - cx);

          if (!sweepFlag) {
            // DXF ARC always sweeps counter-clockwise from start to end —
            // swap the bounds to represent a clockwise SVG arc as an
            // equivalent CCW one spanning the same points.
            [startAngle, endAngle] = [endAngle, startAngle];
          }

          entities.push({
            type: 'ARC',
            cx, cy, r,
            startAngleDeg: normalizeRadians(startAngle) / TURN.degree,
            endAngleDeg: normalizeRadians(endAngle) / TURN.degree,
          });
          current = next;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i < nums.length; i += 4) {
          const control = { x: nums[i], y: nums[i + 1] };
          const end = { x: nums[i + 2], y: nums[i + 3] };
          spline ??= [current];
          spline.push(
            { x: current.x + 2 / 3 * (control.x - current.x), y: current.y + 2 / 3 * (control.y - current.y) },
            { x: end.x + 2 / 3 * (control.x - end.x), y: end.y + 2 / 3 * (control.y - end.y) },
            end,
          );
          current = end;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < nums.length; i += 6) {
          const end = { x: nums[i + 4], y: nums[i + 5] };
          spline ??= [current];
          spline.push({ x: nums[i], y: nums[i + 1] }, { x: nums[i + 2], y: nums[i + 3] }, end);
          current = end;
        }
        break;
      }
      case 'Z': {
        const home = current.x === subpathStart.x && current.y === subpathStart.y;
        // a run the subpath is made of closes on itself; after a curve the close is a segment of its own
        if (run && run[0] === subpathStart) {
          if (home && run.length > 2) run.pop();
          endRun(true);
        } else {
          if (!home) {
            run ??= [current];
            run.push(subpathStart);
          }
          endRun();
        }
        current = subpathStart;
        break;
      }
    }
  }
  endSpline();
  endRun();

  return entities;
}

// layer names allow letters, digits, $, - and _ only, 31 at most; stricter readers reject the rest
export function dxfLayerName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9$_-]+/g, '_').slice(0, 31) || '0';
}

// the knots that make Bézier spans end to end one cubic B-spline: clamped at both ends, each join
// repeated three times, so the curve passes through it and every span stays the Bézier it was
export function bezierSplineKnots(spans: number): number[] {
  return [0, 0, 0, 0, ...Array.from({ length: spans - 1 }, (_, i) => [i + 1, i + 1, i + 1]).flat(), spans, spans, spans, spans];
}

// An R2000 drawing, the oldest that has SPLINE. Unlike R12 every object carries a handle, its
// owner's handle and its subclass markers, and the file needs the tables, the model and paper
// space blocks and the root dictionary that strict readers check for even when they're empty
export function buildDxfFile(entities: DxfEntity[], texts: DxfText[] = []): string {
  const lines: string[] = [];
  const push = (code: number, value: string | number) => {
    lines.push(String(code), String(value));
  };
  const n = (v: number) => v.toFixed(4);
  const layerOf = (item: { layer?: string }) => item.layer ? dxfLayerName(item.layer) : '0';
  let lastHandle = 0;
  const handle = () => (++lastHandle).toString(16).toUpperCase();

  // handles the sections point at one another by, taken up front
  const tablesH = {
    VPORT: handle(), LTYPE: handle(), LAYER: handle(), STYLE: handle(), VIEW: handle(), UCS: handle(), APPID: handle(), DIMSTYLE: handle(), BLOCK_RECORD: handle(),
  };
  const modelSpace = handle(), paperSpace = handle();
  const rootDict = handle(), groupDict = handle();

  const body: string[] = [];
  const out = (code: number, value: string | number) => body.push(String(code), String(value));
  const table = (name: keyof typeof tablesH, entries: ((tableHandle: string) => void)[]) => {
    out(0, 'TABLE'); out(2, name); out(5, tablesH[name]); out(330, 0); out(100, 'AcDbSymbolTable'); out(70, entries.length);
    if (name === 'DIMSTYLE') { out(100, 'AcDbDimStyleTable'); out(71, 0); }
    for (const entry of entries) entry(tablesH[name]);
    out(0, 'ENDTAB');
  };
  const record = (type: string, subclass: string, owner: string, handleCode = 5) => {
    out(0, type); out(handleCode, handle()); out(330, owner); out(100, 'AcDbSymbolTableRecord'); out(100, subclass);
  };
  const entityHead = (type: string, layer: string, subclass: string) => {
    out(0, type); out(5, handle()); out(330, modelSpace); out(100, 'AcDbEntity'); out(8, layer); out(100, subclass);
  };

  const layers = [...new Set(['0', ...entities.map(layerOf), ...texts.map(layerOf)])];
  out(0, 'SECTION'); out(2, 'CLASSES'); out(0, 'ENDSEC');
  out(0, 'SECTION'); out(2, 'TABLES');
  table('VPORT', []);
  table('LTYPE', ['ByBlock', 'ByLayer', 'Continuous'].map(name => (owner: string) => {
    record('LTYPE', 'AcDbLinetypeTableRecord', owner);
    out(2, name); out(70, 0); out(3, name === 'Continuous' ? 'Solid line' : ''); out(72, 65); out(73, 0); out(40, '0.0');
  }));
  // a layer an entity names must be declared here, or strict readers drop the entity
  table('LAYER', layers.map(name => (owner: string) => {
    record('LAYER', 'AcDbLayerTableRecord', owner);
    out(2, name); out(70, 0); out(62, 7); out(6, 'Continuous');
  }));
  table('STYLE', [(owner: string) => {
    record('STYLE', 'AcDbTextStyleTableRecord', owner);
    out(2, 'Standard'); out(70, 0); out(40, '0.0'); out(41, '1.0'); out(50, '0.0'); out(71, 0); out(42, '2.5'); out(3, 'txt'); out(4, '');
  }]);
  table('VIEW', []);
  table('UCS', []);
  table('APPID', [(owner: string) => { record('APPID', 'AcDbRegAppTableRecord', owner); out(2, 'ACAD'); out(70, 0); }]);
  table('DIMSTYLE', [(owner: string) => { record('DIMSTYLE', 'AcDbDimStyleTableRecord', owner, 105); out(2, 'Standard'); out(70, 0); }]);
  table('BLOCK_RECORD', [modelSpace, paperSpace].map((own, i) => (owner: string) => {
    out(0, 'BLOCK_RECORD'); out(5, own); out(330, owner); out(100, 'AcDbSymbolTableRecord'); out(100, 'AcDbBlockTableRecord');
    out(2, i ? '*Paper_Space' : '*Model_Space');
  }));
  out(0, 'ENDSEC');

  out(0, 'SECTION'); out(2, 'BLOCKS');
  for (const [own, name] of [[modelSpace, '*Model_Space'], [paperSpace, '*Paper_Space']]) {
    out(0, 'BLOCK'); out(5, handle()); out(330, own); out(100, 'AcDbEntity');
    if (own === paperSpace) out(67, 1);
    out(8, '0'); out(100, 'AcDbBlockBegin'); out(2, name); out(70, 0); out(10, '0.0'); out(20, '0.0'); out(30, '0.0'); out(3, name); out(1, '');
    out(0, 'ENDBLK'); out(5, handle()); out(330, own); out(100, 'AcDbEntity');
    if (own === paperSpace) out(67, 1);
    out(8, '0'); out(100, 'AcDbBlockEnd');
  }
  out(0, 'ENDSEC');

  out(0, 'SECTION'); out(2, 'ENTITIES');
  for (const entity of entities) {
    let layer = layerOf(entity);
    switch (entity.type) {
      case 'LINE':
        entityHead('LINE', layer, 'AcDbLine');
        out(10, n(entity.x0)); out(20, n(entity.y0)); out(30, '0.0');
        out(11, n(entity.x1)); out(21, n(entity.y1)); out(31, '0.0');
        break;
      case 'ARC':
        entityHead('ARC', layer, 'AcDbCircle');
        out(10, n(entity.cx)); out(20, n(entity.cy)); out(30, '0.0');
        out(40, n(entity.r));
        out(100, 'AcDbArc');
        out(50, n(entity.startAngleDeg));
        out(51, n(entity.endAngleDeg));
        break;
      case 'CIRCLE':
        entityHead('CIRCLE', layer, 'AcDbCircle');
        out(10, n(entity.cx)); out(20, n(entity.cy)); out(30, '0.0');
        out(40, n(entity.r));
        break;
      case 'POINT':
        entityHead('POINT', layer, 'AcDbPoint');
        out(10, n(entity.x)); out(20, n(entity.y)); out(30, '0.0');
        break;
      case 'LWPOLYLINE':
        entityHead('LWPOLYLINE', layer, 'AcDbPolyline');
        out(90, entity.points.length); out(70, entity.closed ? 1 : 0); out(43, '0.0');
        for (const pt of entity.points) { out(10, n(pt.x)); out(20, n(pt.y)); }
        break;
      case 'SPLINE': {
        let knots = bezierSplineKnots((entity.points.length - 1) / 3);
        entityHead('SPLINE', layer, 'AcDbSpline');
        out(210, '0.0'); out(220, '0.0'); out(230, '1.0');
        out(70, 8); // planar
        out(71, 3); out(72, knots.length); out(73, entity.points.length); out(74, 0);
        out(42, '0.0000001'); out(43, '0.0000001');
        for (const k of knots) out(40, k);
        for (const pt of entity.points) { out(10, n(pt.x)); out(20, n(pt.y)); out(30, '0.0'); }
        break;
      }
    }
  }
  for (const t of texts) {
    entityHead('TEXT', layerOf(t), 'AcDbText');
    out(10, n(t.x)); out(20, n(t.y)); out(30, '0.0');
    out(40, n(t.height));
    out(1, t.text);
    out(50, n(t.rotationDeg ?? 0));
    out(72, t.align === 'left' ? 0 : 1); // horizontal justification
    out(11, n(t.x)); out(21, n(t.y)); out(31, '0.0'); // alignment point, required for justified text
    out(100, 'AcDbText'); out(73, 2); // vertical: middle
  }
  out(0, 'ENDSEC');

  out(0, 'SECTION'); out(2, 'OBJECTS');
  out(0, 'DICTIONARY'); out(5, rootDict); out(330, 0); out(100, 'AcDbDictionary'); out(281, 1); out(3, 'ACAD_GROUP'); out(350, groupDict);
  out(0, 'DICTIONARY'); out(5, groupDict); out(330, rootDict); out(100, 'AcDbDictionary'); out(281, 1);
  out(0, 'ENDSEC');

  // the header goes first but names the next free handle, so it is written last
  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1015');
  push(9, '$DWGCODEPAGE'); push(3, 'ANSI_1252');
  push(9, '$HANDSEED'); push(5, (lastHandle + 1).toString(16).toUpperCase());
  push(9, '$INSUNITS'); push(70, 4); // 4 = millimeters
  push(9, '$MEASUREMENT'); push(70, 1); // metric
  push(0, 'ENDSEC');
  lines.push(...body);
  push(0, 'EOF');

  return lines.join('\n') + '\n';
}

export function downloadDxfText(filename: string, dxfContent: string): void {
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadDxfFile(filename: string, pathD: string, texts: DxfText[] = []): void {
  downloadDxfText(filename, buildDxfFile(pathToDxfEntities(pathD), texts));
}
