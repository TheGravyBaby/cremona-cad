import { Injectable } from '@angular/core';
import { NamedReferenceImage, ReferenceImage } from '../models/types';

/**
 * Holds the reference-image tab data and "mode" state that both draft-canvas.ts (rendering +
 * on-canvas pointer/keyboard drag-to-reposition) and tool-palette.ts (the popup form UI) need to
 * read/write — same root-provided-singleton pattern as ToolboxStore, for the same reason: the
 * alternative is prop-drilling a dozen-plus `@Input()`/`@Output()` pairs through the palette for
 * what's fundamentally shared mutable state between two components.
 *
 * This is a pure in-memory relocation of state that used to live on DraftCanvasComponent — it
 * does not persist itself. The array's actual save/load-to-file lifecycle stays owned by
 * recipe-base.ts via draft-canvas's existing `@Input() referenceImages`/`@Output()
 * referenceImagesChange`, unchanged.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceImageStore {
  private _images: NamedReferenceImage[] = [];
  private _activeId: string | null = null;
  private _resetBaseline?: NamedReferenceImage;
  private listeners = new Set<() => void>();

  /** No UI control exists for this today (always true) — carried along as-is from the
   * pre-extraction code, which also never exposed a checkbox for it. */
  public lockAspect = true;
  public refAspect = 1;

  /** Doubles as "is the Reference popup open" and "are on-canvas drag/resize handles enabled" —
   * one flag for both, matching the pre-extraction `referenceModeEnabled` exactly. */
  public referenceModeEnabled = false;
  public showReferenceImage = true;
  public opacity = 0.25;
  private redrawListeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    this.listeners.forEach(cb => cb());
  }

  /** Cosmetic-only changes (currently just opacity) that should redraw the canvas but must NOT
   * go through onChange's full "emit upward + persist" — opacity was never part of the saved
   * per-image data (it isn't a `ReferenceImage` field), and firing a whole-recipe sessionStorage
   * write on every tick of a slider drag would be a real perf regression, the same class of
   * issue already fixed elsewhere for per-frame snap-engine rebuilds and shape drags. */
  onRedraw(cb: () => void): () => void {
    this.redrawListeners.add(cb);
    return () => this.redrawListeners.delete(cb);
  }

  private notifyRedraw(): void {
    this.redrawListeners.forEach(cb => cb());
  }

  get images(): NamedReferenceImage[] { return this._images; }
  get activeId(): string | null { return this._activeId; }
  get active(): NamedReferenceImage | null {
    return this._images.find(r => r.id === this._activeId) ?? null;
  }

  /** External sync from draft-canvas's `@Input() referenceImages` — keeps the active tab
   * pointing at a live entry (or the first one), same guard as before. Deliberately doesn't
   * notify: this runs on every parent change-detection pass, not a discrete user action. */
  setImages(images: NamedReferenceImage[]): void {
    this._images = images;
    if (!this._images.some(r => r.id === this._activeId)) {
      this._activeId = this._images[0]?.id ?? null;
      this.captureResetBaseline();
    }
  }

  /** Snapshots the active tab so Reset can restore it and aspect-lock is seeded. */
  private captureResetBaseline(): void {
    const active = this.active;
    this._resetBaseline = active ? { ...active } : undefined;
    if (active?.height) this.refAspect = Math.abs(active.width / active.height) || 1;
  }

  selectTab(id: string): void {
    if (this._activeId === id) return;
    this._activeId = id;
    this.captureResetBaseline();
    this.notify();
  }

  setReferenceModeEnabled(value: boolean): void {
    if (this.referenceModeEnabled === value) return;
    this.referenceModeEnabled = value;
    if (value) this.captureResetBaseline();
    this.notify();
  }

  toggleMode(): void {
    this.setReferenceModeEnabled(!this.referenceModeEnabled);
  }

  setShowReferenceImage(value: boolean): void {
    this.showReferenceImage = value;
    this.notify();
  }

  setOpacity(value: number): void {
    this.opacity = Math.max(0, Math.min(1, value));
    this.notifyRedraw();
  }

  /** Silent in-place update during an interactive drag/scale/keyboard-nudge — see
   * reference-image-controller.ts's `onChange` callback. Deliberately does not notify: emitting
   * (and so writing the recipe's sessionStorage snapshot, via draft-canvas's subscription) on
   * every pointermove would be the same per-frame perf issue already fixed elsewhere for the
   * snap engine. draft-canvas explicitly emits once itself when the gesture ends. */
  applyLiveUpdate(img?: ReferenceImage): void {
    if (!img || !this._activeId) return;
    const idx = this._images.findIndex(r => r.id === this._activeId);
    if (idx < 0) return;
    this._images[idx] = { ...this._images[idx], ...img };
  }

  replaceActive(next: NamedReferenceImage): void {
    const idx = this._images.findIndex(r => r.id === next.id);
    if (idx < 0) return;
    this._images[idx] = next;
    this.notify();
  }

  addImage(named: NamedReferenceImage): void {
    this._images = [...this._images, named];
    this._activeId = named.id;
    this._resetBaseline = { ...named };
    this.notify();
  }

  deleteTab(id: string): void {
    const idx = this._images.findIndex(r => r.id === id);
    if (idx < 0) return;
    this._images = this._images.filter(r => r.id !== id);
    if (this._activeId === id) {
      this._activeId = this._images[Math.min(idx, this._images.length - 1)]?.id ?? null;
      this.captureResetBaseline();
    }
    this.notify();
  }

  renameTab(id: string, label: string): void {
    const tab = this._images.find(r => r.id === id);
    if (tab) tab.label = (label ?? '').trim() || tab.label;
    this.notify();
  }

  nextLabel(): string {
    return `Img ${this._images.length + 1}`;
  }

  /** Same field-by-field logic as the old draft-canvas.ts `onRefParamChange` (the
   * ReferenceImageController's own copy of this was dead code — never called). */
  setParam(key: keyof ReferenceImage, val: number): void {
    const active = this.active;
    if (!active) return;
    const v = Number(val) || 0;
    const minMm = 1;
    const next: NamedReferenceImage = { ...active };

    if (key === 'x' || key === 'y') {
      (next as any)[key] = v;
    } else if (key === 'rotationDeg') {
      next.rotationDeg = this.normalizeRotationDeg(v);
    } else if (key === 'width') {
      next.width = Math.max(minMm, v);
      if (this.lockAspect) next.height = Math.max(minMm, Math.round(next.width / (this.refAspect || 1)));
    } else if (key === 'height') {
      next.height = Math.max(minMm, v);
      if (this.lockAspect) next.width = Math.max(minMm, Math.round(next.height * (this.refAspect || 1)));
    }

    const idx = this._images.findIndex(r => r.id === next.id);
    if (idx < 0) return;
    this._images[idx] = next;
    this.notify();
  }

  resetActive(): void {
    const baseline = this._resetBaseline;
    if (!baseline || baseline.id !== this._activeId) return;
    const idx = this._images.findIndex(r => r.id === baseline.id);
    if (idx < 0) return;
    this._images[idx] = { ...baseline };
    this.notify();
  }

  private normalizeRotationDeg(deg: number): number {
    const v = deg % 360;
    return v < 0 ? v + 360 : v;
  }
}
