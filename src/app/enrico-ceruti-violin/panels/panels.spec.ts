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
import { ScrollWidthsPanel } from './scroll-widths-panel/scroll-widths-panel';
import { duckTailRadius, scrollBackWidths, scrollExtent, scrollWidthStations, spiralArcs as styleArcs, VOLUTE_STYLE_LABELS } from '../ceruti-scroll';
import { VolutePanel } from './volute-panel/volute-panel';
import { VoluteStyle } from '../ceruti-types';
import { Circle, Pt } from '../../models/types';

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
  ['volute', VolutePanel],
  ['scroll', ScrollPanel],
  ['scroll widths', ScrollWidthsPanel],
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
  it('carries the neck\'s front on up to the crown\'s top on the volute, and levels it back to S1, under module guides, dashed', () => {
    const p = defaultViolin();
    const lines = (showModuleGuides: boolean) => recordLayers(panel(VolutePanel, p, flags({ showModuleGuides, showVoluteConstruction: false, showModuleArcs: false })).buildRun())
      .elements.filter(el => el.tag === 'line').map(el => el.attrs as Record<string, number>);
    const dashed = (l: Record<string, unknown>) => !!l['stroke-dasharray'];
    expect(lines(false).filter(dashed)).toEqual([]);
    const [front, crown] = lines(true).filter(dashed);
    expect([front['x1'], front['x2']]).toEqual([0, 0]);
    expect(Math.min(front['y1'], front['y2'])).toBe(0);

    // the default crown passes straight up partway along S1, and stops short of facing straight back
    const S1 = p.scroll!.S1;
    expect(Math.max(front['y1'], front['y2'])).toBeCloseTo(S1.y + S1.r, 9);
    expect(crown['x1']).toBe(0);
    expect(crown['x2']).toBeCloseTo(S1.x + S1.r * Math.cos(S1.end), 9);
    expect(crown['y1']).toBeCloseTo(S1.y + S1.r, 9);
    expect(crown['y2']).toBeCloseTo(S1.y + S1.r, 9);
  });

  it('boxes the head from the nut to the crown and from the neck\'s front to the back\'s furthest reach under module guides, dashed', () => {
    const p = defaultViolin();
    const lines = (showModuleGuides: boolean) => recordLayers(panel(ScrollPanel, p, flags({ showModuleGuides, showVoluteConstruction: false, showModuleArcs: false })).buildRun())
      .elements.filter(el => el.tag === 'line').map(el => el.attrs as Record<string, number>);
    const dashed = (l: Record<string, unknown>) => !!l['stroke-dasharray'];
    expect(lines(false).filter(dashed)).toEqual([]);

    // on the default the crown's top is on S1 and the furthest reach back on S2, past facing straight back
    const { S1, S2 } = p.scroll!;
    const { height, width } = scrollExtent(p.scroll!);
    expect(height).toBeCloseTo(S1.y + S1.r, 9);
    expect(width).toBeCloseTo(S2.r - S2.x, 9);
    const corners = lines(true).filter(dashed).map(l => [l['x1'], l['y1']]);
    expect(corners).toEqual([[0, 0], [0, height], [-width, height], [-width, 0]].map(c => c.map(n => expect.closeTo(n, 9))));
  });

  it('draws the nut on the neck\'s front and the neck below it, stopping short, with nothing across its top', () => {
    const p = defaultViolin();
    const instance = panel(ScrollPanel, p, flags({ showVoluteConstruction: false, showModuleArcs: false }));
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    // with the nape unsolved the neck's back stops at the nut's level
    p.scroll!.nape.r = 0;
    const drawn = recordLayers(instance.buildRun());
    const nut = [...drawn.paths[0].matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
    expect(Math.min(...nut.map(c => c[0]))).toBe(0);
    expect(Math.max(...nut.map(c => c[0]))).toBeCloseTo(p.stringSetup!.nutThickness, 9);
    expect(Math.min(...nut.map(c => c[1]))).toBe(0);

    const lines = drawn.elements.filter(el => el.tag === 'line' && el.attrs['stroke'] === 'neckOff').map(el => el.attrs);
    expect(lines.length).toBe(2);
    expect(lines.every(l => l['x1'] === l['x2'])).toBe(true);
    const lowest = Math.min(...lines.flatMap(l => [l['y1'] as number, l['y2'] as number]));
    expect(lowest).toBeLessThan(0);
    expect(-lowest).toBeLessThan(p.scroll!.eye.y);
    const leftmost = Math.min(...lines.flatMap(l => [l['x1'] as number, l['x2'] as number]));
    expect(-leftmost).toBeCloseTo(p.neck!.thickness, 9);
  });

  describe('the volute', () => {
    // the plain spiral unless a test asks for module arcs, each colour drawn as its own name so the
    // plain profile under it can be told apart
    const named = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    const withNames = <T extends ScrollPanel | VolutePanel>(instance: T) => Object.assign(instance, { colors: named });
    const scroll = (p: EnricoCerutiParams, over: Partial<CerutiViewFlags> = {}) => withNames(panel(ScrollPanel, p, flags({ showModuleArcs: false, ...over })));
    const volute = (p: EnricoCerutiParams, over: Partial<CerutiViewFlags> = {}) => withNames(panel(VolutePanel, p, flags({ showModuleArcs: false, ...over })));
    const isArc = (el: ReturnType<typeof recordLayers>['elements'][number]) => typeof el.attrs['d'] === 'string' && (el.attrs['d'] as string).includes(' A ');
    const isProfile = (el: ReturnType<typeof recordLayers>['elements'][number]) => el.attrs['stroke'] === 'outerTrace';
    const drawn = (eyeRadius: number) => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      p.scroll!.eye.r = eyeRadius;
      return recordLayers(instance.buildRun());
    };
    const arcs = (eyeRadius: number) => drawn(eyeRadius).elements.filter(el => isArc(el) && !isProfile(el));

    it('draws the spiral and the crown alone, in full strokes', () => {
      const a = arcs(4);
      expect(a.length).toBe(10);
      expect(a.every(el => !el.parent)).toBe(true);
    });

    it('draws no spiral for an eye that is not a positive radius', () => {
      for (const bad of [0, -1, NaN]) expect(arcs(bad)).toEqual([]);
    });

    it('measures the eye from the nut on the neck\'s front, X filled flush to the hundredth while flush is on', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      expect(p.scroll!.flushWithNeck).toBe(true);
      const { x: eyeX, y: eyeY } = p.scroll!.eye;
      expect(eyeX).toBeLessThan(0);
      expect(eyeY).toBeGreaterThan(0);
      expect(eyeX * 100).toBeCloseTo(Math.round(eyeX * 100), 9);
      const eye = recordLayers(instance.buildRun()).elements.find(el => el.tag === 'circle')!.attrs;
      expect([eye['cx'], eye['cy']]).toEqual([eyeX, eyeY]);
      p.scroll!.eye.x = 1;
      instance.buildRun();
      expect(p.scroll!.eye.x).toBe(eyeX);
    });

    it('keeps a typed eye height while flush, the flush X the same at any height', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const { x: eyeX, y: eyeY } = p.scroll!.eye;
      p.scroll!.eye.y = eyeY - 5;
      instance.buildRun();
      expect([p.scroll!.eye.x, p.scroll!.eye.y]).toEqual([eyeX, eyeY - 5]);
    });

    it('leaves the eye where the fields put it once flush is off, and moves the spiral with it', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      const eye = (d: ReturnType<typeof recordLayers>) => d.elements.find(el => el.tag === 'circle')!.attrs;
      const flush = eye(recordLayers(instance.buildRun()));
      p.scroll!.flushWithNeck = false;
      p.scroll!.eye.x -= 3;
      p.scroll!.eye.y -= 4;
      const drawnFree = recordLayers(instance.buildRun());
      const moved = eye(drawnFree);
      expect(moved['cx']).toBeCloseTo((flush['cx'] as number) - 3, 9);
      expect(moved['cy']).toBeCloseTo((flush['cy'] as number) - 4, 9);
      expect(drawnFree.elements.filter(el => isArc(el) && !isProfile(el)).length).toBe(10);
    });

    it('draws the neck\'s lines under module guides and the figure under its own toggle on the volute panel, the eye and the spiral always, and neither on the scroll panel', () => {
      const p = defaultViolin();
      const drawn = (over: Partial<CerutiViewFlags>) => recordLayers(volute(p, over).buildRun());
      const tags = (d: ReturnType<typeof recordLayers>, tag: string) => d.elements.filter(el => el.tag === tag).length;
      const arcs = (d: ReturnType<typeof recordLayers>) => d.paths.filter(path => path.includes(' A ')).length;
      const all = drawn({ showModuleGuides: true });

      const noGuides = drawn({ showModuleGuides: false });
      expect(tags(noGuides, 'line')).toBe(tags(all, 'line') - 2);
      expect([tags(noGuides, 'circle'), arcs(noGuides)]).toEqual([tags(all, 'circle'), arcs(all)]);

      const noFigure = drawn({ showModuleGuides: true, showVoluteConstruction: false });
      expect(tags(all, 'circle')).toBe(1);
      expect(tags(noFigure, 'circle')).toBe(1);
      expect(tags(noFigure, 'line')).toBeLessThan(tags(all, 'line'));
      expect(arcs(noFigure)).toBe(arcs(all));
      expect(arcs(drawn({ showModuleGuides: false, showVoluteConstruction: false }))).toBe(arcs(all));

      const whole = (over: Partial<CerutiViewFlags>) => recordLayers(scroll(p, over).buildRun());
      expect(tags(whole({ showVoluteConstruction: true }), 'line')).toBe(tags(whole({ showVoluteConstruction: false }), 'line'));
      expect(tags(whole({ showVoluteConstruction: true }), 'circle')).toBe(0);
    });

    it('draws the spiral plain, or as module arcs each with its centre and bounding radii', () => {
      const p = defaultViolin();
      const plain = recordLayers(volute(p).buildRun());
      const fancy = recordLayers(volute(p, { showModuleArcs: true }).buildRun());
      const arcs = (d: ReturnType<typeof recordLayers>) => d.elements.filter(el => isArc(el) && !isProfile(el));
      expect(arcs(fancy).map(el => el.attrs['d'])).toEqual(arcs(plain).map(el => el.attrs['d']));
      expect(arcs(fancy).every(el => el.attrs['stroke-width'] === 2 && !el.parent)).toBe(true);
      const lines = (d: ReturnType<typeof recordLayers>) => d.elements.filter(el => el.tag === 'line').length;
      expect(lines(fancy) - lines(plain)).toBeGreaterThanOrEqual(2 * arcs(fancy).length);
    });

    // the arcs each panel draws in colour, not the plain profile under them, nor the halo, which
    // draws wide in a lighter group
    const spiralArcs = (instance: ScrollPanel | VolutePanel) => recordLayers(instance.buildRun()).elements
      .filter(el => isArc(el) && !isProfile(el) && el.attrs['stroke-width'] !== 12);
    const choose = (instance: VolutePanel, style: VoluteStyle) => {
      instance.scroll.style = style;
      instance.buildRun();
    };

    it('draws the four point spiral from its arc radii, and nothing once one shrinks', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before.length).toBe(10);
      p.scroll!.arcRadii[7] += 3;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      p.scroll!.arcRadii[6] = p.scroll!.arcRadii[7];
      expect(spiralArcs(instance)).toHaveLength(10);
      p.scroll!.arcRadii[6] = p.scroll!.arcRadii[7] + 1;
      expect(spiralArcs(instance)).toEqual([]);
    });

    it('carries the radii after one set past them up to it, leaving those already wider and those inside alone', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const before = [...p.scroll!.arcRadii];
      const radius = (before[6] + before[7]) / 2;
      instance.setArcRadius(2, radius);
      expect(p.scroll!.arcRadii).toEqual([...before.slice(0, 2), radius, radius, radius, radius, radius, before[7]]);
      expect(spiralArcs(instance)).toHaveLength(10);
      instance.setArcRadius(4, before[1]);
      expect(p.scroll!.arcRadii[5]).toBe(radius);
      instance.setArcRadius(4, null as unknown as number);
      expect(p.scroll!.arcRadii.slice(6)).toEqual([radius, before[7]]);
    });

    it('colours the spiral by turn and arc and the crown, back and front in theirs, whatever the arc toggles', () => {
      const p = defaultViolin();
      const strokes = (instance: ScrollPanel | VolutePanel) => spiralArcs(instance).map(el => el.attrs['stroke']);
      const turns = [
        'voluteTurn1', 'voluteTurn1Alt', 'voluteTurn1', 'voluteTurn1Alt',
        'voluteTurn2', 'voluteTurn2Alt', 'voluteTurn2', 'voluteTurn2Alt',
      ];
      const crown = ['scrollFrontLight', 'scrollFront'];
      for (const over of [{}, { showModuleArcs: true }]) {
        const instance = volute(p, over);
        instance.buildRun();
        for (const style of ['fourPoint', 'salviati'] as const) {
          choose(instance, style);
          expect(strokes(instance), style).toEqual([...turns, ...crown]);
        }
      }
      // the scroll panel leaves the spiral and the crown to the plain profile
      const backAndFront = ['scrollBackLight', 'scrollBack', 'scrollNape', 'scrollFront', 'scrollFrontLight'];
      for (const over of [{}, { showModuleArcs: true }, { showAllArcs: true }]) {
        expect(strokes(scroll(p, over))).toEqual(backAndFront);
      }
      // the toggles add only the centres and radii
      const lines = (over: Partial<CerutiViewFlags>) =>
        recordLayers(volute(p, { showVoluteConstruction: false, ...over }).buildRun()).elements.filter(el => el.tag === 'line').length;
      expect(lines({ showModuleArcs: true })).toBeGreaterThan(lines({}));
    });

    it('draws the whole scroll as plain profile under either panel\'s own arcs, and no profile once part of it fails', () => {
      const p = defaultViolin();
      for (const instance of [volute(p), scroll(p)]) {
        const els = recordLayers(instance.buildRun()).elements;
        expect(els.filter(isProfile), instance.constructor.name).toHaveLength(1);
        expect(els.findIndex(isProfile)).toBeLessThan(els.findIndex(el => isArc(el) && !isProfile(el)));
      }
      p.scroll!.F1.r = 0;
      for (const instance of [volute(p), scroll(p)]) expect(recordLayers(instance.buildRun()).elements.filter(isProfile)).toEqual([]);
      // the scroll panel falls back to the volute in its own colours
      expect(spiralArcs(scroll(p)).map(el => el.attrs['stroke'])).toContain('voluteTurn1');
    });

    it('seeds the four point radii from Kelly\'s once, then leaves them to the user', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const kelly = styleArcs({ ...p.scroll!, style: 'kelly' }).reverse().map(a => Math.round(a.r * 100) / 100);
      expect(p.scroll!.arcRadii).toEqual(kelly);
      const seeded = [...p.scroll!.arcRadii];
      p.scroll!.eye.r = 1.2;
      instance.buildRun();
      expect(p.scroll!.arcRadii).toEqual(seeded);
      p.scroll!.arcRadii[5] += 1;
      choose(instance, 'salviati');
      choose(instance, 'fourPoint');
      expect(p.scroll!.arcRadii[5]).toBeCloseTo(seeded[5] + 1, 9);
    });

    it('haloes the four point arc whose field has focus, and nothing once it blurs', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'fourPoint');
      const halos = () => recordLayers(instance.buildRun()).elements.filter(el => el.attrs['stroke-width'] === 12);
      expect(halos()).toHaveLength(0);
      instance.onArcFocus(3, instance.arcColor(3));
      const [halo] = halos();
      expect(halo.parent!.attrs['opacity']).toBeLessThan(1);
      expect(halo.attrs['stroke']).toBe(instance.arcColor(3));
      instance.onArcBlur();
      expect(halos()).toHaveLength(0);
    });

    it('haloes a crown arc on the volute panel from its field, over the arc drawn there', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      const plain = spiralArcs(instance).map(el => el.attrs['d']);
      for (const [i, key] of (['S0', 'S1'] as const).entries()) {
        instance.onArcFocus(key, 'tint');
        const [halo] = recordLayers(instance.buildRun()).elements.filter(el => el.attrs['stroke-width'] === 12);
        expect(halo.attrs['stroke']).toBe('tint');
        expect(halo.attrs['d']).toBe(plain[8 + i]);
      }
    });

    it('haloes the back or front part whose field has focus, in its own colour', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const plain = spiralArcs(instance).map(el => el.attrs['d']);
      const halo = () => {
        const [only, ...rest] = recordLayers(instance.buildRun()).elements.filter(el => el.attrs['stroke-width'] === 12);
        expect(rest).toEqual([]);
        return only.attrs;
      };
      const arcs = [['S2', 'scrollBackLight', 0], ['S3', 'scrollBack', 1], ['nape', 'scrollNape', 2], ['F0', 'scrollFront', 3], ['F1', 'scrollFrontLight', 4]] as const;
      for (const [key, color, i] of arcs) {
        instance.onArcFocus(key, color);
        expect(halo()['stroke']).toBe(color);
        expect(halo()['d']).toBe(plain[i]);
      }
      // the straights and the flat halo the segment their length makes
      for (const line of ['backStraight', 'flat', 'frontStraight'] as const) {
        instance.onArcFocus(line, 'tint');
        expect(halo()['stroke']).toBe('tint');
        expect(halo()['x1']).toEqual(expect.any(Number));
      }
      instance.onArcBlur();
      expect(recordLayers(instance.buildRun()).elements.filter(el => el.attrs['stroke-width'] === 12)).toEqual([]);
    });

    it('redraws the Archimedean as the pitch changes, and keeps the pitch across a change of style', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'archimedean');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before).toHaveLength(18);
      p.scroll!.pitch += 1;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      const set = p.scroll!.pitch;
      choose(instance, 'salviati');
      choose(instance, 'archimedean');
      expect(p.scroll!.pitch).toBe(set);
    });

    it('lists the custom four point first and the historical rules after it', () => {
      const instance = volute(defaultViolin());
      expect(instance['styles'].map(s => s.id)).toEqual(['fourPoint', 'archimedean', 'serlio', 'salviati', 'goldmann', 'kelly']);
      expect(instance['styles'].find(s => s.id === 'kelly')!.label).toBe('Kelly (2011)');
    });

    it('sizes a historical figure from the eye alone, redrawing as the eye changes', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'goldmann');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before).toHaveLength(10);
      p.scroll!.eye.r += 0.2;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
    });

    it('redraws Kelly\'s spiral as its seed lengthens, the eye left alone', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'kelly');
      expect(p.scroll!.seedLength).toBe(p.scroll!.eye.r);
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before).toHaveLength(10);
      p.scroll!.seedLength += 1;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      p.scroll!.seedLength = 0;
      expect(spiralArcs(instance)).toEqual([]);
    });

    it('names each four point field by how many turns out from the eye its arc ends', () => {
      const instance = volute(defaultViolin());
      expect([0, 1, 2, 3, 4, 10, 15].map(i => instance.arcEnd(i))).toEqual(['¼', '½', '¾', '1', '1¼', '2¾', '4']);
    });

    it('draws every style out to its front, the volute panel the spiral and crown and the scroll panel the back and front on from it', () => {
      const p = defaultViolin();
      const instance = volute(p, { showVoluteConstruction: false });
      const whole = scroll(p);
      instance.buildRun();
      const front = { archimedean: 16, serlio: 8, salviati: 8, goldmann: 8, kelly: 8, fourPoint: 8 };
      for (const style of Object.keys(VOLUTE_STYLE_LABELS) as VoluteStyle[]) {
        choose(instance, style);
        expect(spiralArcs(instance).length, style).toBe(front[style] + 2);
        expect(spiralArcs(whole).length, style).toBe(5);
      }
      expect(recordLayers(instance.buildRun()).elements.filter(el => el.tag === 'line').length)
        .toBeLessThan(recordLayers(whole.buildRun()).elements.filter(el => el.tag === 'line').length);
    });

    it('redraws the back from the arc that changed on, and stops it at one with no radius', () => {
      const p = defaultViolin();
      const instance = scroll(p);
      instance.buildRun();
      const v = p.scroll!;
      expect(v.S1.r).toBeGreaterThan(v.S0.r);
      expect(v.S2.r).toBeGreaterThan(v.S1.r);
      const drawn = () => spiralArcs(instance).map(el => el.attrs['d']);
      const before = drawn();
      // read off params each time: the calc puts a new arc there every pass. S2 on down the back
      // moves with S1, the front stays
      v.S1.end = 170 * Math.PI / 180;
      const after = drawn();
      expect(after.slice(0, 3).every((d, i) => d !== before[i])).toBe(true);
      expect(after.slice(3)).toEqual(before.slice(3));
      // the spiral and S0 in their own colours again, F0 and F1 after them
      v.S1.r = 0;
      expect(spiralArcs(instance)).toHaveLength(11);
    });

    it('draws a crown arc past half a turn the long way round, as it sweeps', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      const largeArc = () => {
        const d = spiralArcs(instance).at(-1)!.attrs['d'] as string;
        return d.match(/ A \S+ 0 ([01]),1 /)![1];
      };
      expect(largeArc()).toBe('0');
      p.scroll!.S1.end = p.scroll!.S0.end + 1.2 * Math.PI;
      expect(largeArc()).toBe('1');
    });

    it('draws the straight after S2 and the line square to the neck before the nape, in S2\'s colour and the nape\'s', () => {
      const p = defaultViolin();
      const traced = () => {
        const instance = scroll(p, { showModuleGuides: false, showVoluteConstruction: false });
        return recordLayers(instance.buildRun()).elements.filter(el => el.tag === 'line' && el.attrs['stroke-width'] === 2).map(el => el.attrs);
      };
      expect(traced().map(l => l['stroke'])).toEqual(['scrollBackLight', 'scrollNape', 'scrollFrontLight', 'scrollFront']);
      const [, square] = traced();
      expect(square['y1']).toBeCloseTo(square['y2'] as number, 9);

      const instance = scroll(p);
      instance.buildRun();
      const arcs = () => spiralArcs(instance).map(el => el.attrs['d']);
      const before = arcs();
      p.scroll!.backStraight += 2;
      const after = arcs();
      // S3 and the nape move with it, the front stays
      expect([after[0], ...after.slice(3)]).toEqual([before[0], ...before.slice(3)]);
      expect(after.slice(1, 3).every((d, i) => d !== before[1 + i])).toBe(true);
      p.scroll!.backStraight = 0;
      expect(traced()).toHaveLength(3);
      expect(spiralArcs(instance)).toHaveLength(5);
    });

    it('runs the neck\'s back up to where the nape meets it, above the nut or below, and draws no nape too wide to fit', () => {
      const p = defaultViolin();
      const instance = scroll(p, { showModuleArcs: true, showModuleGuides: false, showVoluteConstruction: false });
      const drawn = () => recordLayers(instance.buildRun()).elements;
      const backTop = (els: ReturnType<typeof drawn>) => els
        .filter(el => el.tag === 'line' && el.attrs['stroke'] === 'neckOff' && el.attrs['x1'] === -p.neck!.thickness && el.attrs['x2'] === -p.neck!.thickness)
        .map(el => Math.max(el.attrs['y1'] as number, el.attrs['y2'] as number));
      // the default duck tail sits on the nut line, so its nape meets the neck's back below the nut
      expect(backTop(drawn())).toEqual([p.scroll!.nape.y]);
      expect(p.scroll!.nape.y).toBeLessThan(0);
      p.scroll!.eye.y += 20;
      const naped = drawn();
      const nape = naped.filter(el => el.attrs['stroke'] === 'scrollNape' && String(el.attrs['d'] ?? '').includes(' A '));
      expect(nape).toHaveLength(1);
      expect(p.scroll!.nape.y).toBeGreaterThan(0);
      expect(backTop(naped)).toEqual([p.scroll!.nape.y]);
      p.scroll!.nape.r = 1000;
      const unfit = drawn();
      expect(unfit.filter(el => el.attrs['stroke'] === 'scrollNape')).toEqual([]);
      expect(backTop(unfit)).toEqual([0]);
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

describe('the scroll widths panel', () => {
  it('haloes the focused point on the side, back and front, and nothing once it blurs', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.buildRun();
    const halos = () => recordLayers(instance.buildRun()).elements.filter(el => el.tag === 'circle' && el.attrs['opacity'] === 0.33);
    expect(halos()).toEqual([]);
    instance.onPointFocus('turn2Top');
    const station = scrollWidthStations(instance.params).find(st => st.key === 'turn2Top')!;
    const marked = halos();
    expect(marked).toHaveLength(5);
    expect(marked.every(el => el.attrs['cy'] === station.at.y)).toBe(true);
    expect(marked[0].attrs['cx']).toBe(station.at.x);
    instance.onPointBlur();
    expect(halos()).toEqual([]);
  });

  it('draws shoulders where the nut and the neck differ in width, from behind only, and none when as wide', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.buildRun();
    const p = instance.params;
    const v = p.scroll!;
    const levelAtStart = (length: number) => recordLayers(instance.buildRun()).elements.filter(el => {
      const start = scrollBackWidths(p)[0];
      return el.tag === 'line' && el.attrs['y1'] === start.y && el.attrs['y2'] === start.y
        && Math.abs(Math.abs((el.attrs['x1'] as number) - (el.attrs['x2'] as number)) - length) < 1e-9;
    });
    const shoulders = () => levelAtStart(Math.abs(p.stringSetup!.nutWidth / 2 - duckTailRadius(p)));
    p.stringSetup!.nutWidth = 2 * duckTailRadius(p);
    expect(shoulders()).toEqual([]);
    for (const wider of [4, -4]) {
      p.stringSetup!.nutWidth = 2 * duckTailRadius(p) + wider;
      expect(shoulders()).toHaveLength(2);
    }
  });

  it('runs the front view down to the foot of the nut and closes it level there, whatever the duck tail', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    // the nut's corners cut the closing where it crosses them, and walls narrower than the nut pass
    // behind it, so only the level run at the end is read
    const closings = () => recordLayers(instance.buildRun()).elements.filter(el =>
      el.tag === 'path' && el.attrs['stroke'] === 'archTop' && /^M [^-]/.test(el.attrs['d'] as string) && / \S+ 0 L \S+ 0$/.test(el.attrs['d'] as string));
    expect(scrollBackWidths(p)[0].y).toBeGreaterThan(0);
    expect(closings()).toHaveLength(2);
    instance.params.neck!.topWidth -= 10;
    expect(closings()).toHaveLength(2);
  });

  it('shows the front\'s walls from behind, in the front\'s colour and with no bottom under a nut as wide as the neck, until the path starts at or below the nut\'s foot', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const v = instance.params.scroll!;
    // the back view stands left of the side view, the front view right of it
    const fromBehind = () => recordLayers(instance.buildRun()).elements.filter(el =>
      el.attrs['stroke'] === 'archTop' && /^M -/.test(el.attrs['d'] as string));
    const p = instance.params;
    const start = scrollBackWidths(p)[0].y;
    expect(start).toBeGreaterThan(0);
    const walls = fromBehind();
    expect(walls).toHaveLength(2);
    for (const el of walls) expect(el.attrs['d']).toMatch(new RegExp(`^M \\S+ ${start} L \\S+ 0$`));

    // a straight too short to clear the round: down the taper to the straight's end, then square to the foot
    v.pegbox.straight = 2;
    const tapered = fromBehind();
    expect(tapered).toHaveLength(2);
    for (const el of tapered) expect(el.attrs['d']).toMatch(new RegExp(`^M \\S+ ${start} L \\S+ ${p.stringSetup!.nutHeight + 2} L \\S+ 0$`));
    v.pegbox.straight = 8;

    v.eye = new Circle(v.eye.x, v.eye.y - 15, v.eye.r);
    instance.buildRun();
    expect(scrollBackWidths(p)[0].y).toBeLessThanOrEqual(0);
    expect(fromBehind()).toEqual([]);
  });

  it('joins the neck to the front\'s walls from behind along the front\'s foot, in its colour, where the nut is wider than the neck', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    p.stringSetup!.nutWidth = p.neck!.topWidth + 6;
    const drawn = recordLayers(instance.buildRun()).elements;
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const fromBehind = (stroke: string) => drawn
      .filter(el => el.tag === 'path' && el.attrs['stroke'] === stroke && /^M -/.test(el.attrs['d'] as string))
      .map(el => points(el.attrs['d'] as string));

    const front = fromBehind('archTop');
    const joins = front.filter(pts => pts.every(pt => Math.abs(pt.y) < 1e-9));
    expect(front).toHaveLength(4);
    expect(joins).toHaveLength(2);
    const walls = front.filter(pts => !joins.includes(pts));
    const center = (walls[0][0].x + walls[1][0].x) / 2;
    const neckTops = fromBehind('neckOff').map(pts => pts.at(-1)!);
    for (const join of joins) {
      const [outer, inner] = [...join].sort((a, b) => Math.abs(b.x - center) - Math.abs(a.x - center));
      expect(Math.abs(outer.x - center)).toBeCloseTo(p.stringSetup!.nutWidth / 2, 6);
      expect(Math.abs(inner.x - center)).toBeCloseTo(p.neck!.topWidth / 2, 6);
      expect(neckTops.some(top => Math.hypot(top.x - inner.x, top.y - inner.y) < 1e-6)).toBe(true);
    }
  });

  it('carries the neck on below both views, widening down it: in front up to the nut over it, behind up to where it meets the scroll', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const drawn = recordLayers(instance.buildRun()).elements;
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const sides = drawn.filter(el => el.tag === 'path' && el.attrs['stroke'] === 'neckOff').map(el => points(el.attrs['d'] as string));
    expect(sides).toHaveLength(4);
    for (const [bottom] of sides) expect(bottom.y).toBeCloseTo(-2 * p.neck!.thickness, 9);

    const [behind, inFront] = [sides.filter(s => s[0].x < 0), sides.filter(s => s[0].x > 0)];
    const center = (pair: Pt[][]) => (pair[0][0].x + pair[1][0].x) / 2;
    for (const pair of [behind, inFront]) {
      for (const [bottom, top] of pair) expect(Math.abs(bottom.x - center(pair))).toBeGreaterThan(Math.abs(top.x - center(pair)));
    }
    for (const [, top] of inFront) {
      expect(top.y).toBeCloseTo(0, 9);
      expect(Math.abs(top.x - center(inFront))).toBeCloseTo(p.neck!.topWidth / 2, 9);
    }
    // the default path starts above the nut's foot, so a neck as wide as the nut stops at the foot of the front's walls
    for (const [, top] of behind) {
      expect(top.y).toBeCloseTo(0, 6);
      expect(Math.abs(top.x - center(behind))).toBeCloseTo(p.stringSetup!.nutWidth / 2, 6);
    }

    const nut = drawn.filter(el => el.attrs['stroke'] === 'nut').map(el => points(el.attrs['d'] as string));
    const front = nut.find(corners => corners.every(c => c.x > center(inFront) - p.stringSetup!.nutWidth))!;
    expect(Math.max(...front.map(c => c.x)) - Math.min(...front.map(c => c.x))).toBeCloseTo(p.stringSetup!.nutWidth, 9);
    expect([Math.min(...front.map(c => c.y)), Math.max(...front.map(c => c.y))]).toEqual([0, p.stringSetup!.nutHeight]);

    // with the path starting below the foot there are no walls, and the sides run on up under the round
    const { eye } = p.scroll!;
    p.scroll!.eye = new Circle(eye.x, eye.y - 15, eye.r);
    instance.buildRun();
    const lowered = recordLayers(instance.buildRun()).elements
      .filter(el => el.tag === 'path' && el.attrs['stroke'] === 'neckOff').map(el => points(el.attrs['d'] as string))
      .filter(s => s[0].x < 0);
    const { y } = scrollBackWidths(p)[0];
    expect(y).toBeLessThanOrEqual(0);
    // on the round as drawn, a polyline a hundredth or so inside the true circle
    for (const [, top] of lowered) expect(Math.hypot(top.x - center(lowered), top.y - y)).toBeCloseTo(duckTailRadius(p), 1);
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
