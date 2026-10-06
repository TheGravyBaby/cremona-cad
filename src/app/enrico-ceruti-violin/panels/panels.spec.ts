import { TestBed } from '@angular/core/testing';
import { maxRibTaperMm, ribHeightAt, solveRibTaper } from '../calculation/arching/ceruti-arching';
import { samplePathToPolyline, splitPathStrings, translatePath, applyMatrix } from '../../helpers/math/pathMath';
import { splineZAt } from '../../helpers/math/vibeMath';
import { recordLayers } from '../../helpers/layer-recorder';
import { archedViolin, defaultViolin } from '../ceruti-fixtures';
import { CerutiColors, CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, DefaultParams, EnricoCerutiParams, PathEntry, VoluteStyle } from '../ceruti-types';
import { ensureFrontProfilePaths, getPath, solveNeckForProfile } from '../calculation/outline/ceruti-calcs';
import { plateLayoutOffset } from '../calculation/arching/ceruti-arch-geometry';
import { defineBackNeckPath, defineFholePath, defineInnerPath, defineOuterPath, definePlacedSideScrollPath, definePurflingPath, mortiseFloorY, scrollOnNeck } from '../calculation/outline/ceruti-paths';
import { vectorFromSlope } from '../../helpers/math/simpleGeometry';
import { defaultStringSetup, mortiseFingerboardIntersect, plateEdgeAtNeck } from '../calculation/neck/ceruti-neck';
import { defaultFHolePlacement, FHolePlacementPanel } from './f-hole-placement-panel/f-hole-placement-panel';
import { renderFrontProfile, renderPlatePair } from '../renders/front-profile.render';
import { CenterBoutPanel } from './center-bout-panel/center-bout-panel';
import { CornersPanel } from './corners-panel/corners-panel';
import { CrossArchingPanel } from './cross-arching-panel/cross-arching-panel';
import { FlutingPanel } from './fluting-panel/fluting-panel';
import { LongArchingPanel } from './long-arching-panel/long-arching-panel';
import { MainBoutsPanel } from './main-bouts-panel/main-bouts-panel';
import { FHoleContoursPanel } from './f-hole-contours-panel/f-hole-contours-panel';
import { MouldPanel } from './mould-panel/mould-panel';
import { NeckPanel } from './neck-panel/neck-panel';
import { StringSetupPanel } from './string-setup-panel/string-setup-panel';
import { OuterTracePanel } from './outer-trace-panel/outer-trace-panel';
import { ScrollPanel } from './scroll-panel/scroll-panel';
import { ScrollWidthsPanel } from './scroll-widths-panel/scroll-widths-panel';
import { defaultVoluteParams, duckTailRadius, duckTailRoundTop, pegboxHipHeight, pegboxWidth, scrollBackWidths, scrollExtent, scrollLines, scrollNeckHalfWidth, scrollPathStretches, scrollWidthStations, spiralArcs as styleArcs, VOLUTE_STYLE_LABELS } from '../calculation/neck/ceruti-scroll';
import { VolutePanel } from './volute-panel/volute-panel';
import { Pt } from '../../models/types';
import { scrollBackInPlan, scrollBackViewStrokes, scrollFrontInPlan } from '../calculation/neck/ceruti-scroll-views';
import { sideViewOffsetX } from '../renders/body-side-profile.render';
import { STROKE_WEIGHT } from '../../helpers/renderFuncs';

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
  ['string setup', StringSetupPanel],
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
});

describe('the main bouts panel lays the rib outline under its own work', () => {
  it('draws the whole outline on a finished instrument, following a bout edit, and nothing past it', () => {
    const p = defaultViolin();
    const instance = panel(MainBoutsPanel, p);
    const before = recordLayers(instance.buildRun()).paths;
    const outline = defineInnerPath(p);
    expect(before).toContain(outline);
    expect(before).not.toContain(definePurflingPath(p, p.overhang + p.rib)!);

    p.bouts.LBW! += 10;
    const after = recordLayers(instance.buildRun()).paths;
    expect(after).toContain(defineInnerPath(p));
    expect(after).not.toContain(outline);
  });

  it('shows the corners drafted on a new instrument when coming back from their panel', () => {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    const main = panel(MainBoutsPanel, p);
    const boutsOnly = defineInnerPath(p);
    expect(recordLayers(main.buildRun()).paths).toContain(defineInnerPath(p));

    panel(CornersPanel, p).buildRun();
    const back = recordLayers(main.buildRun()).paths;
    expect(back).toContain(defineInnerPath(p));
    expect(back).not.toContain(boutsOnly);
  });
});

describe('the corners panel lays the rib outline under its own work', () => {
  it('draws the bouts carried out to the corners on a first visit', () => {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    panel(MainBoutsPanel, p).buildRun();
    const drawn = recordLayers(panel(CornersPanel, p).buildRun()).paths;
    expect(drawn).toContain(defineInnerPath(p));
  });

  it('shows the center bout drafted on a new instrument when coming back from its panel, following a corner edit', () => {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    panel(MainBoutsPanel, p).buildRun();
    const corners = panel(CornersPanel, p);
    corners.buildRun();
    const cornersOnly = defineInnerPath(p);

    const center = panel(CenterBoutPanel, p);
    center.paths = [];
    center.buildRun();
    const back = recordLayers(corners.buildRun()).paths;
    const closed = defineInnerPath(p);
    expect(back).toContain(closed);
    expect(back).not.toContain(cornersOnly);

    p.bouts.LCr = new Pt(p.bouts.LCr!.x + 2, p.bouts.LCr!.y);
    const moved = recordLayers(corners.buildRun()).paths;
    expect(moved).toContain(defineInnerPath(p));
    expect(moved).not.toContain(closed);
  });
});

describe('the whole front profile', () => {
  it('keeps to the rib outline until the outer trace is reached', () => {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    panel(MainBoutsPanel, p).buildRun();
    panel(CornersPanel, p).buildRun();
    const paths: PathEntry[] = [];
    const drawn = recordLayers(renderFrontProfile(p, paths, colors, ensureFrontProfilePaths(p, paths))).paths;
    expect(drawn).toEqual([defineInnerPath(p)]);
  });

  it('adds the neck once the neck panel has set it', () => {
    const p = archedViolin();
    const paths: PathEntry[] = [];
    const drawn = () => recordLayers(renderFrontProfile(p, paths, colors, ensureFrontProfilePaths(p, paths))).paths.length;
    const without = drawn();
    const neck = panel(NeckPanel, p);
    neck.paths = paths;
    neck.buildRun();
    expect(drawn()).toBeGreaterThan(without);
  });
});

