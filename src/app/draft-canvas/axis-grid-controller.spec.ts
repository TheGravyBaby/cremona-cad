import * as d3 from 'd3';
import { AxisGridController, CanvasViewport } from './axis-grid-controller';
import { Camera } from './camera';

// a too-fine step, or a coarse one at a far zoom-out, used to mean thousands of SVG nodes per
// redraw; the step is now coarsened to hold a minimum on-screen spacing.
describe('AxisGridController step coarsening', () => {
  const PX_W = 1200;
  const PX_H = 800;

  function makeGroup() {
    return d3.select(document.createElementNS('http://www.w3.org/2000/svg', 'g'));
  }

  function viewport(pxPerMm: number, offsetX = -400, offsetY = -300): CanvasViewport {
    return new Camera(pxPerMm, offsetX, offsetY).getViewBox(PX_W, PX_H);
  }

  function draw(
    stepMm: number,
    pxPerMm: number,
    { cv = viewport(pxPerMm), showAxes = true }: { cv?: CanvasViewport; showAxes?: boolean } = {},
  ) {
    const controller = new AxisGridController(`axis-grid-spec-${Math.random()}`);
    controller.updatePreferences({
      showGrid: true, showAxes, showGridX: true, showGridY: true,
      gridStepX: stepMm, gridStepY: stepMm,
    });

    const gRoot = makeGroup();
    const gUI = makeGroup();
    controller.draw(gRoot, gUI, cv, pxPerMm);

    return {
      lines: gRoot.selectAll('line').nodes() as SVGLineElement[],
      labels: gUI.selectAll('text').nodes() as SVGTextElement[],
    };
  }

  it('keeps a 0.1mm grid drawable at ordinary zoom', () => {
    const { lines } = draw(0.1, 1.5);

    // unbounded this was ~8000 lines for the same viewport
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan((PX_W + PX_H) / 4 + 10);
  });

  it('holds the line count down at the zoom floor', () => {
    const { lines } = draw(50, Camera.MIN_PX_PER_MM);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan((PX_W + PX_H) / 4 + 10);
  });

  it('leaves a comfortable step untouched', () => {
    const pxPerMm = 1.5;
    const { lines } = draw(50, pxPerMm);
    const cv = viewport(pxPerMm);

    // every horizontal line still sits on a 50mm multiple, at the density asked for
    const ys = lines.filter(l => l.getAttribute('x1') === `${cv.leftBound}`)
      .map(l => Number(l.getAttribute('y1')));
    expect(ys.length).toBeGreaterThan(5);
    for (const y of ys) expect(Math.abs(y % 50)).toBeLessThan(1e-6);
  });

  it('coarsens onto multiples of the configured step, never off it', () => {
    const { lines } = draw(0.3, 60);
    const xs = lines.filter(l => l.getAttribute('y1') !== l.getAttribute('y2'))
      .map(l => Number(l.getAttribute('x1')));

    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(Math.abs(Math.round(x / 0.3) - x / 0.3)).toBeLessThan(1e-6);
  });

  it('draws only the visible span when panned far from the origin', () => {
    const pxPerMm = 1.5;
    const cv = viewport(pxPerMm, 100_000, 100_000);
    // axes off: those two lines are drawn at the origin whether it's on screen or not
    const { lines } = draw(50, pxPerMm, { cv, showAxes: false });

    // the loops used to run from 0,0 out to the viewport — 2000 off-screen lines for this pan
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan((PX_W + PX_H) / 4 + 10);
    for (const line of lines) {
      const x = Number(line.getAttribute('x1'));
      const y = Number(line.getAttribute('y1'));
      if (line.getAttribute('y1') === line.getAttribute('y2')) {
        expect(y).toBeGreaterThanOrEqual(-cv.bottomBound);
        expect(y).toBeLessThanOrEqual(-cv.topBound);
      } else {
        expect(x).toBeGreaterThanOrEqual(cv.leftBound);
        expect(x).toBeLessThanOrEqual(cv.rightBound);
      }
    }
  });

  it('puts every tick label on a drawn grid line', () => {
    // 0.1mm at this zoom coarsens the grid one rung and the labels several more; the two ladders
    // have to stay nested or labels sit between lines
    const pxPerMm = 60;
    const { lines, labels } = draw(0.1, pxPerMm);
    const cv = viewport(pxPerMm);

    const verticals = new Set(
      lines.filter(l => l.getAttribute('y1') !== l.getAttribute('y2'))
        .map(l => Number(l.getAttribute('x1')).toFixed(6)),
    );
    const labelXs = labels
      .filter(t => /^-?[\d.]+$/.test(t.textContent ?? ''))
      .map(t => Number(t.textContent));

    expect(labelXs.length).toBeGreaterThan(0);
    for (const x of labelXs) {
      if (x < cv.leftBound || x > cv.rightBound) continue; // a Y label, read off the other axis
      expect(verticals.has(x.toFixed(6))).toBe(true);
    }
  });

  it('keeps float dust out of tick labels', () => {
    const { labels } = draw(0.2, 400);

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const text = label.textContent ?? '';
      if (!/^-?[\d.]+$/.test(text)) continue; // axis names, not tick values
      expect(text).toMatch(/^-?\d+(\.\d{1,6})?$/);
    }
  });
});
