import { recordLayers } from '../../../helpers/layer-recorder';
import { archedViolin, defaultViolin, templateViolin } from '../../ceruti-fixtures';
import { DefaultParams, EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateMould } from '../../calculation/outline/ceruti-calcs';
import { defaultFHolePlacement } from '../f-hole-placement-panel/f-hole-placement-panel';
import { ExportPanel } from './export-panel';
import { pathsBounds } from '../../../helpers/math/pathMath';
import { calculateNeck, defaultNeckParams, defaultStringSetup } from '../../calculation/neck/ceruti-neck';
import { defaultFlutingParams, solveLongArch } from '../../calculation/arching/ceruti-arch-geometry';
import { defaultVoluteParams, scrollBackStrip, scrollCompassWalk } from '../../calculation/neck/ceruti-scroll';
import { nightTheme } from '../../../theme/theme-fixtures';
import { ThemeService } from '../../../theme/theme.service';

/**
 * The export panel — the last step, and the one whose output leaves the app.
 *
 * It is deliberately not shaped like the other panels (no `#panelRef`, emits
 * `draftChange` directly), so the panel suite does not cover it. What makes it
 * worth its own file is that everything here is terminal: a wrong path on a
 * sheet is cut into wood, and the two guards that matter — that the path cache
 * is filled before it is read, and that an arching export refuses rather than
 * throws on a plate with no arching — both fail as an exception or an empty
 * file rather than as anything visible.
 */

const theme = nightTheme();

/** The plain export buttons (excluding the f-hole templates, covered below), and which of them need an arched plate. */
const PLAIN_EXPORTS = ['innerTrace', 'outerTrace', 'back', 'mould', 'blocks'] as const;
const ARCHING_EXPORTS = ['crossArchTemplates', 'longArchTemplates'] as const;

// the outline drafted and nothing past it, as the blank instrument leaves it on reaching Export
function outlined(): EnricoCerutiParams {
  const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
  calculateMainBouts(p);
  calculateCorners(p);
  calculateCenterBout(p);
  return p;
}

function placed(p: EnricoCerutiParams): EnricoCerutiParams {
  p.fHoles = defaultFHolePlacement(p);
  return p;
}

// the mould panel reached, which is what seeds the blocks
function moulded(): EnricoCerutiParams {
  const p = defaultViolin();
  calculateMould(p, false, false);
  return p;
}

function makePanel(p: EnricoCerutiParams, fileName = 'test-violin'): ExportPanel {
  ThemeService.useTheme(theme);
  const panel = new ExportPanel();
  panel.params = p;
  panel.paths = [] as PathEntry[];
  panel.fileName = fileName;
  return panel;
}

/** Captures a download without navigating, returning the file's name and text. */
async function captured(run: () => void): Promise<{ name: string; text: string } | null> {
  let blob: Blob | undefined;
  let name = '';
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b: any) => { blob = b; return 'blob:test'; });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    name = this.download;
  });
  try {
    run();
  } finally {
    create.mockRestore(); revoke.mockRestore(); click.mockRestore();
  }
  if (!blob) return null;
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob!);
  });
  return { name, text };
}

describe('the export panel on activation', () => {
  it('fills the path cache itself and previews the outer trace', () => {
    // It is reachable without opening any earlier panel — the step selector goes
    // straight there — so it cannot assume anyone else populated the cache.
    const panel = makePanel(defaultViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));

    panel.ngOnInit();

    expect(panel.paths.map(e => e.key)).toEqual(expect.arrayContaining(['inner', 'top', 'back']));
    expect(emitted).toHaveLength(1);
    expect(recordLayers(emitted[0]).elements.length).toBeGreaterThan(0);
  });
});

describe('previewing an export', () => {
  it.each(ARCHING_EXPORTS)('%s draws the blanks once the plate is arched', type => {
    const panel = makePanel(archedViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));

    panel.previewExport(type);

    const drawn = recordLayers(emitted[0]);
    expect(drawn.paths.length).toBeGreaterThan(0);
    // Each blank is labelled — an unlabelled sheet of templates is unusable,
    // since the blanks are only told apart by where they were cut.
    expect(drawn.countByTag['text'] ?? 0).toBeGreaterThan(0);
  });

  it('crossArchTemplates clears the canvas rather than throwing with no arching', () => {
    // Reachable: the export step unlocks off the outline, so a recipe can arrive
    // here with no plate at all. The panel warns and draws nothing.
    const panel = makePanel(defaultViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));

    expect(() => panel.previewExport('crossArchTemplates')).not.toThrow();
    expect(emitted[0]).toEqual([]);
  });
});

