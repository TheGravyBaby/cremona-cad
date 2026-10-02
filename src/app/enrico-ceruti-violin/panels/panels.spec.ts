import { TestBed } from '@angular/core/testing';
import { maxRibTaperMm, ribHeightAt, solveRibTaper } from '../ceruti-arching';
import { splineZAt } from '../../helpers/math/pathMath';
import { recordLayers } from '../../helpers/layer-recorder';
import { archedViolin, defaultViolin, templateKeys, templateViolin } from '../ceruti-fixtures';
import { CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, EnricoCerutiParams, PathEntry } from '../ceruti-types';
import { CenterBoutPanel } from './center-bout-panel/center-bout-panel';
import { CornersPanel } from './corners-panel/corners-panel';
import { CrossArchingPanel } from './cross-arching-panel/cross-arching-panel';
import { FlutingPanel } from './fluting-panel/fluting-panel';
import { LongArchingPanel } from './long-arching-panel/long-arching-panel';
import { MainBoutsPanel } from './main-bouts-panel/main-bouts-panel';
import { MouldPanel } from './mould-panel/mould-panel';
import { NeckPanel } from './neck-panel/neck-panel';
import { OuterTracePanel } from './outer-trace-panel/outer-trace-panel';
import { ScrollPanel } from './scroll-panel/scroll-panel';
import { naturalArcRadii, TO_FRONT, VOLUTE_STYLES } from './scroll-panel/volute';
import { VoluteParams, VoluteStyle } from '../ceruti-types';

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
  ['neck', NeckPanel],
  ['scroll', ScrollPanel],
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

  // One test per template rather than one test looping over all of them — the
  // mould panel boolean-diffs a whole plate per template, and that used to sit
  // close enough to vitest's 5s default (bundled into one shared timeout) to
  // time out on a loaded machine. Splitting means each template gets its own
  // budget and its own pass/fail, and the corpus can keep growing without this
  // needing a bigger override to match.
  it.each(templateKeys())('draws %s, not just the default', key => {
    const drawn = recordLayers(panel(Ctor as any, templateViolin(key)).buildRun());
    expect(drawn.elements.length, `${key} drew nothing`).toBeGreaterThan(0);
  });
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

