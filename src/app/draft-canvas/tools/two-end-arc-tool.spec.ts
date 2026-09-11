import { Pt } from '../../models/types';
import { normalizeRadians } from '../../helpers/math/draftMath';
import { DraftToolHost } from './draft-tool';
import { ArcShape, DraftShape } from './toolbox-shape';
import { createEndsCenterArcTool, createThroughArcTool } from './two-end-arc-tool';

/** Only the host calls these tools actually make. `shift` stands in for the angle-lock modifier,
 * which is what asks either tool for its other solution. */
function makeHost(shift = false): DraftToolHost & { added: DraftShape[] } {
  const added: DraftShape[] = [];
  return {
    added,
    addShape: (s: DraftShape) => { added.push(s); },
    requestDraw: () => { },
    getSnapTangent: () => undefined,
    isAngleLockHeld: () => shift,
    isTangentLockHeld: () => false,
    getSelectedShapes: () => [],
    getPxPerMm: () => 1,
    hitTestShape: () => null,
    selectShape: () => { },
    removeShape: () => { },
    returnToSelect: () => { },
  };
}

const at = (x: number, y: number): Pt => ({ x, y });

function arcsOf(host: { added: DraftShape[] }): ArcShape[] {
  return host.added.filter((s): s is ArcShape => s.type === 'arc');
}

/** CCW sweep of a committed arc, the convention ArcShape stores. */
function span(arc: ArcShape): number {
  return normalizeRadians(arc.endAngle - arc.startAngle);
}

describe('Start–End–Through arc', () => {
  it('commits on the third click, through all three points', () => {
    const tool = createThroughArcTool();
    const host = makeHost();

    tool.onPointerDown(at(-10, 0), host);
    tool.onPointerDown(at(10, 0), host);
    expect(host.added).toHaveLength(0);

    tool.onPointerDown(at(0, 10), host);
    const [arc] = arcsOf(host);
    expect(arc.center.x).toBeCloseTo(0, 9);
    expect(arc.center.y).toBeCloseTo(0, 9);
    expect(arc.radius).toBeCloseTo(10, 9);
    expect(span(arc)).toBeCloseTo(Math.PI, 9);
  });

  it('drops a construction whose three points fall on one line', () => {
    // A circle through three collinear points has no finite radius. Committing the least-wrong
    // arc here would drop a shape kilometres across onto the canvas, off-screen and selectable
    // only by a select-all — so the construction is abandoned instead.
    const tool = createThroughArcTool();
    const host = makeHost();

    tool.onPointerDown(at(0, 0), host);
    tool.onPointerDown(at(20, 0), host);
    tool.onPointerDown(at(8, 0), host);
    expect(host.added).toHaveLength(0);
  });

  it('starts over after Escape rather than resuming mid-construction', () => {
    const tool = createThroughArcTool();
    const host = makeHost();

    tool.onPointerDown(at(-10, 0), host);
    tool.onPointerDown(at(10, 0), host);
    expect(tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);

    // these three are a fresh construction, not clicks 3, 4 and 5 of the abandoned one
    tool.onPointerDown(at(-5, 0), host);
    tool.onPointerDown(at(5, 0), host);
    tool.onPointerDown(at(0, 5), host);
    expect(arcsOf(host)).toHaveLength(1);
    expect(arcsOf(host)[0].radius).toBeCloseTo(5, 9);
  });
});

describe('Start–End–Center arc', () => {
  it('pulls a center clicked off the bisector onto it', () => {
    const tool = createEndsCenterArcTool();
    const host = makeHost();

    tool.onPointerDown(at(-10, 0), host);
    tool.onPointerDown(at(10, 0), host);
    tool.onPointerDown(at(7, -20), host); // nowhere near equidistant from the two ends

    const [arc] = arcsOf(host);
    expect(arc.center.x).toBeCloseTo(0, 9);
    expect(arc.center.y).toBeCloseTo(-20, 9);
    expect(arc.radius).toBeCloseTo(Math.sqrt(500), 9);
    expect(span(arc)).toBeLessThanOrEqual(Math.PI);
  });

  it('takes the major arc while the angle-lock modifier is held', () => {
    const tool = createEndsCenterArcTool();
    const host = makeHost(true);

    tool.onPointerDown(at(-10, 0), host);
    tool.onPointerDown(at(10, 0), host);
    tool.onPointerDown(at(0, -20), host);

    expect(span(arcsOf(host)[0])).toBeGreaterThan(Math.PI);
  });

  it('drops a construction with no chord to bisect', () => {
    const tool = createEndsCenterArcTool();
    const host = makeHost();

    tool.onPointerDown(at(5, 5), host);
    tool.onPointerDown(at(5, 5), host);
    tool.onPointerDown(at(0, 0), host);
    expect(host.added).toHaveLength(0);
  });
});
