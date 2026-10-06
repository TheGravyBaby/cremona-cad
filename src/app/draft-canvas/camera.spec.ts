// @vitest-environment node
import { Camera } from './camera';
import { Pt } from '../models/types';

/** A hard ctrl+scroll used to drive pxPerMm to ~0, which made the viewport span millions of mm
 * and left the grid loops in axis-grid-controller appending a line per grid step across it until
 * the tab died. The limits live on Camera so every zoom path — wheel, pinch, buttons, fit — is
 * covered by the same clamp. */
describe('Camera zoom limits', () => {
  const pxW = 1000;
  const pxH = 800;

  it('clamps a runaway zoom-out to the floor', () => {
    const cam = new Camera();
    cam.applyZoom(1e-9, pxW, pxH);
    expect(cam.pxPerMm).toBe(Camera.MIN_PX_PER_MM);
  });

  it('clamps a runaway zoom-in to the ceiling', () => {
    const cam = new Camera();
    cam.applyZoomAt(new Pt(0, 0), 1e9, pxW, pxH);
    expect(cam.pxPerMm).toBe(Camera.MAX_PX_PER_MM);
  });

  it('leaves the camera alone once a gesture keeps pushing past the floor', () => {
    const cam = new Camera();
    const anchor = new Pt(120, -40);

    cam.applyZoomAt(anchor, 1e-9, pxW, pxH);
    const settled = { pxPerMm: cam.pxPerMm, offsetX: cam.offsetX, offsetY: cam.offsetY };

    // further events in the same gesture must be no-ops, not offset drift at a fixed zoom
    cam.applyZoomAt(anchor, 1e-12, pxW, pxH);
    expect(cam.pxPerMm).toBe(settled.pxPerMm);
    expect(cam.offsetX).toBe(settled.offsetX);
    expect(cam.offsetY).toBe(settled.offsetY);
  });

  it('keeps the viewport to a drawable span at the floor', () => {
    const cam = new Camera();
    cam.applyZoom(0, pxW, pxH);
    const vb = cam.getViewBox(pxW, pxH);

    // grid/tick loops step across this span, so it has to stay countable
    expect(vb.mmW).toBeLessThan(50_000);
    expect(vb.mmH).toBeLessThan(50_000);
  });

  it('clamps a fit to degenerate bounds', () => {
    const cam = new Camera();
    cam.fitToBounds({ pt1: new Pt(0, 0), pt2: new Pt(0, 0) }, pxW, pxH);
    expect(cam.pxPerMm).toBe(Camera.MAX_PX_PER_MM);
  });
});

describe('Camera typed views', () => {
  it('reads back the centre it was pointed at', () => {
    const cam = new Camera();
    cam.lookAt(new Pt(12.5, -180), 3, 1000, 800);

    expect(cam.pxPerMm).toBe(3);
    expect(cam.centre(1000, 800).x).toBeCloseTo(12.5, 9);
    expect(cam.centre(1000, 800).y).toBeCloseTo(-180, 9);
  });

  it('centres on the same drawing point whatever the window size', () => {
    const a = new Camera();
    const b = new Camera();
    a.lookAt(new Pt(40, 90), 2, 1000, 800);
    b.lookAt(new Pt(40, 90), 2, 1600, 500);

    const midA = a.getViewBox(1000, 800);
    const midB = b.getViewBox(1600, 500);
    expect(midA.leftBound + midA.mmW / 2).toBeCloseTo(midB.leftBound + midB.mmW / 2, 9);
    expect(midA.topBound + midA.mmH / 2).toBeCloseTo(midB.topBound + midB.mmH / 2, 9);
  });

  // y up, as the axis numbers read: a positive centre puts the view above the X axis
  it('takes y up', () => {
    const cam = new Camera();
    cam.lookAt(new Pt(0, 500), 2, 1000, 800);

    expect(-cam.getViewBox(1000, 800).bottomBound).toBeGreaterThan(0);
  });

  it('clamps a typed zoom', () => {
    const cam = new Camera();
    cam.lookAt(new Pt(0, 0), -5, 1000, 800);
    expect(cam.pxPerMm).toBe(Camera.MIN_PX_PER_MM);
  });
});