describe('the scroll panel', () => {
  it('carries the neck\'s front and back on up past the spiral under module guides, dashed', () => {
    const p = defaultViolin();
    const lines = (showModuleGuides: boolean) => recordLayers(panel(ScrollPanel, p, flags({ showModuleGuides, showVoluteEye: false, showModuleArcs: false })).buildRun())
      .elements.filter(el => el.tag === 'line').map(el => el.attrs);
    const off = lines(false);
    const guides = lines(true).slice(off.length);
    expect(guides.map(l => [l['x1'], l['x2']])).toEqual([[0, 0], [-p.neck!.thickness, -p.neck!.thickness]].map(xs => xs.map(x => expect.closeTo(x, 9))));
    for (const l of guides) {
      const [low, high] = [l['y1'], l['y2']].sort((m, n) => (m as number) - (n as number)) as number[];
      expect(low).toBe(0);
      expect(high).toBeGreaterThan(p.volute!.eyeY);
    }
    expect(guides.every(l => l['stroke-dasharray'])).toBeTruthy();
  });

  it('draws the nut on the neck\'s front and the neck below it, stopping short', () => {
    const p = defaultViolin();
    const drawn = recordLayers(panel(ScrollPanel, p, flags({ showVoluteEye: false, showModuleArcs: false })).buildRun());
    const nut = [...drawn.paths[0].matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
    expect(Math.min(...nut.map(c => c[0]))).toBe(0);
    expect(Math.max(...nut.map(c => c[0]))).toBeCloseTo(p.neck!.nutThickness, 9);
    expect(Math.min(...nut.map(c => c[1]))).toBe(0);

    const lines = drawn.elements.filter(el => el.tag === 'line').map(el => el.attrs);
    expect(lines.length).toBe(3);
    const lowest = Math.min(...lines.flatMap(l => [l['y1'] as number, l['y2'] as number]));
    expect(lowest).toBeLessThan(0);
    expect(-lowest).toBeLessThan(p.volute!.eyeY);
    const leftmost = Math.min(...lines.flatMap(l => [l['x1'] as number, l['x2'] as number]));
    expect(-leftmost).toBeCloseTo(p.neck!.thickness, 9);
  });

  describe('the volute', () => {
    // the plain spiral unless a test asks for module arcs
    const scroll = (p: EnricoCerutiParams, over: Partial<CerutiViewFlags> = {}) => panel(ScrollPanel, p, flags({ showModuleArcs: false, ...over }));
    const drawn = (eyeRadius: number) => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      p.volute!.eyeRadius = eyeRadius;
      return recordLayers(instance.buildRun());
    };
    const arcs = (eyeRadius: number) => drawn(eyeRadius).elements.filter(el => typeof el.attrs['d'] === 'string' && (el.attrs['d'] as string).includes(' A '));

    it('draws the spiral alone, in full strokes', () => {
      const a = arcs(4);
      expect(a.length).toBe(7);
      expect(a.every(el => el.attrs['opacity'] === 1)).toBe(true);
    });

    it('draws no spiral for an eye that is not a positive radius', () => {
      for (const bad of [0, -1, NaN]) expect(arcs(bad)).toEqual([]);
    });

    it('draws a spiral in every style', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      for (const style of Object.keys(VOLUTE_STYLES) as VoluteStyle[]) {
        instance.setStyle(style);
        const spiral = recordLayers(instance.buildRun()).paths.filter(d => d.includes(' A '));
        expect(spiral.length, style).toBeGreaterThan(3);
      }
    });

    it('measures the eye from the nut on the neck\'s front, X filled flush to the hundredth while flush is on', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      expect(p.volute!.flushWithNeck).toBe(true);
      const { eyeX, eyeY } = p.volute!;
      expect(eyeX).toBeLessThan(0);
      expect(eyeY).toBeGreaterThan(0);
      expect(eyeX! * 100).toBeCloseTo(Math.round(eyeX! * 100), 9);
      const eye = recordLayers(instance.buildRun()).elements.find(el => el.tag === 'circle')!.attrs;
      expect([eye['cx'], eye['cy']]).toEqual([eyeX, eyeY]);
      p.volute!.eyeX = 1;
      instance.buildRun();
      expect(p.volute!.eyeX).toBe(eyeX);
    });

    it('keeps a typed eye height while flush, the flush X the same at any height', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const { eyeX, eyeY } = p.volute!;
      p.volute!.eyeY = eyeY - 5;
      instance.buildRun();
      expect([p.volute!.eyeX, p.volute!.eyeY]).toEqual([eyeX, eyeY - 5]);
    });

    it('leaves the eye where the fields put it once flush is off, and moves the spiral with it', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const eye = (d: ReturnType<typeof recordLayers>) => d.elements.find(el => el.tag === 'circle')!.attrs;
      const flush = eye(recordLayers(instance.buildRun()));
      p.volute!.flushWithNeck = false;
      p.volute!.eyeX = (p.volute!.eyeX as number) - 3;
      p.volute!.eyeY = (p.volute!.eyeY as number) - 4;
      const drawnFree = recordLayers(instance.buildRun());
      const moved = eye(drawnFree);
      expect(moved['cx']).toBeCloseTo((flush['cx'] as number) - 3, 9);
      expect(moved['cy']).toBeCloseTo((flush['cy'] as number) - 4, 9);
      expect(drawnFree.paths.filter(d => d.includes(' A ')).length).toBe(7);
    });

    it('draws the neck\'s lines under module guides and the eye with its seed under its own toggle, the spiral always', () => {
      const p = defaultViolin();
      const drawn = (over: Partial<CerutiViewFlags>) => recordLayers(scroll(p, over).buildRun());
      const tags = (d: ReturnType<typeof recordLayers>, tag: string) => d.elements.filter(el => el.tag === tag).length;
      const arcs = (d: ReturnType<typeof recordLayers>) => d.paths.filter(path => path.includes(' A ')).length;
      const all = drawn({ showModuleGuides: true });

      const noGuides = drawn({ showModuleGuides: false });
      expect(tags(noGuides, 'line')).toBe(tags(all, 'line') - 2);
      expect([tags(noGuides, 'circle'), arcs(noGuides)]).toEqual([tags(all, 'circle'), arcs(all)]);

      const noEye = drawn({ showModuleGuides: true, showVoluteEye: false });
      expect(tags(noEye, 'circle')).toBe(tags(all, 'circle') - 1);
      expect(tags(noEye, 'line')).toBeLessThan(tags(all, 'line'));
      expect(arcs(noEye)).toBe(arcs(all));
      expect(arcs(drawn({ showModuleGuides: false, showVoluteEye: false }))).toBe(arcs(all));
    });

    it('draws the spiral plain, or as module arcs each with its centre and bounding radii', () => {
      const p = defaultViolin();
      const plain = recordLayers(scroll(p).buildRun());
      const fancy = recordLayers(scroll(p, { showModuleArcs: true }).buildRun());
      const arcs = (d: ReturnType<typeof recordLayers>) => d.elements.filter(el => typeof el.attrs['d'] === 'string' && (el.attrs['d'] as string).includes(' A '));
      expect(arcs(fancy).map(el => el.attrs['d'])).toEqual(arcs(plain).map(el => el.attrs['d']));
      expect(arcs(fancy).every(el => el.attrs['stroke-width'] === 2 && el.attrs['opacity'] === 1)).toBe(true);
      const lines = (d: ReturnType<typeof recordLayers>) => d.elements.filter(el => el.tag === 'line').length;
      expect(lines(fancy) - lines(plain)).toBeGreaterThanOrEqual(2 * arcs(fancy).length);
    });

    // the spiral's own arcs, not the halo, which draws lighter
    const spiralArcs = (instance: ScrollPanel) => recordLayers(instance.buildRun()).elements
      .filter(el => typeof el.attrs['d'] === 'string' && (el.attrs['d'] as string).includes(' A ') && el.attrs['opacity'] === 1);
    const choose = (instance: ScrollPanel, style: VoluteStyle) => {
      instance.setStyle(style);
      instance.buildRun();
    };

    it('draws the four point spiral from its arc radii, and nothing once one shrinks', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before.length).toBe(7);
      p.volute!.arcRadii[6] += 3;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      p.volute!.arcRadii[5] = p.volute!.arcRadii[6];
      expect(spiralArcs(instance)).toHaveLength(7);
      p.volute!.arcRadii[5] = p.volute!.arcRadii[6] + 1;
      expect(spiralArcs(instance)).toEqual([]);
    });

    it('carries the radii after one set past them up to it, leaving those already wider and those inside alone', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const before = [...p.volute!.arcRadii];
      const radius = (before[5] + before[6]) / 2;
      instance.setArcRadius(2, radius);
      expect(p.volute!.arcRadii).toEqual([...before.slice(0, 2), radius, radius, radius, radius, before[6]]);
      expect(spiralArcs(instance)).toHaveLength(7);
      instance.setArcRadius(4, before[1]);
      expect(p.volute!.arcRadii[5]).toBe(radius);
      instance.setArcRadius(4, null as unknown as number);
      expect(p.volute!.arcRadii.slice(5)).toEqual([radius, before[6]]);
    });

    it('colours module arcs by turn and arc in every style, the plain spiral in one colour', () => {
      const p = defaultViolin();
      const strokes = (instance: ScrollPanel) => spiralArcs(instance).map(el => el.attrs['stroke']);
      const plain = scroll(p);
      plain.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
      plain.buildRun();
      choose(plain, 'fourPoint');
      expect(new Set(strokes(plain))).toEqual(new Set(['outerTrace']));
      const fancy = scroll(p, { showModuleArcs: true });
      fancy.colors = plain.colors;
      const turns = [
        'upperBout', 'upperBoutOff', 'upperBoutOff2', 'upperBoutOff',
        'centerBout', 'centerBoutOff', 'centerBoutOff2', 'centerBoutOff',
        'lowerBout', 'lowerBoutOff', 'lowerBoutOff2',
      ];
      for (const style of ['fourPoint', 'salviati'] as const) {
        choose(fancy, style);
        expect(strokes(fancy), style).toEqual(turns.slice(0, 7));
      }
    });

    it('seeds the four point radii from the even growth once, then leaves them to the user', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      expect(p.volute!.arcRadii).toEqual(naturalArcRadii(p.volute!.eyeRadius, TO_FRONT));
      const seeded = [...p.volute!.arcRadii];
      p.volute!.eyeRadius = 1.2;
      instance.buildRun();
      expect(p.volute!.arcRadii).toEqual(seeded);
      p.volute!.arcRadii[5] += 1;
      choose(instance, 'salviati');
      choose(instance, 'fourPoint');
      expect(p.volute!.arcRadii[5]).toBeCloseTo(seeded[5] + 1, 9);
    });

    it('haloes the four point arc whose field has focus, and nothing once it blurs', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const halos = () => recordLayers(instance.buildRun()).elements.filter(el => el.attrs['stroke-width'] === 12);
      expect(halos()).toHaveLength(0);
      instance.onArcFocus(3);
      const [halo] = halos();
      expect(halo.attrs['opacity']).toBeLessThan(1);
      expect(halo.attrs['stroke']).toBe(instance.arcColor(3));
      instance.onArcBlur();
      expect(halos()).toHaveLength(0);
    });

    it('gives the Archimedean a pitch on picking it when it has none, and redraws as the pitch changes', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      p.volute!.pitch = undefined as unknown as number;
      choose(instance, 'archimedean');
      expect(p.volute!.pitch).toBeGreaterThan(0);
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before).toHaveLength(14);
      p.volute!.pitch += 1;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      const set = p.volute!.pitch;
      choose(instance, 'salviati');
      choose(instance, 'archimedean');
      expect(p.volute!.pitch).toBe(set);
    });

    it('gives Kelly\'s a seed on picking it when it has none, and redraws as the seed changes', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      p.volute!.seed = undefined as unknown as number;
      choose(instance, 'kelly');
      expect(Math.abs(p.volute!.seed - p.volute!.eyeRadius)).toBeLessThanOrEqual(0.005 + 1e-9);
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before).toHaveLength(8);
      p.volute!.seed += 0.2;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
    });

    it('starts each seeded style\'s seed at its author\'s proportion to the eye, and hides the field for the rest', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const r = p.volute!.eyeRadius;
      for (const [style, seed] of [['serlio', 2 * r], ['salviati', r], ['goldmann', r], ['kelly', r]] as const) {
        choose(instance, style);
        expect(Math.abs(p.volute!.seed - seed), style).toBeLessThanOrEqual(0.005 + 1e-9);
        expect(instance.seedDef, style).toBeDefined();
      }
      for (const style of ['philandrier', 'archimedean', 'fourPoint'] as const) {
        choose(instance, style);
        expect(instance.seedDef, style).toBeUndefined();
      }
    });

    it('redraws a seeded style as the seed changes, the eye left as it is', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      p.volute!.seed += 0.5;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
    });

    it('names each four point field by how many turns out from the eye its arc ends', () => {
      const instance = scroll(defaultViolin());
      expect([0, 1, 2, 3, 4, 10, 15].map(i => instance.arcEnd(i))).toEqual(['¼', '½', '¾', '1', '1¼', '2¾', '4']);
    });

    it('draws every style out to its front', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const front = { archimedean: 14, serlio: 7, philandrier: 14, salviati: 7, goldmann: 7, kelly: 8, fourPoint: 7 };
      for (const style of Object.keys(VOLUTE_STYLES) as VoluteStyle[]) {
        choose(instance, style);
        expect(spiralArcs(instance).length, style).toBe(front[style]);
      }
    });
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

