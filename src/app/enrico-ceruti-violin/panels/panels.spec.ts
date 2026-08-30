import { maxRibTaperMm, ribHeightAt, solveRibTaper } from '../ceruti-arching';
import { recordLayers } from '../../helpers/layer-recorder';
import { archedViolin, defaultViolin, templateKeys, templateViolin } from '../ceruti-fixtures';
import { CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiParams, PathEntry } from '../ceruti-types';
import { CenterBoutPanel } from './center-bout-panel/center-bout-panel';
import { CornersPanel } from './corners-panel/corners-panel';
import { FlutingPanel } from './fluting-panel/fluting-panel';
import { LongArchingPanel } from './long-arching-panel/long-arching-panel';
import { MainBoutsPanel } from './main-bouts-panel/main-bouts-panel';
import { MouldPanel } from './mould-panel/mould-panel';
import { OuterTracePanel } from './outer-trace-panel/outer-trace-panel';

/**
 * What the panels actually draw.
 *
 * A panel's whole contract is "run the calc, return these layers", and until
 * `buildRun()` went public nothing could check the second half — a panel could
 * stop emitting its outline entirely and the suite would stay green. These
 * instantiate the classes directly: the panels inject nothing, so they need no
 * TestBed, and `recordLayers` stands in for the canvas.
 *
 * The bar is deliberately low per panel — that it draws, that it draws real
 * finite geometry, and that the view flags it advertises actually gate what
 * comes out. Pinning exact primitive counts would break on every cosmetic
 * change and tell nobody anything.
 */

/** Every colour resolves; which one is never what a render decision turns on. */
const colors = new Proxy({}, { get: () => '#888888' }) as CerutiColors;

const flags = (over: Partial<CerutiViewFlags> = {}): CerutiViewFlags =>
  ({ ...DEFAULT_CERUTI_VIEW_FLAGS, ...over });

type AnyPanel = { params: EnricoCerutiParams; colors: CerutiColors; flags: CerutiViewFlags; paths?: PathEntry[]; buildRun(): any[] };

/** Builds a panel with its inputs filled, the way the template's bindings would. */
function panel<T extends AnyPanel>(Ctor: new () => T, p: EnricoCerutiParams, f = flags()): T {
  const instance = new Ctor();
  instance.params = p;
  instance.colors = colors;
  instance.flags = f;
  if ('paths' in instance) instance.paths = [];
  return instance;
}

const PANELS = [
  ['main bouts', MainBoutsPanel],
  ['corners', CornersPanel],
  ['center bout', CenterBoutPanel],
  ['outer trace', OuterTracePanel],
  ['mould', MouldPanel],
] as const;

