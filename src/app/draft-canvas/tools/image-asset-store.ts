import { Injectable } from '@angular/core';
import { applyWhiteSuppression } from './white-suppression';
import { warn } from '../../shared/message-emitter';

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

// keeps a phone photo well under sessionStorage's ~5MB budget, still finer than placement needs.
const UPLOAD_MAX_EDGE_PX = 2400;
// below this, re-encoding only adds JPEG artifacts for no size win.
const UPLOAD_PASSTHROUGH_BYTES = 1_000_000;
const UPLOAD_JPEG_QUALITY = 0.85;

type WorkerResponse = { id: number; blob: Blob } | { id: number; error: string };

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
 * any one shape placing them, so two shapes showing the same image share the work.
 */
@Injectable({ providedIn: 'root' })
export class ImageAssetStore {
  private assets = new Map<string, ImageAsset>();
  /** href -> ref, so re-interning the same image (a reload, or two shapes sharing it) reuses
   * one entry instead of duplicating the payload. */
  private refByHref = new Map<string, string>();
  /** ref -> `blob:` URL of the white-suppressed variant, revoked on resetAll. */
  private suppressedHrefs = new Map<string, string>();
  /** Refs whose pixels the browser has refused to hand back — e.g. a host with no CORS header,
   * so getImageData throws no matter how many times we ask. Cached so we stop retrying a fetch
   * that can only ever fail, and so the UI can disable suppression for that image. */
  private unsuppressible = new Set<string>();
  private inFlight = new Set<string>();
  private listeners = new Set<() => void>();
  // The per-pixel pass runs off the main thread when available (see getWorker), so a large image
  // doesn't visibly block/flash while it's first suppressed.
  private worker: Worker | null | undefined;
  private workerRequestSeq = 0;
  private workerPending = new Map<number, (blob: Blob | undefined) => void>();

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
    if (!href || !suppressWhite || this.unsuppressible.has(ref)) return href;

    const cached = this.suppressedHrefs.get(ref);
    if (cached) return cached;

    if (!this.inFlight.has(ref)) {
      this.inFlight.add(ref);
      this.buildSuppressedHref(ref, href)
        .then(result => {
          if (!result) return;
          // resetAll may have run mid-flight; revoke rather than leak the blob.
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
    this.unsuppressible.clear();
  }

  /**
   * White-suppresses the image and returns a `blob:` URL, not a data URL — draw() rewrites it
   * every pointermove, and a multi-MB base64 string there drags visibly. Display only; the save
   * adapter writes the raw href instead.
   *
   * Prefers a worker (see white-suppression.worker.ts) so the per-pixel pass doesn't block the
   * main thread on a large image; falls back to doing it here — same algorithm, main-thread
   * canvas — when a worker isn't available or the transfer fails (e.g. jsdom in tests, or a
   * cross-origin image tainting the canvas).
   *
   * A thrown error here means the browser will never hand back this image's pixels — most often
   * a host with no CORS header, which rejects the crossOrigin load outright — so it's cached as
   * permanent via markUnsuppressible rather than retried on every render.
   */
  private async buildSuppressedHref(ref: string, href: string): Promise<string | undefined> {
    try {
      const img = await loadImage(href);
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) return undefined;

      const blob = (await this.suppressViaWorker(img)) ?? (await this.suppressOnMainThread(img, width, height));
      return blob ? URL.createObjectURL(blob) : undefined;
    } catch {
      this.markUnsuppressible(ref);
      return undefined;
    }
  }

  /** Whether displayHref can ever produce a suppressed variant for this ref — false once a
   * suppression attempt has actually failed. Settings-bar disables the toggle off this. */
  isSuppressible(ref: string): boolean {
    return !this.unsuppressible.has(ref);
  }

  private markUnsuppressible(ref: string): void {
    if (this.unsuppressible.has(ref)) return;
    this.unsuppressible.add(ref);
    warn(
      "This image's source doesn't allow the browser to read its pixels, so its background can't "
      + 'be faded. The image still displays normally.',
      'Background suppression unavailable',
    );
    this.notify();
  }

  private suppressOnMainThread(img: HTMLImageElement, width: number, height: number): Promise<Blob | undefined> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return Promise.resolve(undefined);

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    applyWhiteSuppression(imageData);
    ctx.putImageData(imageData, 0, 0);

    return new Promise(resolve => canvas.toBlob(blob => resolve(blob ?? undefined), 'image/png'));
  }

  private async suppressViaWorker(img: HTMLImageElement): Promise<Blob | undefined> {
    const worker = this.getWorker();
    if (!worker) return undefined;
    const bitmap = await createImageBitmap(img);
    const id = ++this.workerRequestSeq;
    return new Promise(resolve => {
      this.workerPending.set(id, resolve);
      worker.postMessage({ id, bitmap }, [bitmap]);
    });
  }

  private getWorker(): Worker | null {
    if (this.worker !== undefined) return this.worker;
    if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
      this.worker = null;
      return null;
    }
    const worker = new Worker(new URL('./white-suppression.worker', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const resolve = this.workerPending.get(e.data.id);
      this.workerPending.delete(e.data.id);
      resolve?.('blob' in e.data ? e.data.blob : undefined);
    };
    worker.onerror = () => {
      this.workerPending.forEach(resolve => resolve(undefined));
      this.workerPending.clear();
    };
    this.worker = worker;
    return worker;
  }
}

// crossOrigin false skips the CORS request, for images that will only ever be displayed.
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

// split out so the decision logic is testable under jsdom, which can't run the canvas plumbing.
// returning the same width/height (not null) means: re-encode without scaling.
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

// runs only on fresh uploads, not intern() — that also fires on recipe load, where re-encoding
// would degrade an already-saved image further each open-save cycle. falls back to the original
// whenever the re-encode doesn't actually improve on it.
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

  // keep whichever is smaller, unless we scaled — then the smaller raster wins regardless.
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

// returns undefined (rather than throwing) when the redraw can't happen — no canvas, or a
// cross-origin image tainting getImageData — so callers fall back to the original.
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
  /** False means the recipe holds only the link, and breaks if it stops resolving. */
  inlined: boolean;
};

// tries a CORS load first so the pixels can be copied in; falls back to a plain load (link kept
// as the href) when the host refuses anonymous requests. sizing follows the upload cap.
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
