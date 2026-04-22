import { Pt } from '../models/types';

export type Bounds = { pt1: Pt; pt2: Pt };

export class Camera {
  // px per world-mm
  public pxPerMm: number;
  // world coordinate (mm) of the top-left corner of the view
  public offsetX: number;
  public offsetY: number;

  constructor(pxPerMm = 1.5, offsetX = -360, offsetY = -400) {
    this.pxPerMm = pxPerMm;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  getViewBox(pxW: number, pxH: number) {
    const mmW = pxW / Math.max(1e-12, this.pxPerMm);
    const mmH = pxH / Math.max(1e-12, this.pxPerMm);
    const leftBound = this.offsetX;
    const topBound = this.offsetY;
    const rightBound = leftBound + mmW;
    const bottomBound = topBound + mmH;

    return { leftBound, rightBound, topBound, bottomBound, mmW, mmH };
  }

  fitToBounds(bounds: Bounds, pxW: number, pxH: number) {
    // follow the same conventions as the legacy code: world Y is up, so
    // bounds.pt1.y / pt2.y should be inverted when computing view extents
    const minX = Math.min(bounds.pt1.x, bounds.pt2.x);
    const maxX = Math.max(bounds.pt1.x, bounds.pt2.x);
    const minY = Math.min(-bounds.pt1.y, -bounds.pt2.y);
    const maxY = Math.max(-bounds.pt1.y, -bounds.pt2.y);

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    const padding = 0.05; 
    const paddedWidth = boundsWidth * (1 + padding * 2);
    const paddedHeight = boundsHeight * (1 + padding * 2);

    const zoomX = pxW / Math.max(1e-12, paddedWidth);
    const zoomY = pxH / Math.max(1e-12, paddedHeight);

    this.pxPerMm = Math.min(zoomX, zoomY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const mmW = pxW / this.pxPerMm;
    const mmH = pxH / this.pxPerMm;

    this.offsetX = centerX - mmW / 2;
    this.offsetY = centerY - mmH / 2;
  }

  applyZoom(newPxPerMm: number, pxW: number, pxH: number) {
    // console.log('Applying zoom', { newPxPerMm, pxW, pxH });
    // console.log('Current camera state', {
    //   pxPerMm: this.pxPerMm,
    //   offsetX: this.offsetX,
    //   offsetY: this.offsetY,
    // });

    const oldPxPerMm = this.pxPerMm;
    if (!isFinite(newPxPerMm) || newPxPerMm <= 0) return;

    const oldMmW = pxW / oldPxPerMm;
    const oldMmH = pxH / oldPxPerMm;

    const centerX = this.offsetX + oldMmW / 2;
    const centerY = this.offsetY + oldMmH / 2;

    this.pxPerMm = newPxPerMm;

    const newMmW = pxW / this.pxPerMm;
    const newMmH = pxH / this.pxPerMm;

    this.offsetX = centerX - newMmW / 2;
    this.offsetY = centerY - newMmH / 2;

    // console.log('Updated camera state', { pxPerMm: this.pxPerMm, offsetX: this.offsetX, offsetY: this.offsetY });
  }

  /**
   * Zoom while keeping an arbitrary world-space anchor point fixed in screen space.
   * This lets us zoom into the location the user double-clicked.
   */
  applyZoomAt(anchor: Pt, newPxPerMm: number, pxW: number, pxH: number) {
    const oldPxPerMm = this.pxPerMm;
    if (!isFinite(newPxPerMm) || newPxPerMm <= 0) return;

    // If pxPerMm didn't change, nothing to do
    if (Math.abs(newPxPerMm - oldPxPerMm) < 1e-12) return;

    // Keep the anchor world point mapping to the same screen pixel.
    // Screen px of a world-x is (anchor.x - offsetX) * pxPerMm.
    // Solve for new offsetX so that (anchor.x - offsetX_new) * newPxPerMm == (anchor.x - offsetX_old) * oldPxPerMm
    const oldOffsetX = this.offsetX;
    const oldOffsetY = this.offsetY;

    this.pxPerMm = newPxPerMm;

    this.offsetX = anchor.x - ((anchor.x - oldOffsetX) * oldPxPerMm) / newPxPerMm;
    this.offsetY = anchor.y - ((anchor.y - oldOffsetY) * oldPxPerMm) / newPxPerMm;
  }

  panByPx(dxPx: number, dyPx: number) {
    const dxMm = dxPx / this.pxPerMm;
    const dyMm = dyPx / this.pxPerMm;
    this.offsetX -= dxMm;
    this.offsetY -= dyMm;
  }
}
