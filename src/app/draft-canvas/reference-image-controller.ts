import * as d3 from 'd3';
import { Pt, ReferenceImage } from '../models/types';

export class ReferenceImageController {
  private image?: ReferenceImage;
  public isInteracting = false;
  public activeHandle: 'nw' | 'ne' | 'sw' | 'se' | null = null;

  private dragStartPt?: Pt;
  private startImage?: ReferenceImage;
  private anchorPt?: Pt;

  private handlePx = 12; // screen px
  private hitSlopPx = 10; // screen px

  private onChange: (img?: ReferenceImage) => void;

  constructor(img?: ReferenceImage, onChange?: (img?: ReferenceImage) => void) {
    this.image = img;
    this.onChange = onChange || (() => {});
  }

  getImage() {
    return this.image;
  }

  setImage(img?: ReferenceImage) {
    this.image = img;
    this.onChange(img);
  }

  clear() {
    this.setImage(undefined);
  }

  private handleRmm(pxPerMm: number) {
    return this.handlePx / pxPerMm;
  }

  private hitSlopMm(pxPerMm: number) {
    return this.hitSlopPx / pxPerMm;
  }

  private imageBounds(img: ReferenceImage) {
    const x0 = Math.min(img.x, img.x + img.width);
    const x1 = Math.max(img.x, img.x + img.width);
    const y0 = Math.min(img.y, img.y + img.height);
    const y1 = Math.max(img.y, img.y + img.height);
    return { x0, x1, y0, y1 };
  }

  pointInImage(pt: Pt): boolean {
    if (!this.image) return false;
    const b = this.imageBounds(this.image);
    // caller must pass current pxPerMm when using hitTestHandle; pointInImage used when we already have pxPerMm
    // but here we treat hitSlop as zero; caller can use hitTestHandle instead for slop-aware checks.
    return pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 && pt.y <= b.y1;
  }

  cornerPts(img?: ReferenceImage) {
    const I = img ?? this.image;
    if (!I) return { sw: { x: 0, y: 0 }, se: { x: 0, y: 0 }, nw: { x: 0, y: 0 }, ne: { x: 0, y: 0 } };
    const x0 = I.x;
    const y0 = I.y;
    const x1 = I.x + I.width;
    const y1 = I.y + I.height;
    return {
      sw: { x: x0, y: y0 },
      se: { x: x1, y: y0 },
      nw: { x: x0, y: y1 },
      ne: { x: x1, y: y1 },
    };
  }

  hitTestHandle(pt: Pt, pxPerMm: number): 'nw' | 'ne' | 'sw' | 'se' | null {
    if (!this.image) return null;
    const corners = this.cornerPts(this.image);
    const r = this.handleRmm(pxPerMm) + this.hitSlopMm(pxPerMm);

    const dist2 = (a: Pt, b: Pt) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };

    const r2 = r * r;
    let best: { h: any; d2: number } | null = null;
    (['nw', 'ne', 'sw', 'se'] as const).forEach(h => {
      const d2 = dist2(pt, corners[h]);
      if (d2 <= r2 && (!best || d2 < best.d2)) best = { h, d2 };
    });

