import { arcCenterFromEndpoints } from './math/pathMath';
import { normalizeRadians, TURN } from './math/simpleGeometry';

/** Absent `layer` is DXF layer 0. */
export type DxfEntity = (
  | { type: 'LINE'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'ARC'; cx: number; cy: number; r: number; startAngleDeg: number; endAngleDeg: number }
  | { type: 'CIRCLE'; cx: number; cy: number; r: number }
  | { type: 'POINT'; x: number; y: number }
) & { layer?: string };

/** Centred on (x, y) unless `align` is 'left', which hangs the text off it at mid-height. */
export type DxfText = { text: string; x: number; y: number; height: number; rotationDeg?: number; layer?: string; align?: 'left' };

function quadraticBezierPoint(
  p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function cubicBezierPoint(
  p0: { x: number; y: number }, p1: { x: number; y: number },
  p2: { x: number; y: number }, p3: { x: number; y: number }, t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

/**
 * Converts an absolute SVG path string (the M/L/A/Q/Z subset this app emits)
 * into DXF-ready entities, preserving true arcs instead of flattening them.
 *
 * This app's draft coordinates are already Y-up (the canvas applies its own
 * scale(1,-1) only to render them in Y-down SVG/screen space) — DXF is
 * natively Y-up too, so coordinates pass through unchanged, no flip needed.
 */
export function pathToDxfEntities(d: string): DxfEntity[] {
  const entities: DxfEntity[] = [];

  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };

  // Restricted to this app's command set so exponent letters in scientific
  // notation (e.g. "6.12e-15", which JS produces for near-zero coordinates)
  // aren't mistaken for new path commands.
  const commands = d.match(/[MLAQCZ][^MLAQCZ]*/gi) ?? [];

  for (const command of commands) {
    const cmd = command[0].toUpperCase();
    const nums = command.slice(1).trim().split(/[\s,]+/).filter(s => s.length > 0).map(Number);

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
          entities.push({ type: 'LINE', x0: current.x, y0: current.y, x1: next.x, y1: next.y });
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
          const SEGMENTS = 8;
          let prev = current;
          for (let s = 1; s <= SEGMENTS; s++) {
            const next = quadraticBezierPoint(current, control, end, s / SEGMENTS);
            entities.push({ type: 'LINE', x0: prev.x, y0: prev.y, x1: next.x, y1: next.y });
            prev = next;
          }
          current = end;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < nums.length; i += 6) {
          const cp1 = { x: nums[i], y: nums[i + 1] };
          const cp2 = { x: nums[i + 2], y: nums[i + 3] };
          const end = { x: nums[i + 4], y: nums[i + 5] };
          const SEGMENTS = 16;
          let prev = current;
          for (let s = 1; s <= SEGMENTS; s++) {
            const next = cubicBezierPoint(current, cp1, cp2, end, s / SEGMENTS);
            entities.push({ type: 'LINE', x0: prev.x, y0: prev.y, x1: next.x, y1: next.y });
            prev = next;
          }
          current = end;
        }
        break;
      }
      case 'Z': {
        if (current.x !== subpathStart.x || current.y !== subpathStart.y) {
          entities.push({ type: 'LINE', x0: current.x, y0: current.y, x1: subpathStart.x, y1: subpathStart.y });
        }
        current = subpathStart;
        break;
      }
    }
  }

  return entities;
}

// R12 layer names allow letters, digits, $, - and _ only, 31 at most; stricter readers reject the rest
export function dxfLayerName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9$_-]+/g, '_').slice(0, 31) || '0';
}

export function buildDxfFile(entities: DxfEntity[], texts: DxfText[] = []): string {
  const lines: string[] = [];
  const push = (code: number, value: string | number) => {
    lines.push(String(code), String(value));
  };
  const n = (v: number) => v.toFixed(4);
  const layerOf = (item: { layer?: string }) => item.layer ? dxfLayerName(item.layer) : '0';

  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1009');
  push(9, '$INSUNITS'); push(70, 4); // 4 = millimeters
  push(0, 'ENDSEC');

  // a layer an entity names must be declared here, or strict readers drop the entity
  const layers = [...new Set(['0', ...entities.map(layerOf), ...texts.map(layerOf)])];
  push(0, 'SECTION'); push(2, 'TABLES');
  push(0, 'TABLE'); push(2, 'LTYPE'); push(70, 1);
  push(0, 'LTYPE'); push(2, 'CONTINUOUS'); push(70, 0); push(3, 'Solid line'); push(72, 65); push(73, 0); push(40, '0.0');
  push(0, 'ENDTAB');
  push(0, 'TABLE'); push(2, 'LAYER'); push(70, layers.length);
  for (const name of layers) {
    push(0, 'LAYER'); push(2, name); push(70, 0); push(62, 7); push(6, 'CONTINUOUS');
  }
  push(0, 'ENDTAB');
  push(0, 'ENDSEC');

  push(0, 'SECTION'); push(2, 'ENTITIES');
  for (const entity of entities) {
    push(0, entity.type); push(8, layerOf(entity));
    switch (entity.type) {
      case 'LINE':
        push(10, n(entity.x0)); push(20, n(entity.y0)); push(30, '0.0');
        push(11, n(entity.x1)); push(21, n(entity.y1)); push(31, '0.0');
        break;
      case 'ARC':
        push(10, n(entity.cx)); push(20, n(entity.cy)); push(30, '0.0');
        push(40, n(entity.r));
        push(50, n(entity.startAngleDeg));
        push(51, n(entity.endAngleDeg));
        break;
      case 'CIRCLE':
        push(10, n(entity.cx)); push(20, n(entity.cy)); push(30, '0.0');
        push(40, n(entity.r));
        break;
      case 'POINT':
        push(10, n(entity.x)); push(20, n(entity.y)); push(30, '0.0');
        break;
    }
  }
  for (const t of texts) {
    push(0, 'TEXT'); push(8, layerOf(t));
    push(10, n(t.x)); push(20, n(t.y)); push(30, '0.0');
    push(40, n(t.height));
    push(1, t.text);
    push(50, n(t.rotationDeg ?? 0));
    push(72, t.align === 'left' ? 0 : 1); push(73, 2); // horizontal justification, vertical: middle
    push(11, n(t.x)); push(21, n(t.y)); push(31, '0.0'); // alignment point, required for justified text
  }
  push(0, 'ENDSEC');

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
