// How far a neighbor's color can drift, step to step, and still count as "still background" —
// loose enough to walk across a lit paper backdrop's falloff, tight enough that a single step
// can't cross the instrument's own outline.
const LOCAL_TOLERANCE = 0.05;
// How far a candidate can drift from the border's own average color and still count as
// background, checked alongside LOCAL_TOLERANCE on every step. Local-only tolerance lets a long
// chain of small steps drift arbitrarily far — a worn varnish's gradual shading, or wood grain,
// can walk the flood clear across the instrument one low-contrast step at a time even though the
// whole path never resembles the actual backdrop. This anchors every step back to what the
// backdrop actually looks like, not just its immediate neighbor.
const REFERENCE_TOLERANCE = 0.14;
// Blur radius (px) the flood-filled mask is feathered by, so the cut reads as a soft edge
// instead of the flood fill's jagged pixel-by-pixel boundary.
const FEATHER_RADIUS_PX = 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function colorDistance(data: Uint8ClampedArray, aOffset: number, bOffset: number): number {
  const dr = data[aOffset] - data[bOffset];
  const dg = data[aOffset + 1] - data[bOffset + 1];
  const db = data[aOffset + 2] - data[bOffset + 2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 255;
}

function colorDistanceToRef(data: Uint8ClampedArray, offset: number, ref: [number, number, number]): number {
  const dr = data[offset] - ref[0];
  const dg = data[offset + 1] - ref[1];
  const db = data[offset + 2] - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / 255;
}

function averageBorderColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  const addPixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    r += data[offset];
    g += data[offset + 1];
    b += data[offset + 2];
    n++;
  };
  for (let x = 0; x < width; x++) {
    addPixel(x, 0);
    addPixel(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    addPixel(0, y);
    addPixel(width - 1, y);
  }
  return [r / n, g / n, b / n];
}

/**
 * Marks every pixel reachable from the image border through a chain of near-identical neighbors
 * as background — a flood fill, not a fixed-color test, so it works for any backdrop tone and
 * stops the instant it crosses the instrument's own outline. A highlight or reflection just
 * inside that outline is never reached, since nothing connects it to the border without crossing
 * a harder edge first.
 *
 * Every step is checked against two things: the immediate neighbor (LOCAL_TOLERANCE) and the
 * border's own average color (REFERENCE_TOLERANCE). Local-only would let a long chain of small
 * steps drift arbitrarily far — a worn varnish's gradual shading can walk the flood clear across
 * an instrument one low-contrast step at a time — so every step also has to still resemble the
 * backdrop itself, not just whatever admitted it.
 */
function floodBackgroundMask(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;
  const reference = averageBorderColor(data, width, height);

  function seed(x: number, y: number): void {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    mask[idx] = 1;
    queue[qTail++] = idx;
  }

  function tryEnqueue(x: number, y: number, fromIdx: number): void {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    if (colorDistance(data, idx * 4, fromIdx * 4) > LOCAL_TOLERANCE) return;
    if (colorDistanceToRef(data, idx * 4, reference) > REFERENCE_TOLERANCE) return;
    visited[idx] = 1;
    mask[idx] = 1;
    queue[qTail++] = idx;
  }

  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % width;
    const y = (idx / width) | 0;
    tryEnqueue(x - 1, y, idx);
    tryEnqueue(x + 1, y, idx);
    tryEnqueue(x, y - 1, idx);
    tryEnqueue(x, y + 1, idx);
  }

  return mask;
}

// Separable box blur, sliding-window (O(width*height) total, not *radius), used to feather the
// binary flood mask into a smooth 0..1 falloff.
function featherMask(mask: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const norm = 1 / (2 * radius + 1);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += mask[row + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum * norm;
      sum += mask[row + clamp(x + radius + 1, 0, width - 1)] - mask[row + clamp(x - radius, 0, width - 1)];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum * norm;
      sum += tmp[clamp(y + radius + 1, 0, height - 1) * width + x] - tmp[clamp(y - radius, 0, height - 1) * width + x];
    }
  }

  return out;
}

/**
 * Fades the image's background to transparent in place, so a scanned drawing reads correctly
 * against a dark canvas regardless of the paper's actual tone. See floodBackgroundMask for the
 * algorithm; this just feathers its output and applies it to alpha.
 *
 * No Angular/DOM-store dependencies — shared by white-suppression.worker.ts and, as a fallback
 * when a worker can't be used, image-asset-store.ts directly.
 */
export function applyWhiteSuppression(imageData: ImageData): void {
  const { width, height, data } = imageData;
  const mask = floodBackgroundMask(imageData);
  const fade = featherMask(mask, width, height, FEATHER_RADIUS_PX);

  for (let i = 0; i < fade.length; i++) {
    if (fade[i] <= 0) continue;
    const a = i * 4 + 3;
    data[a] = Math.max(0, Math.min(255, Math.round(data[a] * (1 - fade[i]))));
  }
}