// past maxRibTaperMm the tilted rib line is longer than the instrument; the panel rolls the
// pair back rather than drawing a plate stretched to reach it
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
    // nothing to roll back to, so the lower rib survives
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

// the top plate is drawn in its own frame and placed by a rigid transform on its group — a
// shear would lean the carved section instead of just tilting where it sits
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

// seeded unmirrored: a long arch is asymmetric end to end far more often than not
describe('long arching panel — the spline it seeds', () => {
  it('lays out five stations down the plate, peak among them', () => {
    // high position first — the world is y-up
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;

    const rows = panelUnderTest.splineRows(arch);
    expect(rows.map(row => Math.round((row.pt ? row.pt.t : arch.peak ?? 0.5) * 1000) / 10))
      .toEqual([87.5, 75, 50, 25, 12.5]);
  });

  it('mirrors nothing, and says so rather than leaving it out', () => {
    // absent reads as legacy to the loader — see normalizeArchCurve
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    expect(panelUnderTest.topSpline!.points.map(pt => pt.mirror)).toEqual([false, false, false, false]);
  });

  it('adds unmirrored points too', () => {
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    panelUnderTest.addSplinePoint('top');
    expect(panelUnderTest.topSpline!.points.every(pt => pt.mirror === false)).toBe(true);
  });

  it('keeps the arch inside the height it was entered at', () => {
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    const span = 356;
    let max = 0;
    for (let i = 0; i <= 500; i++) {
      max = Math.max(max, splineZAt(arch.archHeight, span, arch.points, arch.peak!, span * i / 500));
    }
    expect(max).toBeCloseTo(arch.archHeight, 6);
  });
});