describe.each(PANELS)('%s panel', (_name, Ctor) => {
  it('draws something', () => {
    const drawn = recordLayers(panel(Ctor as any, defaultViolin()).buildRun());
    expect(drawn.elements.length).toBeGreaterThan(0);
  });

  it('draws only finite geometry', () => {
    // A NaN coordinate does not throw — it silently drops that one element from
    // the SVG, so the drawing comes up missing an arc with nothing in the console.
    const drawn = recordLayers(panel(Ctor as any, defaultViolin()).buildRun());
    for (const el of drawn.elements) {
      for (const [key, value] of Object.entries(el.attrs)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${el.tag}.${key} = ${value}`).toBe(true);
        }
        if (typeof value === 'string' && (key === 'd' || key === 'points')) {
          expect(value, `${el.tag}.${key}`).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it('is repeatable — building twice draws the same thing', () => {
    // buildRun() calls the calc, which mutates params. A panel that drew
    // differently the second time would mean an idle redraw changes the drawing.
    const p = defaultViolin();
    const instance = panel(Ctor as any, p);
    const first = recordLayers(instance.buildRun());
    const second = recordLayers(instance.buildRun());
    expect(second.countByTag).toEqual(first.countByTag);
    expect(second.paths).toEqual(first.paths);
  });

  // 20s like the arching sweeps: the mould panel boolean-diffs a whole plate per template, which
  // sits close enough to vitest's 5s default to fail on a loaded machine. Narrowing the sweep to
  // fit the default would mean dropping templates, which is the thing the test is for.
  it('draws every bundled instrument, not just the default', () => {
    for (const key of templateKeys()) {
      const drawn = recordLayers(panel(Ctor as any, templateViolin(key)).buildRun());
      expect(drawn.elements.length, `${key} drew nothing`).toBeGreaterThan(0);
    }
  }, 20000);
});

describe('view flags gate what is drawn', () => {
  it('the module circles appear only when their toggle is on', () => {
    const off = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ showModuleCircles: false, showAllCircles: false })).buildRun());
    const on = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ showModuleCircles: true })).buildRun());
    expect(on.countByTag['circle'] ?? 0).toBeGreaterThan(off.countByTag['circle'] ?? 0);
  });

  it('the outer path appears only when its toggle is on', () => {
    const off = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ renderOuterPath: false })).buildRun());
    const on = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ renderOuterPath: true })).buildRun());
    expect(on.elements.length).toBeGreaterThan(off.elements.length);
  });

  it('the mould panel draws its blocks only when asked', () => {
    const off = recordLayers(panel(MouldPanel, defaultViolin(), flags({ showBlocks: false })).buildRun());
    const on = recordLayers(panel(MouldPanel, defaultViolin(), flags({ showBlocks: true })).buildRun());
    expect(on.elements.length).toBeGreaterThan(off.elements.length);
  });
});

describe('panels that read the shared path cache', () => {
  it('fill it themselves rather than assuming someone else did', () => {
    // `getPath` asserts, so a panel that skipped its `ensure*` would throw on a
    // cold cache — which is what happens when a user lands on it first.
    for (const Ctor of [OuterTracePanel, MouldPanel, CenterBoutPanel]) {
      const instance = panel(Ctor as any, defaultViolin());
      expect(() => instance.buildRun(), `${Ctor.name} needs a pre-filled cache`).not.toThrow();
      expect(instance.paths!.length).toBeGreaterThan(0);
    }
  });

  it('rewrite the cache in place across repeated builds', () => {
    const instance = panel(OuterTracePanel, defaultViolin());
    instance.buildRun();
    const afterFirst = instance.paths!.length;
    instance.buildRun();
    expect(instance.paths!.length).toBe(afterFirst);
  });
});

describe('the fluting panel', () => {
  // Its own case: it is the first of the arching steps, so it needs a plate.
  it('draws the channel on an arched plate', () => {
    const drawn = recordLayers(panel(FlutingPanel as any, archedViolin()).buildRun());
    expect(drawn.elements.length).toBeGreaterThan(0);
  });
});

/**
 * The rib taper's limiter.
 *
 * Past `maxRibTaperMm` the tilted rib line is longer than the instrument, and
 * the side view can only draw a top plate reaching it by stretching it — a
 * picture of a garland that cannot be built. The panel puts the pair back
 * rather than drawing it.
 */
describe('long arching panel — rib taper limit', () => {
  const arched = (lower: number, upper: number): EnricoCerutiParams => {
    const p = archedViolin();
    p.arching!.ribHeightLower = lower;
    p.arching!.ribHeightUpper = upper;
    return p;
  };

  it('keeps a taper inside the bound', () => {
    const p = arched(32, 30);
    panel(LongArchingPanel, p).buildRun();
    expect(p.arching!.ribHeightLower).toBe(32);
    expect(p.arching!.ribHeightUpper).toBe(30);
  });

  it('puts back the pair it last accepted', () => {
    const p = arched(32, 30);
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.buildRun();

    // The edit that overruns the body, made the way the input would make it.
    p.arching!.ribHeightUpper = 32 - maxRibTaperMm(p) - 1;
    panelUnderTest.buildRun();

    expect(p.arching!.ribHeightLower).toBe(32);
    expect(p.arching!.ribHeightUpper).toBe(30);
  });

  it('refuses a taper the other way round too', () => {
    const p = arched(30, 32);
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.buildRun();

    p.arching!.ribHeightUpper = 30 + maxRibTaperMm(p) + 1;
    panelUnderTest.buildRun();

    expect(p.arching!.ribHeightUpper).toBe(32);
  });

  it('gives up the taper, not the measured height, on a recipe that arrives over the bound', () => {
    const p = arched(32, 32 - maxRibTaperMm(archedViolin()) - 5);
    panel(LongArchingPanel, p).buildRun();
    // Nothing to roll back to, so the lower rib — the one a maker measures
    // first — is the end that survives.
    expect(p.arching!.ribHeightLower).toBe(32);
    expect(p.arching!.ribHeightUpper).toBe(32);
  });

  it('leaves a field cleared mid-typing alone rather than snapping it back', () => {
    const p = arched(32, 30);
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.buildRun();

    // What ngModel writes when the input is emptied.
    p.arching!.ribHeightUpper = null as unknown as number;
    panelUnderTest.buildRun();
    expect(p.arching!.ribHeightUpper).toBe(null);
  });

  it('still draws the section after a rollback', () => {
    const p = arched(32, 30);
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.buildRun();
    p.arching!.ribHeightUpper = -500;
    const drawn = recordLayers(panelUnderTest.buildRun());
    expect(drawn.elements.length).toBeGreaterThan(0);
  });
});

/**
 * How the tilted top plate is placed.
 *
 * The plate is one piece of wood glued onto a rib line that is no longer
 * parallel to the back's. It is drawn in its own frame and placed by a
 * transform on the group it goes into, so what that transform is *is* the
 * geometry — a shear here would lean the section that was carved, and a
 * placement hung off one end would overhang the garland unevenly.
 */
describe('long arching panel — placing the tilted top plate', () => {
  /** `translate(dx,dy) rotate(a,cx,cy)` as a point map, which is what SVG does with it. */
  function readTransform(t: string): (x: number, y: number) => [number, number] {
    const nums = (name: string) => {
      const m = new RegExp(`${name}\\(([^)]*)\\)`).exec(t);
      return m ? m[1].split(',').map(Number) : null;
    };
    const [dx, dy] = nums('translate') ?? [0, 0];
    const [deg, cx, cy] = nums('rotate') ?? [0, 0, 0];
    const a = deg * Math.PI / 180;
    return (x, y) => {
      const [px, py] = [x - cx, y - cy];
      return [
        px * Math.cos(a) - py * Math.sin(a) + cx + dx,
        px * Math.sin(a) + py * Math.cos(a) + cy + dy,
      ];
    };
  }

  /** The transform on the group the top plate is drawn into. */
  function topPlatePlacement(p: EnricoCerutiParams) {
    const drawn = recordLayers(panel(LongArchingPanel, p).buildRun());
    const group = drawn.elements.find(e => e.layer === 'g' && e.tag === 'g');
    expect(group, 'the top plate should be drawn into a placed group').toBeTruthy();
    return readTransform(String(group!.attrs['transform']));
  }

  /** The two ends of the plate's gluing face, in its own frame, as placed. */
  function placedFace(p: EnricoCerutiParams): { low: [number, number]; high: [number, number] } {
    const place = topPlatePlacement(p);
    const faceZ = solveRibTaper(p).zLower;
    return { low: place(faceZ, 0), high: place(faceZ, p.height) };
  }

  const ribEnds = (p: EnricoCerutiParams) => ({
    low: [ribHeightAt(p, p.overhang), p.overhang] as [number, number],
    high: [ribHeightAt(p, p.height - p.overhang), p.height - p.overhang] as [number, number],
  });

  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  const tapered = (lower = 32, upper = 30): EnricoCerutiParams => {
    const p = archedViolin();
    p.arching!.ribHeightLower = lower;
    p.arching!.ribHeightUpper = upper;
    return p;
  };

  it('overhangs the garland by the same amount at each end', () => {
    const p = tapered();
    const face = placedFace(p);
    const rib = ribEnds(p);
    expect(dist(face.low, rib.low)).toBeCloseTo(dist(face.high, rib.high), 9);
  });

  it('keeps the plate rigid — its length is the body length, not stretched to reach', () => {
    // The whole point of rotating rather than shearing: a shear would have to
    // lengthen the plate to span a rib line that grew.
    const p = tapered();
    const face = placedFace(p);
    expect(dist(face.low, face.high)).toBeCloseTo(p.height, 9);
  });

  it('lays the gluing face along the rib line rather than at an angle to it', () => {
    const p = tapered();
    const face = placedFace(p);
    const rib = ribEnds(p);
    const cross = (face.high[0] - face.low[0]) * (rib.high[1] - rib.low[1])
      - (face.high[1] - face.low[1]) * (rib.high[0] - rib.low[0]);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('foreshortens the plate in plan rather than leaning its section', () => {
    // A rigid turn shortens what the plate covers along the body; the amount is
    // the cos of a third of a degree, which is what says it turned rather than
    // leaned.
    const p = tapered();
    const face = placedFace(p);
    const spanned = Math.abs(face.high[1] - face.low[1]);
    expect(spanned).toBeLessThan(p.height);
    expect(p.height - spanned).toBeCloseTo(p.height * (1 - Math.cos(solveRibTaper(p).angle)), 4);
  });

  it('places an untapered plate exactly where it always sat', () => {
    const p = tapered(32, 32);
    const face = placedFace(p);
    const faceZ = solveRibTaper(p).zLower;
    expect(face.low).toEqual([faceZ, 0]);
    expect(face.high).toEqual([faceZ, p.height]);
  });
});
