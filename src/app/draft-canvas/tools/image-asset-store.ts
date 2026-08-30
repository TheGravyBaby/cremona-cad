import { Injectable } from '@angular/core';

/** Pixel data for one interned image, keyed by `ref` in ImageAssetStore. */
export type ImageAsset = {
  ref: string;
  /** The original source — a `data:` URL for an upload, or a path like `/StradGoetz.jpg` for
   * an image a template ships with. Written back out verbatim by the save adapter. */
  href: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

let assetRefSeq = 0;

function makeAssetRef(): string {
  assetRefSeq += 1;
  return `img-${Date.now().toString(36)}-${assetRefSeq.toString(36)}`;
}

// White-suppression tuning. Raise the threshold to affect fewer pixels; increase softness for a
// gentler fade; the saturation gate keeps genuinely colored pixels (varnish, pencil) untouched.
// Code-controlled — the per-shape control is only the on/off toggle (see ImageShape.suppressWhite).
const WHITE_THRESHOLD = 0.9;
const WHITE_SOFTNESS = 0.08;
const WHITE_SATURATION_GATE = 0.18;

// Upload sizing. A reference image is traced over, not read — accuracy comes from scaling the
// placed image to real mm, which is a float transform independent of pixel count. At this cap a
// cello plate still lands near 0.3mm per pixel, finer than a pointer can be placed. What the cap
// buys is that the base64 payload rides in `d.referenceImages` through every debounced
// working-state write and into the saved file, and a phone's default 12MP is enough to pass the
// ~5MB sessionStorage allows on its own (see helpers/workingStorage.ts).
const UPLOAD_MAX_EDGE_PX = 2400;
// Below this an upload passes through untouched: re-encoding a small, clean line drawing trades
// sharp edges for JPEG ringing and saves nothing worth having.
const UPLOAD_PASSTHROUGH_BYTES = 1_000_000;
const UPLOAD_JPEG_QUALITY = 0.85;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Owns image *pixels*, separately from the ImageShapes that place them on the canvas. Shapes
 * carry only an `imageRef` into this table, which is what keeps a multi-megabyte base64 payload
 * out of everything that copies geometry: ToolboxStore's 50-deep undo history, its sessionStorage
 * blob, recipe-base's `JSON.stringify(this.d)` snapshots, and per-frame drag previews.
 *
 * Session-scoped and not persisted itself — the recipe file is the durable home for hrefs (see
 * reference-image-schema.ts), and this table is rebuilt from it on load.
 *
 * Also owns the white-suppression cache: a suppressed variant is a property of the pixels, not of
 * any one shape placing them, so two shapes showing the same image share the work. Those variants
 * are `blob:` URLs rather than `data:` ones — see buildSuppressedHref for why that matters to
 * drag performance.
 */
@Injectable({ providedIn: 'root' })
export class ImageAssetStore {
  private assets = new Map<string, ImageAsset>();
  /** href -> ref, so re-interning the same image (a reload, or two shapes sharing it) reuses
   * one entry instead of duplicating the payload. */
  private refByHref = new Map<string, string>();
  /** ref -> `blob:` URL of the white-suppressed variant. Revoked on resetAll so the blobs don't
   * outlive the recipe they came from. */
  private suppressedHrefs = new Map<string, string>();
  private inFlight = new Set<string>();
  private listeners = new Set<() => void>();

  /** Fired when an async white-suppression pass finishes and the canvas should redraw. */
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  /** Adds an image to the table (or returns the existing ref for an href already in it) and
   * returns the ref an ImageShape should carry. */
  intern(href: string, naturalWidth?: number, naturalHeight?: number): string {
    const existing = this.refByHref.get(href);
    if (existing) {
      // A later intern may know the natural size when the first one didn't (e.g. a template's
      // href interned at load, then measured on demand).
      const asset = this.assets.get(existing)!;
      if (naturalWidth && naturalHeight) {
        asset.naturalWidth = naturalWidth;
        asset.naturalHeight = naturalHeight;
      }
      return existing;
    }
    const ref = makeAssetRef();
    this.assets.set(ref, { ref, href, naturalWidth, naturalHeight });
    this.refByHref.set(href, ref);
    return ref;
  }

  get(ref: string): ImageAsset | undefined {
    return this.assets.get(ref);
  }

  /** The raw source href for a ref, or undefined if the ref is unknown (e.g. a shape restored
   * from sessionStorage after the asset table was rebuilt without it). */
  href(ref: string): string | undefined {
    return this.assets.get(ref)?.href;
  }

  /**
   * The href to actually render for a shape. With suppression off this is the raw source; with
   * it on, the cached white-suppressed variant once it exists — the first call kicks off the
   * (async, canvas-based) pass and returns the raw href meanwhile, then notifies so the next
   * draw picks up the processed version.
   */
  displayHref(ref: string, suppressWhite: boolean): string | undefined {
    const href = this.href(ref);
    if (!href || !suppressWhite) return href;

    const cached = this.suppressedHrefs.get(ref);
    if (cached) return cached;

    if (!this.inFlight.has(ref)) {
      this.inFlight.add(ref);
      this.buildSuppressedHref(href)
        .then(result => {
          if (!result) return;
          // A resetAll during the pass drops the ref; keeping the blob then would leak it past
          // the recipe it belongs to, since resetAll has already been round to revoke.
          if (!this.assets.has(ref)) {
            URL.revokeObjectURL(result);
            return;
          }
          this.suppressedHrefs.set(ref, result);
          this.notify();
        })
        .finally(() => this.inFlight.delete(ref));
    }
    return href;
  }

  /** Natural pixel dimensions, measured and cached on first request — needed to place a newly
   * added image at the right aspect ratio. */
  async naturalSize(ref: string): Promise<{ w: number; h: number } | undefined> {
    const asset = this.assets.get(ref);
    if (!asset) return undefined;
    if (asset.naturalWidth && asset.naturalHeight) {
      return { w: asset.naturalWidth, h: asset.naturalHeight };
    }
    try {
      const img = await loadImage(asset.href);
      asset.naturalWidth = img.naturalWidth || img.width;
      asset.naturalHeight = img.naturalHeight || img.height;
      return { w: asset.naturalWidth, h: asset.naturalHeight };
    } catch {
      return undefined;
    }
  }

  /** Every interned asset — the save adapter reads this to resolve shapes' refs back to hrefs. */
  all(): ImageAsset[] {
    return [...this.assets.values()];
  }

  /** Drops every asset, e.g. when loading a new recipe file or template. Paired with
   * ToolboxStore.resetAll() so images and shapes can't outlive the file they came from. */
  resetAll(): void {
    this.assets.clear();
    this.refByHref.clear();
    this.suppressedHrefs.forEach(url => URL.revokeObjectURL(url));
    this.suppressedHrefs.clear();
  }

  /**
   * Redraws the image onto an offscreen canvas with near-white pixels faded to transparent, so a
   * scanned drawing on white paper reads correctly against a dark canvas. Pixels with any real
   * saturation are skipped outright, so this only eats paper, not the drawing on it.
   *
   * Hands back a `blob:` URL, never `toDataURL`. draw() tears down and rebuilds the whole scene
   * every pointermove, so the returned href is written into two attributes on every drag frame.
   * As a data URL that's megabytes of base64 per frame with a fresh resource identity each time —
   * a 3.8 MP cello scan drags visibly. A blob URL is a short, stable string the browser resolves
   * to an already-decoded image. Display only: the save adapter writes the raw href
   * (reference-image-schema.ts), so nothing durable ever holds one of these.
   */
  private async buildSuppressedHref(href: string): Promise<string | undefined> {
    try {
      const img = await loadImage(href);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) return undefined;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return undefined;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;

        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC <= 1e-6 ? 0 : (maxC - minC) / maxC;
        if (saturation > WHITE_SATURATION_GATE) continue;

        const whiteness = 1 - Math.max(Math.abs(1 - r), Math.abs(1 - g), Math.abs(1 - b));
        const fade = smoothstep(WHITE_THRESHOLD, WHITE_THRESHOLD + WHITE_SOFTNESS, whiteness);

        const alpha = data[i + 3] / 255;
        data[i + 3] = Math.max(0, Math.min(255, Math.round(alpha * (1 - fade) * 255)));
      }

      ctx.putImageData(imageData, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? URL.createObjectURL(blob) : undefined;
    } catch {
      // A cross-origin image taints the canvas and getImageData throws — fall back to the raw
      // href rather than failing the draw.
      return undefined;
    }
  }
}