// row order means nothing to the geometry (both knot builders sort for themselves) but is
// preserved for the maker reading the table; wiring tests for {@link RowReorderDirective}
describe('arching panels — arranging spline rows', () => {
  /** Row pitch the stubbed layout reports; jsdom measures everything as zero. */
  const PITCH = 30;

  /** A pointer event jsdom will construct — it has no PointerEvent of its own. */
  function pointer(type: string, target: EventTarget, clientY: number): void {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
    Object.assign(e, { pointerId: 1 });
    target.dispatchEvent(e);
  }

  function dragRow(fixture: { nativeElement: HTMLElement }, from: number, places: number): void {
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('.spline-points [data-reorder-row]') as NodeListOf<HTMLElement>,
    );
    rows.forEach((row, i) => {
      row.getBoundingClientRect = () => ({ top: i * PITCH, height: PITCH }) as DOMRect;
    });
    pointer('pointerdown', rows[from].querySelector('[data-reorder-handle]')!, 0);
    pointer('pointermove', document, PITCH * places);
    pointer('pointerup', document, PITCH * places);
  }

  it('carries a long-arch peak down among the control points', async () => {
    await TestBed.configureTestingModule({ imports: [LongArchingPanel] }).compileComponents();
    const fixture = TestBed.createComponent(LongArchingPanel);
    fixture.componentRef.setInput('params', archedViolin());
    fixture.componentRef.setInput('colors', colors);
    fixture.componentRef.setInput('flags', flags());

    const panelUnderTest = fixture.componentInstance;
    panelUnderTest.setCurveType('top', 'spline');
    fixture.detectChanges();

    const arch = panelUnderTest.topSpline!;
    const before = arch.points.map(pt => pt.t);
    const seated = arch.peakRow!;
    // Every point is a row, and the peak is one more among them.
    expect(fixture.nativeElement.querySelectorAll('.spline-points [data-reorder-row]').length)
      .toBe(before.length + 1);

    // From the row it is seeded in, down to the foot of the table.
    dragRow(fixture, seated, before.length - seated);
    expect(arch.peakRow).toBe(before.length);
    expect(arch.points.map(pt => pt.t)).toEqual(before);
  });

  it('drags a control point past the peak', () => {
    const p = archedViolin();
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    const before = arch.points.map(pt => pt.t);
    expect(before.length).toBe(4);

    // Rows are [a, b, peak, c, d]; the last point up to the top of the table.
    panelUnderTest.moveSplineRow('top', { from: 4, to: 0 });
    expect(arch.points.map(pt => pt.t)).toEqual([before[3], before[0], before[1], before[2]]);
    expect(arch.peakRow).toBe(3);
  });

  it('adds a point on the side of the peak its position falls', () => {
    const p = archedViolin();
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    const peakRow = arch.peakRow!;

    panelUnderTest.addSplinePoint('top');
    const rows = panelUnderTest.splineRows(arch);
    const positions = rows.map(row => row.pt ? row.pt.t : arch.peak ?? 0.5);
    // table runs high position first
    expect(positions).toEqual([...positions].sort((a, b) => b - a));
    // widest gap falls below the peak, so the peak keeps its row
    expect(arch.peakRow).toBe(peakRow);
  });

  it('seats an added point the way the table runs, not the way it was seeded', () => {
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    // same table turned around, as a maker reading up the plate would leave it
    arch.points.reverse();

    panelUnderTest.addSplinePoint('top');
    const positions = panelUnderTest.splineRows(arch)
      .map(row => row.pt ? row.pt.t : arch.peak ?? 0.5);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('keeps the peak between the same points when one above it goes', () => {
    const p = archedViolin();
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    // Rows [a, b, peak, c, d]: the peak has two points above it and two below.
    expect(arch.peakRow).toBe(2);

    panelUnderTest.removeSplinePoint('top', 0);
    expect(arch.peakRow).toBe(1);
    expect(panelUnderTest.splineRows(arch).map(row => !!row.pt))
      .toEqual([true, false, true, true]);
  });

  it('leaves a spline alone when a row is dropped where it started', () => {
    const p = archedViolin();
    const panelUnderTest = panel(LongArchingPanel, p);
    panelUnderTest.setCurveType('top', 'spline');
    const arch = panelUnderTest.topSpline!;
    const before = arch.points.map(pt => pt.t);

    panelUnderTest.moveSplineRow('top', { from: 1, to: 1 });
    expect(arch.points.map(pt => pt.t)).toEqual(before);
    expect(arch.peakRow).toBe(2);
  });

  it('drags a cross-arch crown down among its knots', async () => {
    await TestBed.configureTestingModule({ imports: [CrossArchingPanel] }).compileComponents();
    const fixture = TestBed.createComponent(CrossArchingPanel);
    fixture.componentRef.setInput('params', archedViolin());
    fixture.componentRef.setInput('colors', colors);
    fixture.componentRef.setInput('flags', flags());

    const panelUnderTest = fixture.componentInstance;
    panelUnderTest.setCurveType('top', 'spline');
    panelUnderTest.addPoint('top');
    panelUnderTest.addPoint('top');
    fixture.detectChanges();

    const shape = panelUnderTest.crossSpline('top')!;
    const before = shape.points.map(pt => pt.x);
    expect(before.length).toBe(3);

    dragRow(fixture, 0, 2);
    expect(panelUnderTest.crossSpline('top')!.peakRow).toBe(2);
    expect(panelUnderTest.crossSpline('top')!.points.map(pt => pt.x)).toEqual(before);
  });

  it('moves a cross-arch knot between rows', () => {
    const p = archedViolin();
    const panelUnderTest = panel(CrossArchingPanel, p);
    panelUnderTest.setCurveType('top', 'spline');
    panelUnderTest.addPoint('top');
    const shape = panelUnderTest.crossSpline('top')!;
    const before = shape.points.map(pt => pt.x);

    // Rows [crown, a, b]: the last knot to the top.
    panelUnderTest.moveRow('top', { from: 2, to: 0 });
    expect(shape.points.map(pt => pt.x)).toEqual([before[1], before[0]]);
    expect(shape.peakRow).toBe(1);
  });
});