describe('a blank instrument skipped straight to Export', () => {
  it('offers its inner trace and nothing it would have to invent', () => {
    const panel = makePanel(outlined());
    panel.ngOnInit();

    expect([...(panel as any).ready]).toEqual(['innerTrace']);
    expect(panel.params.fHoles).toBeUndefined();
    expect(panel.params.blocks.CU).toBeUndefined();
    expect(panel.params.button).toBeNull();
  });

  it('writes the inner trace on a sheet with no button to make room for', async () => {
    const result = await captured(() => makePanel(outlined()).downloadExport('innerTrace'));
    expect(result).not.toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('writes nothing for a sheet whose panel was never reached', async () => {
    for (const type of ['outerTrace', 'back', 'fholeTemplate', 'mould', 'blocks'] as const) {
      expect(await captured(() => makePanel(outlined()).downloadExport(type))).toBeNull();
    }
  });
});

describe('f-holes on the top plate only', () => {
  it('draws both mirrored holes on the outer trace once they are placed', () => {
    const panel = makePanel(placed(defaultViolin()));
    panel.previewExport('outerTrace');

    // two separate closed loops in the cached path — one hole per side, not just the treble side
    expect(panel.paths.find(e => e.key === 'fHole')?.path.match(/M/g)).toHaveLength(2);
  });

  it('leaves the holes off the outer trace until they are placed', () => {
    const panel = makePanel(defaultViolin());
    panel.previewExport('outerTrace');

    expect(panel.params.fHoles).toBeUndefined();
    expect(panel.paths.find(e => e.key === 'fHole')).toBeUndefined();
  });
});

/** Segment endpoints, same extraction ceruti-paths.spec.ts uses on drafting-side `d` strings. */
function pathEndpoints(d: string): { x: number; y: number }[] {
  return (d.match(/[MLACQ][^MLACQ]*/g) ?? []).map((seg: string) => {
    const n = seg.slice(1).trim().split(/[\s,]+/).map(Number);
    return { x: n[n.length - 2], y: n[n.length - 1] };
  });
}

describe('the f-hole cutting template', () => {
  it('draws exactly one unmirrored hole, sized to its own bounds rather than the plan', async () => {
    const p = placed(defaultViolin());
    const result = await captured(() => makePanel(p).downloadExport('fholeTemplate'));
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    const paths = [...doc.querySelectorAll('path')];

    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('d')?.match(/M/g)).toHaveLength(1);

    const viewBox = doc.documentElement.getAttribute('viewBox')!.split(' ').map(Number);
    expect(viewBox[2]).toBeLessThan(p.width);
  });

  it('actually lands inside the sheet it is sized to, not off at the hole\'s real plate position', async () => {
    // The hole itself sits wherever it does on the plate — near the corner, so its own y can run
    // into the hundreds of mm. A template sheet sized to the hole's bounds but never translated
    // onto them draws a geometrically valid, entirely off-sheet path: a blank page, not a thrown
    // error, which is why the SVG/PDF sizing tests above didn't already catch it.
    const result = await captured(() => makePanel(placed(archedViolin())).downloadExport('fholeTemplate'));
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    const d = doc.querySelector('path')!.getAttribute('d')!;
    const [vx, vy, vw, vh] = doc.documentElement.getAttribute('viewBox')!.split(' ').map(Number);

    const tolerance = 1; // mm — the true bbox can bulge slightly past its arcs' own endpoints
    for (const { x, y } of pathEndpoints(d)) {
      expect(x).toBeGreaterThanOrEqual(vx - tolerance);
      expect(x).toBeLessThanOrEqual(vx + vw + tolerance);
      expect(y).toBeGreaterThanOrEqual(vy - tolerance);
      expect(y).toBeLessThanOrEqual(vy + vh + tolerance);
    }
  });
});

/** SVG large-arc-flags off every `A` command in a path, in order — see `pathFromArc`/
 * `pathFromArcLongWay` in ceruti-paths.ts for what the flag means here. */
function largeArcFlags(d: string): number[] {
  return [...d.matchAll(/A\s+[\d.eE+-]+\s+[\d.eE+-]+\s+0\s+(\d)\s+\d/g)].map(m => Number(m[1]));
}

describe('the f-hole cutting template with no eyes', () => {
  it('closes both eyes with the short arc instead of drawing their long rim', async () => {
    const p = placed(defaultViolin());
    const withEyes = await captured(() => makePanel(p).downloadExport('fholeTemplate'));
    const withoutEyes = await captured(() => makePanel(p).downloadExport('fholeTemplateNoEyes'));

    const doc = new DOMParser().parseFromString(withoutEyes!.text, 'image/svg+xml');
    const paths = [...doc.querySelectorAll('path')];
    expect(paths).toHaveLength(1);
    expect(paths[0].getAttribute('d')?.match(/M/g)).toHaveLength(1);

    // The eyed template has exactly two long-way arcs (upper and lower eye); the
    // no-eyes template uses the short way for every arc, itself included.
    const eyedD = withEyes!.text.match(/d="([^"]+)"/)![1];
    const noEyesD = paths[0].getAttribute('d')!;
    expect(largeArcFlags(eyedD).filter(f => f === 1)).toHaveLength(2);
    expect(largeArcFlags(noEyesD).filter(f => f === 1)).toHaveLength(0);
  });
});