/** `crossOrigin` false loads an image that will only ever be displayed — a host that sends no
 * CORS headers refuses the anonymous request outright, so asking is not free. See
 * loadLinkedImage, which needs both. */
function loadImage(src: string, crossOrigin = true): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** What prepareUploadedImage hands back — the pixels to intern, plus what was done to them. */
export type PreparedUpload = {
  dataUrl: string;
  width: number;
  height: number;
  /** Natural size of the file the user picked. Differs from width/height when it was scaled. */
  sourceWidth: number;
  sourceHeight: number;
  /** True when the returned pixels are not the file's own — scaled, re-encoded, or both. */
  changed: boolean;
};

/**
 * The size to re-encode an upload at, or null to keep the file exactly as picked.
 *
 * Split out from prepareUploadedImage because this is the part with a decision in it and the rest
 * is canvas plumbing, which jsdom can't run. Returning the *same* dimensions is meaningful: it
 * says re-encode without scaling, which is what a large image that's already under the cap needs.
 */
export function planUploadResize(
  width: number,
  height: number,
  byteLength: number,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;

  const longEdge = Math.max(width, height);
  if (longEdge <= UPLOAD_MAX_EDGE_PX && byteLength <= UPLOAD_PASSTHROUGH_BYTES) return null;

  const scale = Math.min(1, UPLOAD_MAX_EDGE_PX / longEdge);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether any pixel is less than fully opaque — decides PNG vs JPEG for the re-encode. */
function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

/**
 * Scales and re-encodes a freshly picked image file before it is interned, so a phone photo of a
 * plate doesn't become a multi-megabyte base64 payload in the working store and the saved recipe.
 *
 * Runs on the *upload* path only, never in intern() — intern also runs when a recipe file is
 * opened, and re-encoding there would degrade an already-saved image a little further on every
 * open-and-save cycle.
 *
 * Falls back to the untouched file whenever the pass can't improve on it: no canvas, a re-encode
 * that came out larger than the original, or a plan of null. Throws only if the file won't decode
 * at all, which is the same failure the caller already handles as a dismissed pick.
 */
export async function prepareUploadedImage(
  dataUrl: string,
  byteLength: number,
): Promise<PreparedUpload> {
  const img = await loadImage(dataUrl);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const unchanged: PreparedUpload = {
    dataUrl, width: sourceWidth, height: sourceHeight, sourceWidth, sourceHeight, changed: false,
  };

  const plan = planUploadResize(sourceWidth, sourceHeight, byteLength);
  if (!plan) return unchanged;

  // A JPEG source is opaque by definition, so skip the pixel scan for the common photo case.
  const encoded = reencodeImage(img, plan, /^data:image\/jpe?g/i.test(dataUrl));
  if (!encoded) return unchanged;

  // Lossless line art can encode larger than it arrived. Keep whichever is smaller, unless we
  // scaled — there the point was the pixel count, and the smaller raster wins regardless.
  const scaled = plan.width !== sourceWidth || plan.height !== sourceHeight;
  if (!scaled && encoded.length >= dataUrl.length) return unchanged;

  return {
    dataUrl: encoded,
    width: plan.width,
    height: plan.height,
    sourceWidth,
    sourceHeight,
    changed: true,
  };
}

/**
 * Redraws an already-decoded image at `plan` size and encodes it as a data URL — JPEG when the
 * pixels are opaque, PNG when any of them aren't.
 *
 * Returns undefined whenever the copy can't be made rather than throwing: no canvas to draw on,
 * or pixels that can't be read back, which is what a cross-origin image without CORS headers
 * does — it taints the canvas and getImageData throws. Both callers have something sensible to
 * do with the original in that case.
 */
function reencodeImage(
  img: HTMLImageElement,
  plan: { width: number; height: number },
  assumeOpaque: boolean,
): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, plan.width, plan.height);

    const opaque = assumeOpaque || !hasTransparency(ctx, plan.width, plan.height);
    return opaque
      ? canvas.toDataURL('image/jpeg', UPLOAD_JPEG_QUALITY)
      : canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

