import { Pt } from '../../models/types';

export type PathCommand = { type: string; args: number[] };

const COMMAND_LETTERS = 'MmLlHhVvCcSsQqTtAaZz';

const ARG_COUNTS: Record<string, number> = {
  M: 2, L: 2, T: 2,
  H: 1, V: 1,
  C: 6,
  S: 4, Q: 4,
  A: 7,
  Z: 0,
};

/** Minimal SVG path `d` tokenizer — just enough to track the current point and read arc params. */
export function tokenizePathData(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const n = d.length;
  let i = 0;

  const skipSeparators = () => {
    while (i < n && /[\s,]/.test(d[i])) i++;
  };

  const readNumber = (): number | null => {
    skipSeparators();
    const start = i;
    if (i < n && (d[i] === '+' || d[i] === '-')) i++;
    let sawDigits = false;
    while (i < n && /[0-9]/.test(d[i])) { i++; sawDigits = true; }
    if (i < n && d[i] === '.') {
      i++;
      while (i < n && /[0-9]/.test(d[i])) { i++; sawDigits = true; }
    }
    if (!sawDigits) { i = start; return null; }
    if (i < n && (d[i] === 'e' || d[i] === 'E')) {
      const expStart = i;
      i++;
      if (i < n && (d[i] === '+' || d[i] === '-')) i++;
      if (i < n && /[0-9]/.test(d[i])) {
        while (i < n && /[0-9]/.test(d[i])) i++;
      } else {
        i = expStart;
      }
    }
    return parseFloat(d.slice(start, i));
  };

  // Arc flags are single 0/1 digits and may butt up against the next number
  // with no separator (e.g. "011" = flag 0, flag 1, then coordinate "1"),
  // so they can't be read with the general number scanner above.
  const readFlag = (): number | null => {
    skipSeparators();
    if (i < n && (d[i] === '0' || d[i] === '1')) {
      const v = d[i] === '1' ? 1 : 0;
      i++;
      return v;
    }
    return null;
  };

  while (i < n) {
    skipSeparators();
    if (i >= n) break;
    const ch = d[i];
    if (!COMMAND_LETTERS.includes(ch)) { i++; continue; }

    const type = ch;
    i++;
    const isArc = type.toUpperCase() === 'A';
    const argCount = ARG_COUNTS[type.toUpperCase()] ?? 0;

    if (argCount === 0) {
      commands.push({ type, args: [] });
      continue;
    }

    // Bare command letters implicitly repeat until the next command letter — except after a
    // moveto, where the extra pairs are linetos (SVG 1.1 §8.3.2; Inkscape writes `m 0,0 10,0`).
    let repeat = type;
    while (true) {
      skipSeparators();
      if (i >= n || COMMAND_LETTERS.includes(d[i])) break;

      const args: number[] = [];
      let ok = true;
      for (let k = 0; k < argCount; k++) {
        const val = (isArc && (k === 3 || k === 4)) ? readFlag() : readNumber();
        if (val === null) { ok = false; break; }
        args.push(val);
      }
      if (!ok) break;
      commands.push({ type: repeat, args });
      if (repeat === 'M') repeat = 'L';
      else if (repeat === 'm') repeat = 'l';
    }
  }

  return commands;
}

/** SVG endpoint-to-center arc parameterization (SVG 1.1 spec, appendix F.6.5). */
function arcCenterFromEndpoints(
  p0: Pt, p1: Pt, rxIn: number, ryIn: number, xAxisRotationDeg: number,
  largeArcFlag: number, sweepFlag: number,
): Pt | null {
  if (rxIn === 0 || ryIn === 0) return null; // degenerate arc (a straight line) has no center

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  const num = Math.max(0, rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2);
  const denom = rx2 * y1p2 + ry2 * x1p2;
  const coef = denom === 0 ? 0 : sign * Math.sqrt(num / denom);

  const cxp = coef * (rx * y1p / ry);
  const cyp = coef * (-ry * x1p / rx);

  return {
    x: cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2,
    y: sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2,
  };
}