describe('the neck panel', () => {
  it('draws the board and nut only once the string setup panel has set them, and never the bridge or strings', () => {
    const p = archedViolin();
    const neck = panel(NeckPanel, p);
    const before = recordLayers(neck.buildRun()).elements.length;
    expect(p.stringSetup).toBeUndefined();
    const setup = panel(StringSetupPanel, p);
    const touchesBridgeTop = (els: { tag: string; attrs: Record<string, unknown> }[]) => {
      const top = p.stringSetup!.bridgeTop!;
      const atTop = (x: unknown, y: unknown) => x === top.x && y === top.y;
      return els.some(el => el.tag === 'line' && (atTop(el.attrs['x1'], el.attrs['y1']) || atTop(el.attrs['x2'], el.attrs['y2'])));
    };
    expect(touchesBridgeTop(recordLayers(setup.buildRun()).elements)).toBe(true);
    const after = recordLayers(neck.buildRun()).elements;
    expect(after.length).toBeGreaterThan(before);
    expect(touchesBridgeTop(after)).toBe(false);
  });
});

describe('view flags gate what is drawn', () => {
  it('the module circles appear only when their toggle is on', () => {
    const off = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ showModuleCircles: false, showAllCircles: false })).buildRun());
    const on = recordLayers(panel(MainBoutsPanel, defaultViolin(), flags({ showModuleCircles: true })).buildRun());
    expect(on.countByTag['circle'] ?? 0).toBeGreaterThan(off.countByTag['circle'] ?? 0);
  });

  it('all arcs draws the arcs of earlier stages fancy under a later panel', () => {
    const off = recordLayers(panel(CornersPanel, defaultViolin(), flags({ showModuleArcs: true, showAllArcs: false })).buildRun());
    const on = recordLayers(panel(CornersPanel, defaultViolin(), flags({ showModuleArcs: true, showAllArcs: true })).buildRun());
    expect(on.elements.length).toBeGreaterThan(off.elements.length);
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
  it('boxes the head from the nut to the crown and from the neck\'s front to the back\'s furthest reach under module guides, dashed', () => {
    const p = defaultViolin();
    const lines = (showModuleGuides: boolean) => recordLayers(panel(ScrollPanel, p, flags({ showModuleGuides, showVoluteConstruction: false, showModuleArcs: false })).buildRun())
      .elements.filter(el => el.tag === 'line').map(el => el.attrs as Record<string, number>);
    const dashed = (l: Record<string, unknown>) => !!l['stroke-dasharray'];
    expect(lines(false).filter(dashed)).toEqual([]);

    const { height, width } = scrollExtent(p.scroll!);
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
    expect(Math.max(...nut.map(c => c[0]))).toBeCloseTo(defaultStringSetup(p).nutThickness, 9);
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
      expect(drawnFree.elements.filter(el => isArc(el) && !isProfile(el)).length).toBeGreaterThan(0);
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
      expect(before.length).toBeGreaterThan(0);
      p.scroll!.arcRadii[7] += 3;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      p.scroll!.arcRadii[6] = p.scroll!.arcRadii[7];
      expect(spiralArcs(instance).length).toBeGreaterThan(0);
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
      expect(spiralArcs(instance).length).toBeGreaterThan(0);
      instance.setArcRadius(4, before[1]);
      expect(p.scroll!.arcRadii[5]).toBe(radius);
      instance.setArcRadius(4, null as unknown as number);
      expect(p.scroll!.arcRadii.slice(6)).toEqual([radius, before[7]]);
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

    it('redraws the Archimedean as the pitch changes, and keeps the pitch across a change of style', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'archimedean');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before.length).toBeGreaterThan(0);
      p.scroll!.pitch += 1;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      const set = p.scroll!.pitch;
      choose(instance, 'salviati');
      choose(instance, 'archimedean');
      expect(p.scroll!.pitch).toBe(set);
    });

    it('sizes a historical figure from the eye alone, redrawing as the eye changes', () => {
      const p = defaultViolin();
      const instance = volute(p);
      instance.buildRun();
      choose(instance, 'goldmann');
      const before = spiralArcs(instance).map(el => el.attrs['d']);
      expect(before.length).toBeGreaterThan(0);
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
      expect(before.length).toBeGreaterThan(0);
      p.scroll!.seedLength += 1;
      expect(spiralArcs(instance).map(el => el.attrs['d'])).not.toEqual(before);
      p.scroll!.seedLength = 0;
      expect(spiralArcs(instance)).toEqual([]);
    });

    it('draws every style out to its front, the volute panel the spiral and crown and the scroll panel the back and front on from it', () => {
      const p = defaultViolin();
      const instance = volute(p, { showVoluteConstruction: false });
      const whole = scroll(p);
      instance.buildRun();
      for (const style of Object.keys(VOLUTE_STYLE_LABELS) as VoluteStyle[]) {
        choose(instance, style);
        expect(spiralArcs(instance).length, style).toBeGreaterThan(0);
        expect(spiralArcs(whole).length, style).toBeGreaterThan(0);
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
      // read off params each time: the calc puts a new arc there every pass. S2 and S3 move with
      // S1; the nape, hung off the nut, and the front stay
      v.S1.end = 170 * Math.PI / 180;
      const after = drawn();
      expect(after.slice(0, 2).every((d, i) => d !== before[i])).toBe(true);
      expect(after.slice(2)).toEqual(before.slice(2));
      v.S1.r = 0;
      expect(spiralArcs(instance).length).toBeGreaterThan(0);
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
      // S3 moves with it; the nape, hung off the nut, and the front stay
      expect([after[0], ...after.slice(2)]).toEqual([before[0], ...before.slice(2)]);
      expect(after[1]).not.toEqual(before[1]);
      // no straight leaves S3's foot higher, so it takes a wider S3 to come down to the nut
      p.scroll!.backStraight = 0;
      p.scroll!.S3.r = 60;
      expect(traced()).toHaveLength(3);
      expect(spiralArcs(instance)).toHaveLength(5);
    });

    it('runs the neck\'s back up to where the nape meets it, and draws no nape too wide to fit', () => {
      const p = defaultViolin();
      const instance = scroll(p, { showModuleArcs: true, showModuleGuides: false, showVoluteConstruction: false });
      const drawn = () => recordLayers(instance.buildRun()).elements;
      const backTop = (els: ReturnType<typeof drawn>) => els
        .filter(el => el.tag === 'line' && el.attrs['stroke'] === 'neckOff' && el.attrs['x1'] === -p.neck!.thickness && el.attrs['x2'] === -p.neck!.thickness)
        .map(el => Math.max(el.attrs['y1'] as number, el.attrs['y2'] as number));
      // the duck tail hangs no higher than the nut line, so the nape meets the neck's back below it
      const naped = drawn();
      const nape = naped.filter(el => el.attrs['stroke'] === 'scrollNape' && String(el.attrs['d'] ?? '').includes(' A '));
      expect(nape).toHaveLength(1);
      expect(p.scroll!.nape.y).toBeLessThan(0);
      expect(backTop(naped)).toEqual([p.scroll!.nape.y]);
      p.scroll!.hang = 8;
      expect(backTop(drawn())).toEqual([p.scroll!.nape.y]);
      expect(p.scroll!.nape.y).toBeLessThan(-8);
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
  it('draws a crosshair at each width point only while module guides are on', () => {
    const p = defaultViolin();
    const count = (showModuleGuides: boolean) => {
      const instance = panel(ScrollWidthsPanel as any, p, flags({ showModuleGuides })) as unknown as ScrollWidthsPanel;
      return recordLayers(instance.buildRun()).elements.length;
    };
    const diff = count(true) - count(false);
    expect(diff).toBeGreaterThan(0);
    expect(diff % scrollWidthStations(p).length).toBe(0);
  });

  it('draws each view as it is seen: a turn\'s far side only as far as the next turn lets it show, and the hollow dashed in the side view', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const on = scrollPathStretches(p);
    const turn1Bottom = on.turn1Front.at(-1)!;
    const turn2Top = on.turn2Back.at(-1)!;
    const turn2Bottom = on.turn2Front.at(-1)!;
    const turn3Top = on.turn3Back.at(-1)!;
    const eyeBottom = p.scroll!.eye.y - p.scroll!.eye.r;

    const drawn = recordLayers(instance.buildRun()).elements.filter(el => el.tag === 'path');
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const paths = (stroke: string) => drawn.filter(el => el.attrs['stroke'] === stroke && !el.attrs['stroke-dasharray']).map(el => points(el.attrs['d'] as string));
    // the turns draw in one ink in both views, the back view left of the side view and the front right
    const turns = (behind: boolean) => paths('scrollTurns').filter(pts => (pts[0].x < 0) === behind);
    // each line is drawn once on each side, and known here by the height it stops at
    const stoppingAt = (behind: boolean, y: number) => turns(behind).filter(pts => Math.abs(pts.at(-1)!.y - y) < 1e-9);

    // from behind the second turn's front stops at the top of the last, where that turn's back ends too
    expect(stoppingAt(true, turn3Top.y)).toHaveLength(4);
    // the first turn's front would stop at the second's top, but under the default crown the head's
    // back beside it is the wider and hides it: only the second turn's back ends there
    expect(stoppingAt(true, turn2Top.y)).toHaveLength(2);
    // from in front the backs stop at the bottom of the next turn in, the last at the eye's
    expect(stoppingAt(false, turn2Bottom.y)).toHaveLength(4);
    expect(stoppingAt(false, eyeBottom)).toHaveLength(2);
    // and nothing of the head's back or the pegbox shows above the first turn's bottom but the turns
    const frontView = paths('archTop').filter(pts => pts[0].x > 0);
    expect(frontView.filter(pts => pts[0].y < turn1Bottom.y - 1e-9).every(pts => pts.every(pt => pt.y <= turn1Bottom.y + 1e-9))).toBe(true);

    const mouth = drawn.filter(el => el.attrs['stroke'] === 'scrollFrontLight' && !el.attrs['stroke-dasharray']);
    expect(mouth).toHaveLength(1);
    const hidden = scrollLines(p).frontStraight[1].y > turn1Bottom.y;
    expect(/Z$/.test(mouth[0].attrs['d'] as string)).toBe(!hidden);
    expect(Math.max(...points(mouth[0].attrs['d'] as string).map(pt => pt.y))).toBeLessThanOrEqual(turn1Bottom.y + 1e-9);

    // the volute's bottom closes right across the pegbox running in under it
    const across = recordLayers(instance.buildRun()).elements.filter(el =>
      el.tag === 'line' && el.attrs['stroke'] === 'scrollTurns' && (el.attrs['x1'] as number) > 0 && el.attrs['y1'] === turn1Bottom.y && el.attrs['y2'] === turn1Bottom.y);
    expect(across).toHaveLength(1);
    expect(Math.abs((across[0].attrs['x1'] as number) - (across[0].attrs['x2'] as number))).toBeCloseTo(2 * turn1Bottom.x, 9);

    const hollow = drawn.filter(el => el.attrs['stroke-dasharray']);
    expect(hollow).toHaveLength(1);

    // a back already narrow at its poll lets the first turn's front stand out past it, and then it
    // shows from behind, down to the second turn's top
    p.scroll!.widths.poll = 14;
    const narrowed = recordLayers(instance.buildRun()).elements
      .filter(el => el.tag === 'path' && el.attrs['stroke'] === 'scrollTurns')
      .map(el => points(el.attrs['d'] as string))
      .filter(pts => pts[0].x < 0);
    expect(narrowed.filter(pts => Math.abs(pts.at(-1)!.y - turn2Top.y) < 1e-9)).toHaveLength(4);
  });

  it('shows the pegbox\'s cheeks above the first turn\'s bottom only where they stand out past the volute', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    // a cheek is as far from the view's centre as the pegbox is wide at each of its heights
    const cheeks = () => {
      const turn1Bottom = scrollPathStretches(p).turn1Front.at(-1)!;
      const paths = recordLayers(instance.buildRun()).elements
        .filter(el => el.tag === 'path' && el.attrs['stroke'] === 'archTop')
        .map(el => points(el.attrs['d'] as string))
        .filter(pts => pts[0].x > 0);
      const center = (Math.min(...paths.flat().map(pt => pt.x)) + Math.max(...paths.flat().map(pt => pt.x))) / 2;
      return paths.filter(pts => pts[0].y > turn1Bottom.y - 1e-9 && pts[0].y < turn1Bottom.y + 2
        && pts.every(pt => Math.abs(Math.abs(pt.x - center) - pegboxWidth(p, pt.y) / 2) < 1e-6));
    };
    expect(cheeks()).toEqual([]);

    // a first turn no wider than the pegbox at its bottom and narrowing above it, but the second
    // turn's back curls round in front of the throat, wider, and hides the cheeks
    const defaults = { ...p.scroll!.widths };
    Object.assign(p.scroll!.widths, { throat: 16.5, crown: 11.5, turn1Bottom: 18, turn2Top: 28, turn2Bottom: 34.5, eye: 42 });
    expect(cheeks()).toEqual([]);
    Object.assign(p.scroll!.widths, defaults);

    p.neck!.nutWidth = 44;
    p.scroll!.widths.throat = 40;
    const showing = cheeks();
    expect(showing).toHaveLength(2);
    for (const pts of showing) expect(pts.length).toBeGreaterThan(3);
  });

  it('starts the back as wide as its foot, a wider foot meeting the round along level shoulders', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const v = p.scroll!;
    const shoulders = () => recordLayers(instance.buildRun()).elements.filter(el => {
      const start = scrollBackWidths(p)[0];
      return el.tag === 'line' && el.attrs['y1'] === start.y && el.attrs['y2'] === start.y && el.attrs['stroke'] === 'archBack';
    });
    p.neck!.topWidth = v.widths.duckTail - 4;
    expect(shoulders()).toEqual([]);
    expect(scrollBackWidths(p)[0].x).toBeCloseTo(v.widths.duckTail / 2, 9);
    v.widths.foot = v.widths.duckTail + 10;
    expect(shoulders()).toHaveLength(2);
    for (const el of shoulders()) expect(Math.abs((el.attrs['x1'] as number) - (el.attrs['x2'] as number))).toBeCloseTo(5, 9);
    expect(scrollBackWidths(p)[0].x).toBeCloseTo(v.widths.foot / 2, 9);
    expect(duckTailRadius(p)).toBeCloseTo(v.widths.duckTail / 2, 9);
  });

  it('marks the crown, the poll and the duck tail behind and the crown, the throat and the hips in front under module arcs, each its width across on its view\'s centreline, with a centreline down each view', () => {
    const p = defaultViolin();
    const draw = (showModuleArcs: boolean) => {
      const instance = panel(ScrollWidthsPanel as any, p, flags({ showModuleArcs, showModuleGuides: false })) as unknown as ScrollWidthsPanel;
      instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
      return recordLayers(instance.buildRun()).elements;
    };
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const circles = (els: ReturnType<typeof draw>) => els.filter(el => el.tag === 'circle');
    const halves = (els: ReturnType<typeof draw>, key: string) => els.filter(el => el.tag === 'path' && el.attrs['stroke'] === `scrollWidth${key}`).map(el => points(el.attrs['d'] as string));
    const centrelines = (els: ReturnType<typeof draw>) => els.filter(el => el.tag === 'line' && el.attrs['stroke-dasharray'] && el.attrs['x1'] === el.attrs['x2']);
    expect(circles(draw(false))).toEqual([]);
    expect(centrelines(draw(false))).toEqual([]);
    const on = draw(true);
    const stations = scrollWidthStations(p);
    const [behind, inFront] = centrelines(on).map(el => el.attrs['x1'] as number).sort((a, b) => a - b);
    expect(behind).toBeLessThan(-scrollExtent(p.scroll!).width);
    expect(inFront).toBeGreaterThan(0);
    for (const el of centrelines(on)) expect(Math.max(el.attrs['y1'] as number, el.attrs['y2'] as number)).toBeCloseTo(scrollExtent(p.scroll!).height, 9);

    const full = { poll: behind, duckTail: behind, hip: inFront };
    expect(circles(on)).toHaveLength(3);
    for (const [key, center] of Object.entries(full)) {
      const st = stations.find(s => s.key === key)!;
      expect(circles(on).some(el => el.attrs['cx'] === center && Math.abs((el.attrs['cy'] as number) - st.at.y) < 1e-9 && Math.abs((el.attrs['r'] as number) - st.width / 2) < 1e-9), key).toBe(true);
    }
    // a half circle hangs below its station's height, its ends a diameter apart on that line
    const hanging = (pts: Pt[], center: number, st: { at: Pt; width: number }) => {
      expect(pts.every(pt => pt.y <= st.at.y + 1e-9)).toBe(true);
      expect(Math.min(...pts.map(pt => pt.y))).toBeCloseTo(st.at.y - st.width / 2, 6);
      expect([pts[0].x, pts.at(-1)!.x].sort((a, b) => a - b)).toEqual([center - st.width / 2, center + st.width / 2].map(c => expect.closeTo(c, 6)));
    };
    const crown = stations.find(st => st.key === 'crown')!;
    const throat = stations.find(st => st.key === 'throat')!;
    const crowns = halves(on, 'Crown');
    expect(crowns).toHaveLength(2);
    hanging(crowns.find(pts => pts[0].x < 0)!, behind, crown);
    hanging(crowns.find(pts => pts[0].x > 0)!, inFront, crown);
    const throats = halves(on, 'Throat');
    expect(throats).toHaveLength(1);
    hanging(throats[0], inFront, throat);
  });

  it('draws a level shoulder on the round\'s top where the neck stands wider than it, out from the round or from cheeks wider still, and none for a narrower neck', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const v = p.scroll!;
    const levelAtStart = () => recordLayers(instance.buildRun()).elements.filter(el => {
      const start = scrollBackWidths(p)[0];
      return el.tag === 'line' && el.attrs['y1'] === start.y && el.attrs['y2'] === start.y;
    });
    const lengths = () => levelAtStart().map(el => Math.abs((el.attrs['x1'] as number) - (el.attrs['x2'] as number)));
    const start = () => scrollBackWidths(p)[0].y;
    v.hipHeight = duckTailRoundTop(p) - p.neck!.nutHeight;
    // a neck narrower than the round runs in under it
    p.neck!.topWidth = v.widths.duckTail - 4;
    expect(levelAtStart()).toEqual([]);
    // wider than the round and the hips: out from the round
    v.widths.hip = v.widths.duckTail;
    p.neck!.topWidth = v.widths.duckTail + 8;
    const proud = scrollNeckHalfWidth(p, start()) - duckTailRadius(p);
    expect(proud).toBeGreaterThan(1);
    expect(lengths()).toHaveLength(2);
    for (const l of lengths()) expect(l).toBeCloseTo(proud, 9);
    // hips wider than the round but narrower than the neck: out from the cheeks
    v.widths.hip = v.widths.duckTail + 4;
    const fromCheeks = scrollNeckHalfWidth(p, start()) - v.widths.hip / 2;
    expect(fromCheeks).toBeGreaterThan(0.5);
    expect(lengths()).toHaveLength(2);
    for (const l of lengths()) expect(l).toBeCloseTo(fromCheeks, 9);
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

  it('shows the pegbox\'s front from behind, in its colour, wherever it stands out past the back, and none of it behind a wider back', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const v = p.scroll!;
    // the back view stands left of the side view, the front view right of it
    const fromBehind = () => recordLayers(instance.buildRun()).elements.filter(el =>
      el.tag === 'path' && el.attrs['stroke'] === 'archTop' && /^M -/.test(el.attrs['d'] as string));
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const nutTop = p.neck!.nutHeight;

    // hips on the round's top a touch wider than the back, the nut's edges as wide as the round: the
    // cheeks show from where the taper above the hips comes out past the back, down the hips to the
    // nut's edge at its top, and square to the foot, standing clear of the round the whole way
    v.hipHeight = duckTailRoundTop(p) - p.neck!.nutHeight;
    v.widths.hip = v.widths.duckTail + 2;
    v.widths.poll = v.widths.duckTail;
    p.neck!.nutWidth = v.widths.duckTail;
    const start = scrollBackWidths(p)[0].y;
    expect(start).toBeGreaterThan(nutTop);
    // the foot's edge is the two-point path beside each cheek
    expect(fromBehind()).toHaveLength(4);
    const walls = fromBehind().filter(el => points(el.attrs['d'] as string).length > 2);
    expect(walls).toHaveLength(2);
    const center = (points(walls[0].attrs['d'] as string).at(-1)!.x + points(walls[1].attrs['d'] as string).at(-1)!.x) / 2;
    for (const el of walls) {
      const pts = points(el.attrs['d'] as string);
      expect(pts).toHaveLength(4);
      const [first, hips, nutEdge, foot] = pts;
      expect(first.y).toBeGreaterThan(start);
      expect(hips.y).toBeCloseTo(start, 9);
      expect(nutEdge.y).toBeCloseTo(nutTop, 9);
      expect(foot.y).toBeCloseTo(0, 9);
      expect(Math.abs(first.x - center)).toBeCloseTo(v.widths.duckTail / 2, 6);
      expect(Math.abs(hips.x - center)).toBeCloseTo(v.widths.hip / 2, 6);
      expect(Math.abs(foot.x - center)).toBeCloseTo(p.neck!.nutWidth / 2, 6);
    }

    // a back wider than the whole of the pegbox's front hides it, bottom and all
    v.widths.duckTail = v.widths.hip + 2;
    v.widths.backHip = v.widths.poll = v.widths.duckTail;
    v.hang = v.widths.duckTail / 2 + 1;
    instance.buildRun();
    expect(scrollBackWidths(p)[0].y).toBeLessThan(0);
    expect(fromBehind()).toEqual([]);
  });

  it('shows a cello\'s cheeks from behind down to hips on the pegbox\'s foot, and the foot\'s edge in to the neck', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    const v = p.scroll!;
    v.widths.hip = 46;
    p.neck!.nutWidth = 42;
    p.neck!.topWidth = 33;
    v.hipHeight = -p.neck!.nutHeight;
    const drawn = recordLayers(instance.buildRun()).elements;
    const roundTop = duckTailRoundTop(p);
    expect(roundTop).toBeGreaterThan(0);
    const points = (d: string) => [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => new Pt(+m[1], +m[2]));
    const fromBehind = drawn
      .filter(el => el.tag === 'path' && el.attrs['stroke'] === 'archTop' && /^M -/.test(el.attrs['d'] as string))
      .map(el => points(el.attrs['d'] as string));
    // the cheeks come out past the back above the round's top and run down to the hips on the foot
    const cheeks = fromBehind.filter(pts => pts.length === 2 && pts[0].y > roundTop && Math.abs(pts[1].y) < 1e-6);
    expect(cheeks).toHaveLength(2);
    const center = (cheeks[0][1].x + cheeks[1][1].x) / 2;
    for (const [, hip] of cheeks) expect(Math.abs(hip.x - center)).toBeCloseTo(23, 6);
    // the foot's edge shows from the hips in to where the neck covers it
    const footEdges = fromBehind.filter(pts => pts.length === 2 && pts.every(pt => Math.abs(pt.y) < 1e-6));
    expect(footEdges).toHaveLength(2);
    for (const [corner, inner] of footEdges) {
      expect(Math.abs(corner.x - center)).toBeCloseTo(23, 6);
      expect(Math.abs(inner.x - center)).toBeCloseTo(p.neck!.topWidth / 2, 6);
    }
    // the neck is narrower than the cheeks, so nothing is level with the round's top
    const shoulders = drawn.filter(el => el.tag === 'line' && el.attrs['y1'] === roundTop && el.attrs['y2'] === roundTop);
    expect(shoulders).toEqual([]);
  });

  it('joins the neck to the front\'s walls from behind along the front\'s foot, in its colour, where the nut is wider than the neck', () => {
    const instance = panel(ScrollWidthsPanel as any, defaultViolin()) as unknown as ScrollWidthsPanel;
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    instance.buildRun();
    const p = instance.params;
    p.neck!.nutWidth = p.neck!.topWidth + 6;
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
      expect(Math.abs(outer.x - center)).toBeCloseTo(p.neck!.nutWidth / 2, 6);
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
      expect(Math.abs(top.x - center(behind))).toBeCloseTo(p.neck!.nutWidth / 2, 6);
    }

    const nut = drawn.filter(el => el.attrs['stroke'] === 'nut').map(el => points(el.attrs['d'] as string));
    const front = nut.find(corners => corners.every(c => c.x > center(inFront) - p.neck!.nutWidth))!;
    expect(Math.max(...front.map(c => c.x)) - Math.min(...front.map(c => c.x))).toBeCloseTo(p.neck!.nutWidth, 9);
    expect([Math.min(...front.map(c => c.y)), Math.max(...front.map(c => c.y))]).toEqual([0, p.neck!.nutHeight]);

    // with the path starting below the foot there are no walls, and the sides run on up under the round
    p.scroll!.hang = p.scroll!.widths.hip / 2 + 1;
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

  it('keeps the top centred with its f-holes, and the back to its left', () => {
    const p = archedViolin();
    p.fHoles = defaultFHolePlacement(p);
    const drawn = recordLayers(panel(FlutingPanel as any, p).buildRun()).paths;
    expect(drawn).toContain(defineOuterPath(p, undefined, true, false));
    for (const hole of splitPathStrings(defineFholePath(p))) expect(drawn).toContain(hole);
    const left = drawn.filter(d => xRange(d).max < 0);
    expect(left.length).toBeGreaterThan(0);
  });
});

