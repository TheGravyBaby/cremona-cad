import { arcCenterFromEndpoints } from './svgPathMath';

type DxfEntity =
  | { type: 'LINE'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'ARC'; cx: number; cy: number; r: number; startAngleDeg: number; endAngleDeg: number };

const TWO_PI = Math.PI * 2;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const normalizeRad = (rad: number) => ((rad % TWO_PI) + TWO_PI) % TWO_PI;

function quadraticBezierPoint(
  p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
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
  const commands = d.match(/[MLAQZ][^MLAQZ]*/gi) ?? [];

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
            startAngleDeg: toDeg(normalizeRad(startAngle)),
            endAngleDeg: toDeg(normalizeRad(endAngle)),
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

function buildDxfFile(entities: DxfEntity[]): string {
  const lines: string[] = [];
  const push = (code: number, value: string | number) => {
    lines.push(String(code), String(value));
  };

  push(0, 'SECTION'); push(2, 'HEADER');
  push(9, '$ACADVER'); push(1, 'AC1009');
  push(9, '$INSUNITS'); push(70, 4); // 4 = millimeters
  push(0, 'ENDSEC');

  push(0, 'SECTION'); push(2, 'ENTITIES');
  for (const entity of entities) {
    if (entity.type === 'LINE') {
      push(0, 'LINE'); push(8, '0');
      push(10, entity.x0.toFixed(4)); push(20, entity.y0.toFixed(4)); push(30, '0.0');
      push(11, entity.x1.toFixed(4)); push(21, entity.y1.toFixed(4)); push(31, '0.0');
    } else {
      push(0, 'ARC'); push(8, '0');
      push(10, entity.cx.toFixed(4)); push(20, entity.cy.toFixed(4)); push(30, '0.0');
      push(40, entity.r.toFixed(4));
      push(50, entity.startAngleDeg.toFixed(4));
      push(51, entity.endAngleDeg.toFixed(4));
    }
  }
  push(0, 'ENDSEC');

  push(0, 'EOF');

  return lines.join('\n') + '\n';
}

export function downloadDxfFile(filename: string, pathD: string): void {
  const entities = pathToDxfEntities(pathD);
  const dxfContent = buildDxfFile(entities);

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
