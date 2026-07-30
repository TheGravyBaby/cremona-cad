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
 * reference-image-schema.ts), and this table is rebuilt from it on load, same lifecycle as
 * ToolboxStore's shapes.
 *
 * Also owns the white-suppression cache, since a suppressed variant is a property of the pixels
 * rather than of any one shape placing them: two shapes showing the same image share the work.
 */
@Injectable({ providedIn: 'root' })
export class ImageAssetStore {
  private assets = new Map<string, ImageAsset>();
  /** href -> ref, so re-interning the same image (a reload, or two shapes sharing it) reuses
   * one entry instead of duplicating the payload. */
  private refByHref = new Map<string, string>();
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
          if (result) {
            this.suppressedHrefs.set(ref, result);
            this.notify();
          }
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
    this.suppressedHrefs.clear();
  }

  /**
   * Redraws the image onto an offscreen canvas with near-white pixels faded to transparent, so a
   * scanned drawing on white paper reads correctly against a dark canvas. Pixels with any real
   * saturation are skipped outright, so this only eats paper, not the drawing on it.
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
      return canvas.toDataURL('image/png');
    } catch {
      // A cross-origin image taints the canvas and getImageData throws — fall back to the raw
      // href rather than failing the draw.
      return undefined;
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
