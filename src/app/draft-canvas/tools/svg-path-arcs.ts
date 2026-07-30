import { Pt } from '../../models/types';

type PathCommand = { type: string; args: number[] };

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
function tokenizePathData(d: string): PathCommand[] {
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

    // Bare command letters implicitly repeat until the next command letter.
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
      commands.push({ type, args });
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