describe('the SVG a download writes', () => {
  it.each(PLAIN_EXPORTS)('%s is a parseable sheet named after the recipe', async type => {
    const result = await captured(() => makePanel(moulded()).downloadExport(type));
    expect(result).not.toBeNull();
    expect(result!.name).toBe(`test-violin-${type}.svg`);

    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('sizes an arching sheet to its own blanks, not to the plan', async () => {
    // Templates are laid out in their own frame, so a sheet sized from the
    // violin's plan dimensions would crop them.
    const result = await captured(() => makePanel(archedViolin()).downloadExport('crossArchTemplates'));
    const viewBox = result!.text.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(viewBox[2]).toBeGreaterThan(0);
    expect(viewBox[3]).toBeGreaterThan(0);
    expect(result!.text).toContain('<text');
  });

  it('writes nothing at all for an arching export with no arching', async () => {
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('crossArchTemplates'))).toBeNull();
  });
});

describe('the neck template', () => {
  const scrolled = () => {
    const p = archedViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
    calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
    p.scroll = defaultVoluteParams(p);
    return p;
  };

  it('writes a sheet sized to the neck and scroll, the stencil inside the outline', async () => {
    const result = await captured(() => makePanel(scrolled()).downloadExport('neckTemplate'));
    expect(result!.name).toBe('test-violin-neckTemplate.svg');
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path')).toHaveLength(2);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const viewBox = result!.text.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    // taller than the body's neck end to the scroll's top, and narrower than the plan
    expect(viewBox[3]).toBeGreaterThan(200);
    expect(viewBox[2]).toBeLessThan(100);
  });

  it('refuses rather than throwing without a neck or a scroll', async () => {
    expect(await captured(() => makePanel(archedViolin()).downloadExport('neckTemplate'))).toBeNull();
    const panel = makePanel(archedViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));
    panel.previewExport('neckTemplate');
    expect(emitted).toEqual([[]]);
  });

  it('previews the outline and the stencil as two layers', () => {
    const panel = makePanel(scrolled());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));
    panel.previewExport('neckTemplate');
    expect(emitted[0]).toHaveLength(2);
    expect(recordLayers(emitted[0]).paths.join('')).not.toMatch(/NaN|Infinity/);
  });
});