describe('the outer path panel', () => {
  const named = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
  const build = (p: EnricoCerutiParams, over: Partial<CerutiViewFlags> = {}) => {
    const instance = panel(OuterTracePanel, p, flags({ showModuleArcs: false, showAllArcs: false, ...over }));
    instance.colors = named;
    return recordLayers(instance.buildRun()).elements;
  };

  it('keeps the top centred with its f-holes, and draws the back to its left with the button in blue', () => {
    const p = defaultViolin();
    p.fHoles = defaultFHolePlacement(p);
    const drawn = build(p);
    const d = drawn.map(el => el.attrs['d'] as string);
    expect(d).toContain(defineOuterPath(p, undefined, true, false));
    for (const hole of splitPathStrings(defineFholePath(p))) expect(d).toContain(hole);

    const button = drawn.filter(el => el.attrs['stroke'] === 'archBack');
    expect(button.length).toBeGreaterThan(0);
    for (const el of button) expect(xRange(el.attrs['d'] as string).max).toBeLessThan(0);
  });
});

function xRange(d: string): { min: number; max: number } {
  const xs = samplePathToPolyline(d, 1, true).map(q => q.x);
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

describe('the f-hole placement panel lays the front profile under its own work', () => {
  it('draws the holes cut to their contours as placed, following a placement edit', () => {
    const p = archedViolin();
    const instance = panel(FHolePlacementPanel, p);
    const before = recordLayers(instance.buildRun()).paths;
    for (const hole of splitPathStrings(defineFholePath(p))) expect(before).toContain(hole);

    p.fHoles!.LEye!.y += 2;
    const after = recordLayers(instance.buildRun()).paths;
    for (const hole of splitPathStrings(defineFholePath(p))) expect(after).toContain(hole);
  });

  it('leaves the neck and scroll off even once they are set', () => {
    const p = archedViolin();
    const instance = panel(FHolePlacementPanel, p);
    const without = recordLayers(instance.buildRun()).paths;
    const neck = panel(NeckPanel, p);
    neck.paths = instance.paths;
    neck.buildRun();
    p.scroll = defaultVoluteParams(p);
    expect(recordLayers(instance.buildRun()).paths).toEqual(without);
  });
});

describe('the f-hole contours panel lays the front profile under its own work', () => {
  it('draws the outline and purfling in grey, leaving the holes to its own colours', () => {
    const p = archedViolin();
    const instance = panel(FHoleContoursPanel, p);
    instance.colors = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    const drawn = recordLayers(instance.buildRun()).elements;
    const d = drawn.map(el => el.attrs['d']);
    expect(d).toContain(defineOuterPath(p, undefined, true, false));
    expect(d).toContain(definePurflingPath(p, p.overhang + p.rib)!);
    for (const hole of splitPathStrings(defineFholePath(p))) expect(d).not.toContain(hole);
  });

  it('leaves the neck and scroll off even once they are set', () => {
    const p = archedViolin();
    const instance = panel(FHoleContoursPanel, p);
    const without = recordLayers(instance.buildRun()).paths;
    const neck = panel(NeckPanel, p);
    neck.paths = instance.paths;
    neck.buildRun();
    p.scroll = defaultVoluteParams(p);
    expect(recordLayers(instance.buildRun()).paths).toEqual(without);
  });
});

describe('the neck panel side view', () => {
  it('draws the mortise floor only from where it leaves the plate out to the neck\'s face', () => {
    const p = archedViolin();
    const instance = panel(NeckPanel, p, flags({ showModuleGuides: false }));
    const lines = recordLayers(instance.buildRun()).elements.filter(el => el.tag === 'line');
    const floorY = mortiseFloorY(p);
    const atFloor = lines.filter(el => Math.abs((el.attrs['y1'] as number) - floorY) < 0.01 && Math.abs((el.attrs['y2'] as number) - floorY) < 0.01);
    expect(atFloor).toHaveLength(1);
    const xs = [atFloor[0].attrs['x1'] as number, atFloor[0].attrs['x2'] as number].sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(p.neck!.plateAtMortise!.x, 9);
    expect(xs[0]).toBeGreaterThan(plateEdgeAtNeck(p).x - p.arching!.top.thickness);
    expect(xs[1]).toBeCloseTo(mortiseFingerboardIntersect(p).x, 9);
  });
});

describe('the scroll set on the neck in the side view', () => {
  const scrolled = () => {
    const p = archedViolin();
    panel(NeckPanel, p).buildRun();
    p.scroll = defaultVoluteParams(p);
    return p;
  };
  const lineEnds = (el: { attrs: Record<string, unknown> }) =>
    [new Pt(el.attrs['x1'] as number, el.attrs['y1'] as number), new Pt(el.attrs['x2'] as number, el.attrs['y2'] as number)];
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

  it('puts the scroll frame\'s origin on the nut, up the neck along +y and toward the fingerboard along +x', () => {
    const p = scrolled();
    const m = scrollOnNeck(p);
    const nk = p.neck!;
    const up = vectorFromSlope(nk.angle + Math.PI / 2), normal = vectorFromSlope(nk.angle);
    expect(near(applyMatrix(m, new Pt(0, 0)), nk.neckTop!)).toBe(true);
    expect(near(applyMatrix(m, new Pt(0, 1)), new Pt(nk.neckTop!.x + up.a, nk.neckTop!.y + up.b))).toBe(true);
    expect(near(applyMatrix(m, new Pt(1, 0)), new Pt(nk.neckTop!.x + normal.a, nk.neckTop!.y + normal.b))).toBe(true);
  });

  it('draws the scroll on the neck panel once started, with no wall at the nut and the back up to the nape', () => {
    const p = scrolled();
    const before = recordLayers(panel(NeckPanel, archedViolinWithNeck()).buildRun()).elements;
    expect(before.filter(el => el.tag === 'line').some(el => lineEnds(el).some(e => near(e, p.neck!.backNut!)))).toBe(true);

    const drawn = recordLayers(panel(NeckPanel, p).buildRun()).elements;
    expect(drawn.map(el => el.attrs['d'])).toContain(definePlacedSideScrollPath(p));
    const lines = drawn.filter(el => el.tag === 'line');
    const nk = p.neck!;
    expect(lines.some(el => lineEnds(el).some(e => near(e, nk.neckTop!)) && lineEnds(el).some(e => near(e, nk.backNut!)))).toBe(false);
    const napeJoin = applyMatrix(scrollOnNeck(p), new Pt(-nk.thickness, p.scroll!.nape.y));
    expect(lines.some(el => lineEnds(el).some(e => near(e, napeJoin)))).toBe(true);
  });

  it('draws it under the body on the long arching panel, when that panel draws the neck', () => {
    const p = scrolled();
    const instance = panel(LongArchingPanel, p);
    instance.showNeck = true;
    const placed = recordLayers(instance.buildRun()).elements.find(el => el.attrs['d'] === definePlacedSideScrollPath(p));
    expect(placed).toBeDefined();
  });
});

describe('the scroll\'s front view on the front profile', () => {
  const necked = () => {
    const p = archedViolin();
    const paths: PathEntry[] = [];
    panel(OuterTracePanel, p).buildRun();
    const neck = panel(NeckPanel, p);
    neck.paths = paths;
    neck.buildRun();
    return { p, paths };
  };

  // the widths panel's drawing set on the neck, foreshortened by its tilt and nothing else: carrying
  // each point's depth up the body landed the turns at different heights and pulled the drawing apart
  it('sets the widths panel\'s view on the neck\'s end, foreshortened by its tilt, its depth ignored', () => {
    const { p } = necked();
    p.scroll = defaultVoluteParams(p);
    const v = p.scroll;
    const m = scrollOnNeck(p);
    const eyeSides = scrollFrontInPlan(p).filter(s => 'line' in s && s.line[0].x === s.line[1].x && Math.abs(Math.abs(s.line[0].x) - v.widths.eye / 2) < 1e-9);
    expect(eyeSides).toHaveLength(2);
    const bottom = applyMatrix(m, new Pt(0, v.eye.y - v.eye.r)).y;
    const top = applyMatrix(m, new Pt(0, v.eye.y + v.eye.r)).y;
    for (const s of eyeSides) {
      const [a, b] = (s as { line: [Pt, Pt] }).line;
      expect(a.y).toBeCloseTo(bottom, 9);
      expect(b.y).toBeCloseTo(top, 9);
    }
  });

  it('draws the back view on the back plate\'s neck, over its own centreline', () => {
    const { p } = necked();
    p.scroll = defaultVoluteParams(p);
    const v = p.scroll;
    const dx = -123;
    const strokes = scrollBackInPlan(p, dx);
    const eyeSides = strokes.filter(s => 'line' in s && s.line[0].x === s.line[1].x && Math.abs(Math.abs(s.line[0].x - dx) - v.widths.eye / 2) < 1e-9);
    expect(eyeSides).toHaveLength(2);
    const m = scrollOnNeck(p);
    for (const s of eyeSides) {
      const [a, b] = (s as { line: [Pt, Pt] }).line;
      expect(a.y).toBeCloseTo(applyMatrix(m, new Pt(0, v.eye.y - v.eye.r)).y, 9);
      expect(b.y).toBeCloseTo(applyMatrix(m, new Pt(0, v.eye.y + v.eye.r)).y, 9);
    }
    // the neck's sides the widths panel carries on below the nut are the profile's own here
    const ys = (d: string) => [...d.matchAll(/[ML]\s*-?[\d.e-]+\s+(-?[\d.e-]+)/g)].map(mm => Number(mm[1]));
    const stub = 2 * p.neck!.thickness;
    const onPanel = scrollBackViewStrokes(p, (x, y) => new Pt(x, y), -stub).filter(s => s.ink === 'neckOff');
    expect(onPanel).toHaveLength(2);
    expect(onPanel.every(s => Math.min(...ys((s as { d: string }).d)) < 0)).toBe(true);
    const inPlan = strokes.filter(s => s.ink === 'neckOff');
    expect(inPlan.every(s => Math.min(...ys((s as { d: string }).d)) >= p.neck!.neckTop!.y - 1e-6)).toBe(true);
  });

  it('goes on the profile in grey once the scroll is started, and not before', () => {
    const { p, paths } = necked();
    const named = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    const unstarted = ensureFrontProfilePaths(p, paths);
    expect(unstarted.scroll).toBe(false);
    const before = recordLayers(renderFrontProfile(p, paths, named, unstarted)).elements;
    p.scroll = defaultVoluteParams(p);
    const solve = ensureFrontProfilePaths(p, paths);
    expect(solve.scroll).toBe(true);
    const after = recordLayers(renderFrontProfile(p, paths, named, solve)).elements;
    expect(after.length - before.length).toBe(scrollFrontInPlan(p).length);
    expect(after.slice(before.length).every(el => el.attrs['stroke'] === 'outerTrace')).toBe(true);
  });

  it('goes on the neck panel\'s front view too', () => {
    const { p, paths } = necked();
    p.stringSetup = defaultStringSetup(p);
    const neck = panel(NeckPanel, p);
    neck.paths = paths;
    const before = recordLayers(neck.buildRun()).elements.length;
    p.scroll = defaultVoluteParams(p);
    // in the side view the scroll's path takes the place of the wall across the nut, one for one
    expect(recordLayers(neck.buildRun()).elements.length).toBe(before + scrollFrontInPlan(p).length);
  });

  it('goes on the plate pair once asked for, the front view on the top and the back view on the back', () => {
    const { p, paths } = necked();
    const neckOnly = recordLayers(renderPlatePair(p, paths, colors, STROKE_WEIGHT.trace, solveNeckForProfile(p))).elements.length;
    p.scroll = defaultVoluteParams(p);
    const dx = plateLayoutOffset(p, 'bottom');
    const withScroll = recordLayers(renderPlatePair(p, paths, colors, STROKE_WEIGHT.trace, solveNeckForProfile(p))).elements.length;
    expect(withScroll - neckOnly).toBe(scrollFrontInPlan(p).length + scrollBackInPlan(p, dx).length);
    // the plate panels don't ask for it yet
    for (const instance of [panel(OuterTracePanel, p), panel(FlutingPanel, p)]) {
      instance.paths = paths;
      expect(recordLayers(instance.buildRun()).elements.some(el => el.attrs['d'] === translatePath(defineBackNeckPath(p, getPath(paths, 'back')), dx, 0))).toBe(false);
    }
  });

  it('draws the neck on the back plate from the plate\'s edge, not from the mortise', () => {
    const { p, paths } = necked();
    const named = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
    const dx = plateLayoutOffset(p, 'bottom');
    const neck = recordLayers(renderPlatePair(p, paths, named, STROKE_WEIGHT.trace, solveNeckForProfile(p))).elements.find(el => el.attrs['d'] === translatePath(defineBackNeckPath(p, getPath(paths, 'back')), dx, 0));
    expect(neck).toBeDefined();
    const ys = [...(neck!.attrs['d'] as string).matchAll(/[ML]\s*-?[\d.e-]+\s+(-?[\d.e-]+)/g)].map(m => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(mortiseFloorY(p) + p.neck!.mortiseDepth / 2);
    expect(Math.max(...ys)).toBeCloseTo(p.neck!.neckTop!.y, 6);
  });
});

function archedViolinWithNeck(): EnricoCerutiParams {
  const p = archedViolin();
  panel(NeckPanel, p).buildRun();
  return p;
}

describe('the long arching panel lays the neck the user has set under the body', () => {
  const named = new Proxy({}, { get: (_, key) => String(key) }) as CerutiColors;
  const build = (p: EnricoCerutiParams, showNeck = true) => {
    const instance = panel(LongArchingPanel, p);
    instance.colors = named;
    instance.showNeck = showNeck;
    return recordLayers(instance.buildRun()).elements;
  };

  it('leaves the neck off unless asked for it', () => {
    const p = archedViolin();
    const without = build(p, false).length;
    panel(NeckPanel, p).buildRun();
    expect(build(p, false).length).toBe(without);
    expect(build(p).length).toBeGreaterThan(without);
  });

  it('draws no neck before the neck panel is visited, and the neck in grey after', () => {
    const p = archedViolin();
    const before = build(p);
    expect(before.some(el => el.attrs['stroke'] === 'outerTrace')).toBe(false);

    const neck = panel(NeckPanel, p);
    neck.buildRun();
    const after = build(p);
    const grey = after.filter(el => el.attrs['stroke'] === 'outerTrace');
    expect(grey.length).toBeGreaterThan(0);
    expect(after.length - before.length).toBe(grey.length);
    for (const part of ['neck', 'neckRoot', 'fingerboard', 'nut', 'bridge']) {
      expect(after.some(el => el.attrs['stroke'] === part), part).toBe(false);
    }
  });

  it('leaves out the strings and the bridge', () => {
    const p = archedViolin();
    panel(StringSetupPanel, p).buildRun();
    const top = p.stringSetup!.bridgeTop!;
    const touchesBridgeTop = (el: { attrs: Record<string, unknown> }) =>
      (Math.abs((el.attrs['x1'] as number) - top.x) < 1e-6 && Math.abs((el.attrs['y1'] as number) - top.y) < 1e-6)
      || (Math.abs((el.attrs['x2'] as number) - top.x) < 1e-6 && Math.abs((el.attrs['y2'] as number) - top.y) < 1e-6)
      || (typeof el.attrs['d'] === 'string' && (el.attrs['d'] as string).includes(`${top.x} ${top.y}`));
    expect(recordLayers(panel(StringSetupPanel, p).buildRun()).elements.some(touchesBridgeTop)).toBe(true);
    expect(build(p).some(touchesBridgeTop)).toBe(false);
  });

  it('carries the neck with the rib taper', () => {
    const p = archedViolin();
    panel(NeckPanel, p).buildRun();
    build(p);
    const root = p.neck!.root!;
    p.arching!.ribHeightUpper -= 1;
    build(p);
    expect(p.neck!.root!.x).toBeLessThan(root.x);
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

describe('where the two profiles sit', () => {
  const sideShift = (elements: ReturnType<typeof recordLayers>['elements']) =>
    elements.filter(e => e.layer === 'g' && e.tag === 'g' && e.parent === undefined).map(e => String(e.attrs['transform']));

  it('keeps the neck panel\'s front view on x = 0 and moves its side view left of it, clear of the plan', () => {
    const p = archedViolin();
    panel(StringSetupPanel, p).buildRun();
    const instance = panel(NeckPanel, p);
    const drawn = recordLayers(instance.buildRun()).elements;
    expect(sideShift(drawn)).toEqual([`translate(${sideViewOffsetX(p)},0)`]);
    // the front view draws at the root, outside any moved group
    expect(drawn.filter(e => e.tag === 'path' && e.parent === undefined).length).toBeGreaterThan(0);
    expect(p.stringSetup!.bridgeTop!.x + sideViewOffsetX(p)).toBeLessThan(-p.width / 2);
  });

  it('puts the long arching panel\'s side view in the same place, neck or no neck', () => {
    const p = archedViolin();
    const before = sideViewOffsetX(p);
    expect(sideShift(recordLayers(panel(LongArchingPanel, p).buildRun()).elements)).toEqual([`translate(${before},0)`]);
    panel(NeckPanel, p).buildRun();
    expect(sideViewOffsetX(p)).toBe(before);
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
    // the plate's own group, inside the one moving the whole side view over: the one that turns it
    const group = drawn.elements.find(e => e.layer === 'g' && e.tag === 'g' && String(e.attrs['transform']).includes('rotate'));
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
  it('mirrors nothing, and says so rather than leaving it out', () => {
    const panelUnderTest = panel(LongArchingPanel, archedViolin());
    panelUnderTest.setCurveType('top', 'spline');
    expect(panelUnderTest.topSpline!.points.map(pt => pt.mirror)).toEqual([false, false, false, false]);
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