export function extractArcCenters(d: string): Pt[] {
  const centers: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let subpathStart: Pt = { x: 0, y: 0 };

  for (const { type, args } of tokenizePathData(d)) {
    const rel = type === type.toLowerCase();
    const letter = type.toUpperCase();

    switch (letter) {
      case 'M': {
        const [x, y] = args;
        cur = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        subpathStart = { ...cur };
        break;
      }
      case 'L': {
        const [x, y] = args;
        cur = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        break;
      }
      case 'H': {
        const [x] = args;
        cur = { x: rel ? cur.x + x : x, y: cur.y };
        break;
      }
      case 'V': {
        const [y] = args;
        cur = { x: cur.x, y: rel ? cur.y + y : y };
        break;
      }
      case 'C': {
        const [, , , , x, y] = args;
        cur = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        break;
      }
      case 'S':
      case 'Q': {
        const [, , x, y] = args;
        cur = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        break;
      }
      case 'T': {
        const [x, y] = args;
        cur = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        break;
      }
      case 'A': {
        const [rx, ry, xRotDeg, largeArc, sweep, x, y] = args;
        const end = rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
        const center = arcCenterFromEndpoints(cur, end, rx, ry, xRotDeg, largeArc, sweep);
        if (center) centers.push(center);
        cur = end;
        break;
      }
      case 'Z': {
        cur = { ...subpathStart };
        break;
      }
    }
  }

  return centers;
}

const fmt = (n: number): string => String(Math.round(n * 1e6) / 1e6);

/**
 * Rewrites any SVG path data as absolute M, L, C, Q, A and Z — the subset every helper in
 * helpers/math/pathMath.ts and pathVibes.ts understands. Relative commands are resolved against the current
 * point, H and V become L, and S and T get their reflected control point spelled out. A path
 * that is already in that subset comes back with the same commands and numbers.
 */
export function absolutePathData(d: string): string {
  const out: string[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let subpathStart: Pt = { x: 0, y: 0 };
  // the control point S/T reflect, valid only straight after a C/S or Q/T respectively
  let lastCubicControl: Pt | null = null;
  let lastQuadControl: Pt | null = null;

  for (const { type, args } of tokenizePathData(d)) {
    const rel = type === type.toLowerCase();
    const letter = type.toUpperCase();
    const abs = (x: number, y: number): Pt => rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
    let cubic: Pt | null = null;
    let quad: Pt | null = null;

    switch (letter) {
      case 'M': {
        cur = abs(args[0], args[1]);
        subpathStart = cur;
        out.push(`M ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'L': {
        cur = abs(args[0], args[1]);
        out.push(`L ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'H': {
        cur = { x: rel ? cur.x + args[0] : args[0], y: cur.y };
        out.push(`L ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'V': {
        cur = { x: cur.x, y: rel ? cur.y + args[0] : args[0] };
        out.push(`L ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'C': {
        const c1 = abs(args[0], args[1]);
        const c2 = abs(args[2], args[3]);
        cur = abs(args[4], args[5]);
        cubic = c2;
        out.push(`C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'S': {
        const c1 = lastCubicControl ? { x: 2 * cur.x - lastCubicControl.x, y: 2 * cur.y - lastCubicControl.y } : cur;
        const c2 = abs(args[0], args[1]);
        cur = abs(args[2], args[3]);
        cubic = c2;
        out.push(`C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'Q': {
        const c = abs(args[0], args[1]);
        cur = abs(args[2], args[3]);
        quad = c;
        out.push(`Q ${fmt(c.x)} ${fmt(c.y)} ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'T': {
        const c = lastQuadControl ? { x: 2 * cur.x - lastQuadControl.x, y: 2 * cur.y - lastQuadControl.y } : cur;
        cur = abs(args[0], args[1]);
        quad = c;
        out.push(`Q ${fmt(c.x)} ${fmt(c.y)} ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'A': {
        const [rx, ry, rot, large, sweep, x, y] = args;
        cur = abs(x, y);
        out.push(`A ${fmt(rx)} ${fmt(ry)} ${fmt(rot)} ${large} ${sweep} ${fmt(cur.x)} ${fmt(cur.y)}`);
        break;
      }
      case 'Z': {
        cur = subpathStart;
        out.push('Z');
        break;
      }
    }
    lastCubicControl = cubic;
    lastQuadControl = quad;
  }
  return out.join(' ');
}