describe('the scroll back strip', () => {
  const scrolled = () => {
    const p = defaultViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    p.scroll = defaultVoluteParams(p);
    return p;
  };
  // the neck template wants the neck set against the arch too
  const necked = () => {
    const p = archedViolin();
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
    calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
    p.scroll = defaultVoluteParams(p);
    return p;
  };

  it('writes a sheet as long and wide as the strip, the outline alone', async () => {
    const p = scrolled();
    const result = await captured(() => makePanel(p).downloadExport('scrollBack'));
    expect(result!.name).toBe('test-violin-scrollBack.svg');
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const strip = scrollBackStrip(p);
    const viewBox = result!.text.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(viewBox[3]).toBeGreaterThan(strip.length);
    expect(viewBox[2] / 2).toBeGreaterThan(Math.max(...strip.outline.map(pt => pt.x)));
  });

  it('writes the compass walk as a box holding the marks, the centres and the edges, every circle inside the box, each centre a star of three lines, no text', async () => {
    const p = scrolled();
    const result = await captured(() => makePanel(p).downloadExport('scrollCompass'));
    expect(result!.name).toBe('test-violin-scrollCompass.svg');
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const paths = [...doc.querySelectorAll('path')].map(el => el.getAttribute('d')!);
    expect(paths).toHaveLength(4);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    // an arc's radii and flags read as points otherwise; only its end is wanted
    const points = (d: string) => [...d.replace(/A \S+ \S+ \S+ \S+ \S+ /g, '').matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => ({ x: +m[1], y: +m[2] }));
    const [box, marks] = paths.map(points);
    const xs = box.map(pt => pt.x), ys = box.map(pt => pt.y);
    for (const pt of marks) {
      expect(pt.x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(pt.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(pt.y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(pt.y).toBeLessThanOrEqual(Math.max(...ys));
    }
    const walk = scrollCompassWalk(p);
    const first = walk.stations[0];
    // three lines through each station's centre, each spanning it
    const stars = points(paths[2]);
    expect(stars).toHaveLength(6 * walk.stations.length);
    for (let k = 0; k < stars.length; k += 2) {
      expect(stars[k].x + stars[k + 1].x).toBeCloseTo(0, 9);
      expect(Math.hypot(stars[k].x - stars[k + 1].x, stars[k].y - stars[k + 1].y)).toBeCloseTo(2, 9);
    }
    // the duck tail's circle clears the box's bottom, and the last station's half circle its top
    expect(Math.min(...marks.filter(pt => Math.abs(pt.x) > 1e-9).map(pt => pt.y))).toBeGreaterThan(Math.min(...ys) + 2);
    expect(Math.max(...marks.map(pt => pt.y)) - Math.max(...xs)).toBeLessThan(Math.max(...ys));
    expect(first.half).toBeGreaterThan(0);
  });

  it.each(['scrollFrontView', 'scrollBackView'] as const)('%s writes the view as one path on a sheet that starts at its foot, no text', async type => {
    const result = await captured(() => makePanel(scrolled()).downloadExport(type));
    expect(result!.name).toBe(`test-violin-${type}.svg`);
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const ys = [...doc.querySelector('path')!.getAttribute('d')!.replace(/A \S+ \S+ \S+ \S+ \S+ /g, '').matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => +m[2]);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    const viewBox = result!.text.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
    expect(viewBox[3]).toBeGreaterThan(Math.max(...ys));
  });

  it('writes the side profile centred on a sheet that starts at its foot, no text', async () => {
    const result = await captured(() => makePanel(scrolled()).downloadExport('scrollSide'));
    expect(result!.name).toBe('test-violin-scrollSide.svg');
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const b = pathsBounds([doc.querySelector('path')!.getAttribute('d')!]);
    expect(b.minY).toBeCloseTo(0, 1);
    expect(b.minX + b.maxX).toBeCloseTo(0, 1);
  });

  it('leaves the pegbox\'s front off the back view sheet', async () => {
    const p = scrolled();
    p.scroll!.widths.hip = 46;
    p.neck!.nutWidth = 42;
    p.neck!.topWidth = 33;
    p.scroll!.hipHeight = -p.neck!.nutHeight;
    const xs = async (type: 'scrollFrontView' | 'scrollBackView') => {
      const result = await captured(() => makePanel(p).downloadExport(type));
      const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
      return [...doc.querySelector('path')!.getAttribute('d')!.replace(/A \S+ \S+ \S+ \S+ \S+ /g, '').matchAll(/(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)/g)].map(m => Math.abs(+m[1]));
    };
    // the cheeks stand 23 out from the centreline, wider than anything of the back's own
    expect((await xs('scrollFrontView')).some(x => Math.abs(x - 23) < 1e-6)).toBe(true);
    expect((await xs('scrollBackView')).some(x => Math.abs(x - 23) < 1e-6)).toBe(false);
  });

  it.each(['neckTemplate', 'scrollSide', 'scrollFrontView', 'scrollBackView', 'scrollBack', 'scrollCompass'] as const)('%s writes a complete DXF in millimetres', async type => {
    const result = await captured(() => makePanel(type === 'neckTemplate' ? necked() : scrolled()).downloadDxf(type));
    expect(result!.name).toBe(`test-violin-${type}.dxf`);
    expect(result!.text).toContain('ENTITIES');
    expect(result!.text.trimEnd().endsWith('EOF')).toBe(true);
    expect(result!.text).toMatch(/\$INSUNITS\n\s*70\n4/);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('refuses rather than throwing without a scroll, in any format', async () => {
    for (const type of ['scrollSide', 'scrollBack', 'scrollCompass', 'scrollFrontView', 'scrollBackView'] as const) {
      expect(await captured(() => makePanel(defaultViolin()).downloadDxf(type))).toBeNull();
      expect(await captured(() => makePanel(defaultViolin()).downloadPdf(type))).toBeNull();
    }
    expect(await captured(() => makePanel(archedViolin()).downloadDxf('neckTemplate'))).toBeNull();
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('scrollBack'))).toBeNull();
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('scrollCompass'))).toBeNull();
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('scrollFrontView'))).toBeNull();
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('scrollBackView'))).toBeNull();
    expect(await captured(() => makePanel(defaultViolin()).downloadExport('scrollSide'))).toBeNull();
    const panel = makePanel(defaultViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));
    panel.previewExport('scrollBack');
    expect(emitted).toEqual([[]]);
  });
});