/** What prepareLinkedImage hands back. */
export type PreparedLink = {
  /** What to intern: a `data:` URL when the pixels could be copied, otherwise the link itself. */
  href: string;
  width: number;
  height: number;
  /** True when the picture now lives in the recipe. False means the recipe holds only the link,
   * so it shows nothing the day that link stops resolving — worth telling the user about. */
  inlined: boolean;
};

/**
 * Resolves a pasted image link into something placeable, copying the pixels into the recipe when
 * the host lets it.
 *
 * Inlining is the outcome worth having: a recipe that carries the picture opens the same in a
 * year, on a machine that has never seen the link, and white-suppression needs readable pixels.
 * So the load asks for CORS first. Plenty of hosts send no CORS headers, though, and an image
 * that displays perfectly well is not worth rejecting over that — a refused anonymous request
 * falls back to a plain load and the link itself becomes the href.
 *
 * Sizing follows the upload path: the pixels are about to ride in the saved file the same way, so
 * the same cap applies. Unlike an upload there is no passthrough case, since copying through a
 * canvas re-encodes whether or not it scales.
 *
 * Throws only if the URL doesn't decode as an image at all — the same failure a dismissed file
 * dialog already leaves the caller handling.
 */
export async function prepareLinkedImage(url: string): Promise<PreparedLink> {
  const img = await loadLinkedImage(url);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const plan = planUploadResize(width, height, Number.POSITIVE_INFINITY) ?? { width, height };
  const encoded = reencodeImage(img, plan, false);
  if (!encoded) return { href: url, width, height, inlined: false };

  return { href: encoded, width: plan.width, height: plan.height, inlined: true };
}

function loadLinkedImage(url: string): Promise<HTMLImageElement> {
  return loadImage(url).catch(() => loadImage(url, false));
}