    return (best?.h ?? null);
  }

  startDrag(pt: Pt) {
    if (!this.image) return;
    this.isInteracting = true;
    this.activeHandle = null;
    this.dragStartPt = pt;
    this.startImage = { ...this.image };
  }

  updateDrag(pt: Pt) {
    if (!this.image || !this.startImage || !this.dragStartPt) return;
    const dx = pt.x - this.dragStartPt.x;
    const dy = pt.y - this.dragStartPt.y;
    this.image = { ...this.image, x: this.startImage.x + dx, y: this.startImage.y + dy };
    this.onChange(this.image);
  }

  startScale(pt: Pt, handle: 'nw' | 'ne' | 'sw' | 'se') {
    if (!this.image) return;
    this.isInteracting = true;
    this.activeHandle = handle;
    this.dragStartPt = pt;
    this.startImage = { ...this.image };

    const corners = this.cornerPts(this.startImage);
    const anchorKey =
      handle === 'nw' ? 'se' :
        handle === 'ne' ? 'sw' :
          handle === 'sw' ? 'ne' : 'nw';

    this.anchorPt = corners[anchorKey];
  }

  updateScale(pt: Pt) {
    if (!this.image || !this.startImage || !this.anchorPt || !this.activeHandle) return;

    const startW = this.startImage.width;
    const startH = this.startImage.height;
    const aspect = Math.abs(startW / startH) || 1;

    const dx = pt.x - this.anchorPt.x;
    const dy = pt.y - this.anchorPt.y;

    let targetW = Math.abs(dx);
    let targetH = Math.abs(dy);

    if (targetW / Math.max(targetH, 1e-6) > aspect) {
      targetW = targetH * aspect;
    } else {
      targetH = targetW / aspect;
    }

    const minMm = 10;
    targetW = Math.max(minMm, targetW);
    targetH = Math.max(minMm, targetH);

    const anchorIsWest = (this.activeHandle === 'ne' || this.activeHandle === 'se');
    const anchorIsSouth = (this.activeHandle === 'ne' || this.activeHandle === 'nw');

    const newX = anchorIsWest ? this.anchorPt.x : this.anchorPt.x - targetW;
    const newY = anchorIsSouth ? this.anchorPt.y : this.anchorPt.y - targetH;

    this.image = { ...this.image, x: newX, y: newY, width: targetW, height: targetH };
    this.onChange(this.image);
  }

  endInteraction() {
    this.isInteracting = false;
    this.activeHandle = null;
    this.dragStartPt = undefined;
    this.anchorPt = undefined;
    this.startImage = undefined;
  }

  // Called from the parent pointer move handler
  onPointerMove(pt: Pt) {
    if (!this.isInteracting) return false;
    if (this.activeHandle) this.updateScale(pt);
    else this.updateDrag(pt);
    return true;
  }

  // drawing helpers
  drawImage(gRoot: any) {
    if (!this.image?.href) return;
    const { href, x, y, width, height } = this.image;

    const img = gRoot.append('image')
      .attr('class', 'reference-image')
      .attr('href', href)
      .attr('xlink:href', href)
      .attr('transform', `translate(0 ${height}) scale(1 -1)`)
      .attr('x', x)
      .attr('y', -y)
      .attr('width', width)
      .attr('height', height)
      .attr('opacity', 0.25)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    img.lower();
  }

  drawControls(gRoot: any, pxPerMm: number) {
    if (!this.image?.href) return;
    const img = this.image;
    const corners = this.cornerPts(img);
    const r = this.handleRmm(pxPerMm);

    gRoot.append('rect')
      .attr('x', img.x)
      .attr('y', img.y)
      .attr('width', img.width)
      .attr('height', img.height)
      .attr('fill', 'none')
      .attr('stroke', '#bb1212ff')
      .attr('stroke-width', 2 / pxPerMm)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');

    const handles = (['nw', 'ne', 'sw', 'se'] as const).map(h => ({ h, ...corners[h] }));

    gRoot.append('g')
      .attr('class', 'ref-handles')
      .selectAll('circle')
      .data(handles)
      .enter()
      .append('circle')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', r)
      .attr('fill', '#fff')
      .attr('stroke', '#bb1212ff')
      .attr('stroke-width', 2 / pxPerMm)
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'none');
  }

  onRefParamChange(key: keyof ReferenceImage, val: number, lockAspect: boolean, refAspect: number) {
    if (!this.image) return;
    const v = Number(val) || 0;
    const minMm = 1;
    let next: ReferenceImage = { ...this.image } as ReferenceImage;

    if (key === 'x' || key === 'y') {
      (next as any)[key] = v;
    } else if (key === 'width') {
      next.width = Math.max(minMm, v);
      if (lockAspect) next.height = Math.max(minMm, Math.round(next.width / (refAspect || 1)));
    } else if (key === 'height') {
      next.height = Math.max(minMm, v);
      if (lockAspect) next.width = Math.max(minMm, Math.round(next.height * (refAspect || 1)));
    }

    this.image = next;
    this.onChange(this.image);
  }

  handleKeyboard(event: KeyboardEvent, lockAspect: boolean, refAspect: number) {
    if (!this.image) return false;

    const stepMm = 1;
    const scaleStep = 1.05;
    let dx = 0;
    let dy = 0;
    let scale: number | null = null;

    switch (event.key) {
      case 'ArrowUp':
        if (event.ctrlKey) scale = scaleStep;
        else dy += stepMm;
        break;
      case 'ArrowDown':
        if (event.ctrlKey) scale = 1 / scaleStep;
        else dy -= stepMm;
        break;
      case 'ArrowLeft':
        dx -= stepMm;
        break;
      case 'ArrowRight':
        dx += stepMm;
        break;
      default:
        return false;
    }

    if (scale !== null) {
      const img = this.image;
      const minMm = 1;
      const cx = img.x + img.width / 2;
      const cy = img.y + img.height / 2;

      let newW = Math.max(minMm, img.width * scale);
      let newH = Math.max(minMm, img.height * scale);
      const aspect = Math.abs(img.width / img.height) || 1;
      newH = Math.max(minMm, newW / aspect);

      const newX = cx - newW / 2;
      const newY = cy - newH / 2;

      this.image = { ...img, x: newX, y: newY, width: newW, height: newH };
    } else {
      this.image = { ...this.image, x: this.image.x + dx, y: this.image.y + dy };
    }

    this.onChange(this.image);
    return true;
  }
}