describe('the DXF a download writes', () => {
  it.each(PLAIN_EXPORTS)('%s is a complete drawing in millimetres', async type => {
    const result = await captured(() => makePanel(moulded()).downloadDxf(type));
    expect(result!.name).toBe(`test-violin-${type}.dxf`);
    expect(result!.text).toContain('ENTITIES');
    expect(result!.text.trimEnd().endsWith('EOF')).toBe(true);
    expect(result!.text).toMatch(/\$INSUNITS\n\s*70\n4/);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps the outline as true arcs rather than flattening it', () => {
    // The plan-view outline is arcs almost end to end. A DXF of it that carried
    // only LINEs would cut a faceted edge.
    const panel = makePanel(defaultViolin());
    panel.ngOnInit();
    return captured(() => panel.downloadDxf('outerTrace')).then(result => {
      const arcs = result!.text.split('\n').filter((l, i, all) => l === 'ARC' && all[i - 1] === '0');
      expect(arcs.length).toBeGreaterThan(0);
    });
  });

  it('carries the blank labels through to the DXF as TEXT', async () => {
    const result = await captured(() => makePanel(archedViolin()).downloadDxf('crossArchTemplates'));
    expect(result!.text).toContain('TEXT');
  });

  it('writes nothing for an arching export with no arching', async () => {
    expect(await captured(() => makePanel(defaultViolin()).downloadDxf('crossArchTemplates'))).toBeNull();
  });
});

describe('the STL a download writes', () => {
  // Meshing a plate at a 0.5mm grid is genuinely slow — the pair runs ~6s, over
  // vitest's 5s default. Same situation as the taper test in
  // ceruti-arch-geometry.spec.ts, and handled the same way rather than by
  // coarsening the grid, which would stop testing what ships.
  it('refuses rather than throwing on a plate with no arching', async () => {
    expect(await captured(() => makePanel(defaultViolin()).downloadStl('top'))).toBeNull();
  });
});

describe('the bundled SVGs', () => {
  // every stage reached: arched, the neck set and the scroll started, the mould seeding the blocks
  const finished = () => {
    const p = archedViolin();
    calculateMould(p, false, false);
    p.neck = defaultNeckParams(p);
    p.stringSetup = defaultStringSetup(p);
    const gouge = (p.arching!.top.fluting ??= defaultFlutingParams(p));
    calculateNeck(p, solveLongArch(p, p.arching!.top.arch, gouge), gouge);
    p.scroll = defaultVoluteParams(p);
    return p;
  };
  const groups = (text: string) => text.match(/<g transform="translate\(/g)?.length ?? 0;

  it('packs the templates onto one sheet, like templates kept together', async () => {
    const result = await captured(() => makePanel(finished()).downloadBundle('templates'));
    expect(result!.name).toBe('test-violin-templates.svg');
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    // every cross-arch blank of both plates in the one piece, and the long arch's pair in another
    const pieceOf = (label: RegExp) => new Set([...doc.querySelectorAll('text')].filter(t => label.test(t.textContent!)).map(t => t.parentElement));
    expect(pieceOf(/^(Top|Back) (LB|LC|C|UC|UB) /).size).toBe(1);
    expect(pieceOf(/ Long$/).size).toBe(1);
    expect(pieceOf(/ Long$/)).not.toEqual(pieceOf(/^(Top|Back) LB /));
  });

  it('packs more into the full sheet than the templates alone', async () => {
    const templates = await captured(() => makePanel(finished()).downloadBundle('templates'));
    const full = await captured(() => makePanel(finished()).downloadBundle('full'));
    expect(full!.name).toBe('test-violin-full.svg');
    expect(new DOMParser().parseFromString(full!.text, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    expect(groups(full!.text)).toBeGreaterThan(groups(templates!.text));
  });

  it('writes no templates sheet for an instrument with none to cut', async () => {
    expect(await captured(() => makePanel(outlined()).downloadBundle('templates'))).toBeNull();
  });
});

describe('the largest bundled instrument exports', () => {
  it('stradivari-cello-castelbarco writes a parseable outer-trace sheet', async () => {
    // The sheet is sized off the body — this is the only check that the export
    // path holds at cello size.
    const result = await captured(() => makePanel(templateViolin('stradivari-cello-castelbarco')).downloadExport('outerTrace'));
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });
});
