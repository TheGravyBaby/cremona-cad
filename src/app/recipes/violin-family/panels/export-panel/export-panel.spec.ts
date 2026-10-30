import { describe, expect, it, vi } from 'vitest';
import { recordLayers } from '../../../../helpers/layer-recorder';
import { pathsBounds } from '../../../../helpers/math/pathMath';
import { nightTheme } from '../../../../theme/theme-fixtures';
import { ThemeService } from '../../../../theme/theme.service';
import { ViolinFamilyParams } from '../../violin-family-types';
import { DEFAULT_VIOLIN_FAMILY_PARAMS } from '../../violin-family-seed';
import { MainBoutsPanel } from '../main-bouts-panel/main-bouts-panel';
import { CornersPanel } from '../corners-panel/corners-panel';
import { PlateContourPanel } from '../plate-contour-panel/plate-contour-panel';
import { FlutingPanel } from '../fluting-panel/fluting-panel';
import { FHolePlacementPanel } from '../fhole-placement-panel/fhole-placement-panel';
import { FHoleContoursPanel } from '../fhole-contours-panel/fhole-contours-panel';
import { LongArchingPanel } from '../long-arching-panel/long-arching-panel';
import { NeckPanel } from '../neck-panel/neck-panel';
import { VolutePanel } from '../volute-panel/volute-panel';
import { solveStringSetup, StringSetupPanel } from '../string-setup-panel/string-setup-panel';
import { neckHalfWidthAt } from '../neck-panel/neck-panel';
import { MouldPanel } from '../mould-panel/mould-panel';
import { solveScroll } from '../scroll-panel/scroll-panel';
import { scrollBackStrip, scrollCompassWalk } from '../scroll-widths-panel/scroll-widths-panel';
import { solveCrossArching } from '../cross-arching-panel/cross-arching-panel';
import { solvePositionMarks } from '../dev-fingerboard-panel/dev-fingerboard-panel';
import { ExportPanel, ExportType, exportReady, exportSheet, fingerboardStl, plateStl } from './export-panel';

// The last panel, and the one whose output leaves the app: a wrong path on a sheet is cut into wood.
// What matters here is that a sheet is offered only once the stages it is drawn from exist, that a
// sheet that can't be built writes nothing rather than an empty or broken file, and that every sheet
// lands inside the frame it is sized to.

const theme = nightTheme();

const PLAIN_EXPORTS = ['innerContour', 'topPlate', 'backPlate', 'mould', 'blocks'] as const;
const ARCHING_EXPORTS = ['crossArchTemplates', 'longArchTemplates'] as const;
const SCROLL_EXPORTS = ['scrollSide', 'scrollFrontView', 'scrollBackView', 'scrollBack', 'scrollCompass'] as const;

const blank = (): ViolinFamilyParams => JSON.parse(JSON.stringify(DEFAULT_VIOLIN_FAMILY_PARAMS));

// the rib outline drafted and nothing past it, as a blank instrument leaves it on reaching Export
const outlined = (): ViolinFamilyParams => {
  const p = blank();
  MainBoutsPanel.seed(p);
  CornersPanel.seed(p);
  return p;
};
const plated = (): ViolinFamilyParams => {
  const p = outlined();
  PlateContourPanel.seed(p);
  return p;
};
const holed = (): ViolinFamilyParams => {
  const p = plated();
  FlutingPanel.seed(p);
  FHolePlacementPanel.seed(p);
  FHoleContoursPanel.seed(p);
  return p;
};
const arched = (): ViolinFamilyParams => {
  const p = holed();
  LongArchingPanel.seed(p);
  return p;
};
const scrolled = (): ViolinFamilyParams => {
  const p = arched();
  NeckPanel.seed(p);
  VolutePanel.seed(p);
  return p;
};
const strung = (): ViolinFamilyParams => {
  const p = scrolled();
  StringSetupPanel.seed(p);
  return p;
};
const finished = (): ViolinFamilyParams => {
  const p = strung();
  MouldPanel.seed(p);
  return p;
};

function makePanel(p: ViolinFamilyParams, fileName = 'test-violin'): ExportPanel {
  ThemeService.useTheme(theme);
  const panel = new ExportPanel();
  panel.params = p;
  panel.fileName = fileName;
  return panel;
}

function previewed(panel: ExportPanel, type?: ExportType): any[] {
  const emitted: any[] = [];
  panel.drawn.subscribe(layers => emitted.push(layers));
  if (type) panel.show(type);
  else panel.ngOnInit();
  return emitted;
}

// captures a download without navigating, returning the file's name and text
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

// the sheet without its size box, so the counts and bounds below are the content's
function parseSheet(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  doc.getElementById('size-box')?.remove();
  return doc;
}
const sheetPaths = (doc: Document) => [...doc.querySelectorAll('path')].map(el => el.getAttribute('d')!);
const viewBox = (text: string) => text.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
// the points a path's commands end on: the last pair of each, so an arc's radii and flags don't read as points
const endpoints = (d: string) => (d.replace(/Z/g, '').match(/[MLACQ][^MLACQ]*/g) ?? []).map(seg => {
  const n = seg.slice(1).trim().split(/[\s,]+/).map(Number);
  return { x: n[n.length - 2], y: n[n.length - 1] };
});

describe('the export panel on opening', () => {
  it('never writes to the params, previewing or downloading', async () => {
    const p = finished();
    const snapshot = JSON.stringify(p);
    const panel = makePanel(p);
    panel.ngOnInit();
    for (const type of [...PLAIN_EXPORTS, ...ARCHING_EXPORTS, 'fholeTemplate', 'neckTemplate', ...SCROLL_EXPORTS] as const) {
      panel.show(type);
      await captured(() => panel.download(type, 'svg'));
      await captured(() => panel.download(type, 'dxf'));
    }
    await captured(() => panel.downloadBundle('full'));
    expect(JSON.stringify(p)).toBe(snapshot);
    // every export rendered twice and bundled: about five seconds under the full suite's load
  }, 20000);

  it('previews the top plate once the plates are drafted, and the inner contour on a bare outline', () => {
    const panel = makePanel(plated());
    const emitted = previewed(panel);
    expect(panel.preview).toBe('topPlate');
    expect(emitted).toHaveLength(1);
    expect(recordLayers(emitted[0]).elements.length).toBeGreaterThan(0);

    const bare = makePanel(outlined());
    previewed(bare);
    expect(bare.preview).toBe('innerContour');
  });

  it('offers a bare outline its inner contour and nothing it would have to invent', () => {
    expect([...exportReady(outlined())]).toEqual(['innerContour']);
  });

  it('offers every sheet once every stage is reached', () => {
    const ready = exportReady(finished());
    for (const type of [...PLAIN_EXPORTS, ...ARCHING_EXPORTS, 'fholeTemplate', 'fholeTemplateArched', 'neckTemplate', ...SCROLL_EXPORTS, 'stlTop', 'stlBack', 'stlFingerboard'] as const) {
      expect(ready.has(type), type).toBe(true);
    }
    expect(ready.has('fholeTemplateNoEyes')).toBe(false);
  });
});

describe('previewing a sheet', () => {
  it.each(ARCHING_EXPORTS)('%s draws the blanks, each labelled, once the plate is arched', type => {
    const drawn = recordLayers(previewed(makePanel(arched()), type)[0]);
    expect(drawn.paths.length).toBeGreaterThan(0);
    // an unlabelled sheet of templates is unusable: the blanks are only told apart by where they were cut
    expect(drawn.countByTag['text'] ?? 0).toBeGreaterThan(0);
  });

  it('develops the arched f-hole template over the top arch: the flat hole stretched, never shrunk, by less than the arch rises', () => {
    expect(exportSheet(holed(), 'fholeTemplateArched')).toBeNull();
    const hole = (p: ViolinFamilyParams, type: ExportType) => pathsBounds(exportSheet(p, type)!.paths.filter(path => path.laser === 'cut1').map(path => path.d));
    const flat = hole(arched(), 'fholeTemplate');
    const developed = hole(arched(), 'fholeTemplateArched');
    expect(developed.width).toBeGreaterThan(flat.width);
    expect(developed.height).toBeGreaterThan(flat.height);
    expect(developed.width - flat.width).toBeLessThan(5);
    expect(developed.height - flat.height).toBeLessThan(5);
    // on its own sheet like the flat one: centred, up from the blank's bottom margin
    expect(developed.minX + developed.maxX).toBeCloseTo(0, 6);
    expect(developed.minY).toBeGreaterThan(0);
  });

  it('falls back to the first sheet it can draw when asked for one whose stage was never reached', () => {
    expect(exportSheet(plated(), 'crossArchTemplates')).toBeNull();
    expect(exportSheet(plated(), 'neckTemplate')).toBeNull();
    const panel = makePanel(plated());
    const emitted = previewed(panel, 'neckTemplate');
    expect(panel.preview).toBe('topPlate');
    expect(recordLayers(emitted[0]).elements.length).toBeGreaterThan(0);
  });

  it('previews the neck template as the outline and the stencil, two layers', () => {
    const emitted = previewed(makePanel(scrolled()), 'neckTemplate');
    expect(emitted[0]).toHaveLength(2);
    expect(recordLayers(emitted[0]).paths.join('')).not.toMatch(/NaN|Infinity/);
  });
});

describe('a sheet whose stage was never reached', () => {
  it('writes nothing, in any format', async () => {
    const panel = makePanel(outlined());
    for (const type of ['topPlate', 'backPlate', 'fholeTemplate', 'fholeTemplateArched', 'mould', 'blocks', 'crossArchTemplates', 'neckTemplate', ...SCROLL_EXPORTS] as const) {
      for (const format of ['svg', 'pdf', 'dxf'] as const) expect(await captured(() => panel.download(type, format)), `${type} ${format}`).toBeNull();
    }
    expect(await captured(() => panel.downloadStl('top'))).toBeNull();
    expect(await captured(() => panel.downloadFingerboardStl())).toBeNull();
    expect(await captured(() => panel.downloadBundle('templates'))).toBeNull();
  });

  it('writes the inner contour on a sheet with no button to make room for', async () => {
    const result = await captured(() => makePanel(outlined()).download('innerContour', 'svg'));
    expect(result).not.toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('the plate sheets', () => {
  it('cut both holes out of the top plate once they are drawn, and none before', () => {
    const holes = exportSheet(holed(), 'topPlate')!.paths.filter(path => path.laser === 'cut1');
    expect(holes).toHaveLength(2);
    for (const hole of holes) expect(hole.d.match(/M/g)).toHaveLength(1);
    expect(exportSheet(plated(), 'topPlate')!.paths.some(path => path.laser === 'cut1')).toBe(false);
    expect(exportSheet(holed(), 'backPlate')!.paths.some(path => path.laser === 'cut1')).toBe(false);
  });

  it('etch the purfling rather than cutting it', () => {
    const sheet = exportSheet(plated(), 'backPlate')!;
    expect(sheet.paths.filter(path => path.laser === 'etch')).toHaveLength(2);
  });
});

describe('the f-hole cutting template', () => {
  it('draws exactly one unmirrored hole in a blank, sized to its own bounds rather than the plan', async () => {
    const p = holed();
    const result = await captured(() => makePanel(p).download('fholeTemplate', 'svg'));
    const doc = parseSheet(result!.text);
    const paths = sheetPaths(doc);
    // the blank and the hole, each its own path so the laser can cut the hole first
    expect(paths).toHaveLength(2);
    for (const d of paths) expect(d.match(/M/g)).toHaveLength(1);
    expect(viewBox(result!.text)[2]).toBeLessThan(p.body.width);
  });

  it('lands inside the sheet it is sized to, not off at the hole\'s real plate position', async () => {
    const result = await captured(() => makePanel(holed()).download('fholeTemplate', 'svg'));
    const doc = parseSheet(result!.text);
    const [vx, vy, vw, vh] = viewBox(result!.text);
    const [tx, ty] = doc.querySelector('svg > g')!.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)\)/)!.slice(1).map(Number);
    const tolerance = 1;
    for (const pt of endpoints(sheetPaths(doc).join(' '))) {
      const x = pt.x + tx;
      const y = ty - pt.y;
      expect(x).toBeGreaterThanOrEqual(vx - tolerance);
      expect(x).toBeLessThanOrEqual(vx + vw + tolerance);
      expect(y).toBeGreaterThanOrEqual(vy - tolerance);
      expect(y).toBeLessThanOrEqual(vy + vh + tolerance);
    }
  });

  it('labels only the arched f-hole template, in its blank\'s bottom right corner clear of the hole', () => {
    expect(exportSheet(finished(), 'fholeTemplate')!.texts).toEqual([]);
    const sheet = exportSheet(finished(), 'fholeTemplateArched')!;
    expect(sheet.texts.map(t => t.text)).toEqual(['Arched']);
    const blank = pathsBounds([sheet.paths[0].d]);
    const hole = pathsBounds([sheet.paths[1].d]);
    const { x, y } = sheet.texts[0];
    expect(x).toBeGreaterThan((blank.minX + blank.maxX) / 2);
    expect(x).toBeLessThan(blank.maxX);
    expect(y).toBeGreaterThan(blank.minY);
    expect(y).toBeLessThan(hole.minY);
  });

  it('closes both eyes with the short arc instead of drawing their long rim when asked for no eyes', () => {
    const flags = (d: string) => [...d.matchAll(/A\s+[\d.eE+-]+\s+[\d.eE+-]+\s+0\s+(\d)\s+\d/g)].map(m => Number(m[1]));
    const eyed = exportSheet(holed(), 'fholeTemplate')!.paths.map(path => path.d).join(' ');
    const noEyes = exportSheet(holed(), 'fholeTemplateNoEyes')!.paths.map(path => path.d).join(' ');
    expect(flags(eyed).filter(f => f === 1)).toHaveLength(2);
    expect(flags(noEyes).filter(f => f === 1)).toHaveLength(0);
  });

  it('leaves the stem runs straight when the placement has its notches off', () => {
    const corners = (p: ViolinFamilyParams) => (exportSheet(p, 'fholeTemplate')!.paths.map(path => path.d).join(' ').match(/L/g) ?? []).length;
    const plain = holed();
    plain.fHoles!.notches = false;
    expect(corners(holed())).toBeGreaterThan(corners(plain));
  });
});

describe('the mould sheets', () => {
  it('mark the upper blocks U and the lower blocks L, the corner pairs included', async () => {
    const result = await captured(() => makePanel(finished()).download('blocks', 'svg'));
    const labels = [...parseSheet(result!.text).querySelectorAll('text')].map(t => t.textContent);
    expect(labels.sort()).toEqual(['L', 'L', 'L', 'U', 'U', 'U']);
  });

  it('cut the mould with its clamp windows, one path, on the plan\'s sheet', async () => {
    const p = finished();
    const result = await captured(() => makePanel(p).download('mould', 'svg'));
    const doc = parseSheet(result!.text);
    expect(sheetPaths(doc)).toHaveLength(1);
    expect(sheetPaths(doc)[0].match(/M/g)!.length).toBe(4);
    expect(viewBox(result!.text)[2]).toBeGreaterThanOrEqual(p.body.width);
  });
});

describe('the SVG a download writes', () => {
  it.each(PLAIN_EXPORTS)('%s is a parseable sheet named after the recipe', async type => {
    const result = await captured(() => makePanel(finished()).download(type, 'svg'));
    expect(result).not.toBeNull();
    expect(result!.name).toBe(`test-violin-${type}.svg`);
    const doc = parseSheet(result!.text);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('names the file after the instrument, or the recipe when it has no name', async () => {
    expect((await captured(() => makePanel(plated(), '  ').download('topPlate', 'svg')))!.name).toBe('violin-family-topPlate.svg');
  });

  it('sizes an arching sheet to its own blanks, not to the plan', async () => {
    const result = await captured(() => makePanel(arched()).download('crossArchTemplates', 'svg'));
    const [, , w, h] = viewBox(result!.text);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(result!.text).toContain('<text');
  });
});

describe('the neck and scroll sheets', () => {
  it('write the neck template sized to the neck and scroll, the stencil inside the outline', async () => {
    const result = await captured(() => makePanel(scrolled()).download('neckTemplate', 'svg'));
    expect(result!.name).toBe('test-violin-neckTemplate.svg');
    const doc = parseSheet(result!.text);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path')).toHaveLength(2);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const [, , w, h] = viewBox(result!.text);
    // taller than the body's neck end to the scroll's top, and narrower than the plan
    expect(h).toBeGreaterThan(200);
    expect(w).toBeLessThan(120);
    const [outline, stencil] = sheetPaths(doc).map(d => pathsBounds([d]));
    expect(stencil.minX).toBeGreaterThan(outline.minX);
    expect(stencil.maxX).toBeLessThan(outline.maxX);
    expect(stencil.maxY).toBeLessThan(outline.maxY);
  });

  it('write the back strip as long and wide as the strip, the outline alone', async () => {
    const p = scrolled();
    const result = await captured(() => makePanel(p).download('scrollBack', 'svg'));
    expect(result!.name).toBe('test-violin-scrollBack.svg');
    const doc = parseSheet(result!.text);
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const strip = scrollBackStrip(p, solveScroll(p)!);
    const [, , w, h] = viewBox(result!.text);
    expect(h).toBeGreaterThan(strip.length);
    expect(w / 2).toBeGreaterThan(Math.max(...strip.outline.map(pt => pt.x)));
  });

  it('write the compass walk as a box holding the marks, the centres and the edges, every circle inside the box, each centre a star of three lines', async () => {
    const p = scrolled();
    const result = await captured(() => makePanel(p).download('scrollCompass', 'svg'));
    const doc = parseSheet(result!.text);
    const paths = sheetPaths(doc);
    expect(paths).toHaveLength(4);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    const [box, marks] = paths.map(endpoints);
    const xs = box.map(pt => pt.x), ys = box.map(pt => pt.y);
    for (const pt of marks) {
      expect(pt.x).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(pt.x).toBeLessThanOrEqual(Math.max(...xs));
      expect(pt.y).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(pt.y).toBeLessThanOrEqual(Math.max(...ys));
    }
    const walk = scrollCompassWalk(p, solveScroll(p)!);
    const stars = endpoints(paths[2]);
    expect(stars).toHaveLength(6 * walk.stations.length);
    for (let k = 0; k < stars.length; k += 2) {
      expect(stars[k].x + stars[k + 1].x).toBeCloseTo(0, 9);
      expect(Math.hypot(stars[k].x - stars[k + 1].x, stars[k].y - stars[k + 1].y)).toBeCloseTo(2, 9);
    }
    // the duck tail's circle clears the box's bottom
    expect(Math.min(...marks.filter(pt => Math.abs(pt.x) > 1e-9).map(pt => pt.y))).toBeGreaterThan(Math.min(...ys) + 2);
  });

  it.each(['scrollFrontView', 'scrollBackView'] as const)('write the %s as one path on a sheet that starts at its foot', async type => {
    const result = await captured(() => makePanel(scrolled()).download(type, 'svg'));
    expect(result!.name).toBe(`test-violin-${type}.svg`);
    const doc = parseSheet(result!.text);
    expect(doc.querySelectorAll('path')).toHaveLength(1);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    const ys = endpoints(sheetPaths(doc)[0]).map(pt => pt.y);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(viewBox(result!.text)[3]).toBeGreaterThan(Math.max(...ys));
  });

  it('write the side profile centred on a sheet that starts at its foot', async () => {
    const result = await captured(() => makePanel(scrolled()).download('scrollSide', 'svg'));
    const doc = parseSheet(result!.text);
    expect(doc.querySelectorAll('text')).toHaveLength(0);
    const b = pathsBounds(sheetPaths(doc));
    expect(b.minY).toBeCloseTo(0, 1);
    expect(b.minX + b.maxX).toBeCloseTo(0, 1);
  });

  it('leave the pegbox\'s front off the back view sheet', async () => {
    const p = scrolled();
    p.scroll!.widths.hip = 46;
    p.neck!.nutWidth = 42;
    p.neck!.topWidth = 33;
    p.scroll!.hipHeight = -p.neck!.nutHeight;
    const xs = async (type: 'scrollFrontView' | 'scrollBackView') => {
      const result = await captured(() => makePanel(p).download(type, 'svg'));
      return endpoints(sheetPaths(parseSheet(result!.text))[0]).map(pt => Math.abs(pt.x));
    };
    // the cheeks stand 23 out from the centreline, wider than anything of the back's own
    expect((await xs('scrollFrontView')).some(x => Math.abs(x - 23) < 1e-6)).toBe(true);
    expect((await xs('scrollBackView')).some(x => Math.abs(x - 23) < 1e-6)).toBe(false);
  });
});

describe('the DXF a download writes', () => {
  it.each([...PLAIN_EXPORTS, 'neckTemplate', ...SCROLL_EXPORTS] as const)('%s is a complete drawing in millimetres', async type => {
    const result = await captured(() => makePanel(finished()).download(type, 'dxf'));
    expect(result!.name).toBe(`test-violin-${type}.dxf`);
    expect(result!.text).toContain('ENTITIES');
    expect(result!.text.trimEnd().endsWith('EOF')).toBe(true);
    expect(result!.text).toMatch(/\$INSUNITS\n\s*70\n4/);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps the outline as true arcs rather than flattening it', async () => {
    const result = await captured(() => makePanel(plated()).download('topPlate', 'dxf'));
    const arcs = result!.text.split('\n').filter((l, i, all) => l === 'ARC' && all[i - 1] === '0');
    expect(arcs.length).toBeGreaterThan(0);
  });

  it('carries the blank labels through as TEXT', async () => {
    const result = await captured(() => makePanel(arched()).download('crossArchTemplates', 'dxf'));
    expect(result!.text).toContain('TEXT');
  });
});

describe('the bundled SVGs', () => {
  const groups = (text: string) => text.match(/<g transform="translate\(/g)?.length ?? 0;

  it('pack the templates onto one sheet, like templates kept together', async () => {
    const result = await captured(() => makePanel(finished()).downloadBundle('templates'));
    expect(result!.name).toBe('test-violin-templates.svg');
    const doc = parseSheet(result!.text);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
    // every cross-arch blank of both plates in the one piece, and the long arch's pair in another
    const pieceOf = (label: RegExp) => new Set([...doc.querySelectorAll('text')].filter(t => label.test(t.textContent!)).map(t => t.parentElement));
    expect(pieceOf(/^(Top|Back) (LB|LC|C|UC|UB) /).size).toBe(1);
    expect(pieceOf(/ Long$/).size).toBe(1);
    expect(pieceOf(/ Long$/)).not.toEqual(pieceOf(/^(Top|Back) LB /));
  });

  it('pack more into the full sheet than the templates alone', async () => {
    const templates = await captured(() => makePanel(finished()).downloadBundle('templates'));
    const full = await captured(() => makePanel(finished()).downloadBundle('full'));
    expect(full!.name).toBe('test-violin-full.svg');
    expect(parseSheet(full!.text).querySelector('parsererror')).toBeNull();
    expect(groups(full!.text)).toBeGreaterThan(groups(templates!.text));
  });
});

// the triangles of a binary STL as flat vertex arrays, with the normal each was written with
function stlTriangles(buf: ArrayBuffer): { n: number[]; v: number[][] }[] {
  const dv = new DataView(buf);
  const count = dv.getUint32(80, true);
  const tris = [];
  for (let t = 0; t < count; t++) {
    const off = 84 + t * 50;
    const f = (k: number) => dv.getFloat32(off + k * 4, true);
    tris.push({ n: [f(0), f(1), f(2)], v: [[f(3), f(4), f(5)], [f(6), f(7), f(8)], [f(9), f(10), f(11)]] });
  }
  return tris;
}

describe('the plate solids', () => {
  it('carry the back\'s button as a flat top at the edge thickness, not a hollow ring', () => {
    const p = arched();
    const surface = solveCrossArching(p).back!;
    const button = p.plateContour!.button;
    const tris = stlTriangles(plateStl(p, surface, 'back', 2));
    // a top face lying wholly past the body's end is the button's
    const buttonTops = tris.filter(t => t.n[2] > 0.5 && t.v.every(v => v[1] > p.body.height + 1));
    expect(buttonTops.length).toBeGreaterThan(0);
    for (const t of buttonTops) for (const v of t.v) expect(v[2]).toBeCloseTo(p.arching!.back.thickness, 6);
    const reach = Math.max(...buttonTops.flatMap(t => t.v.map(v => v[1])));
    expect(reach).toBeGreaterThan(p.body.height + button.height - 4);
  });

  it('close at the outline: the top covers the plate to its edge, not a grid staircase short of it', () => {
    const p = arched();
    const surface = solveCrossArching(p).back!;
    const gridMm = 2;
    const tris = stlTriangles(plateStl(p, surface, 'back', gridMm));
    const footprint = (v: number[][]) => Math.abs((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])) / 2;
    const topArea = tris.filter(t => t.n[2] > 0).reduce((sum, t) => sum + footprint(t.v), 0);
    const baseArea = tris.filter(t => t.n[2] < 0).reduce((sum, t) => sum + footprint(t.v), 0);
    const o = surface.outline;
    const outlineArea = Math.abs(o.reduce((sum, a, k) => { const b = o[(k + 1) % o.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
    // a staircase eroded by up to a cell falls short by about half a cell round the whole edge
    const perimeter = o.reduce((sum, a, k) => { const b = o[(k + 1) % o.length]; return sum + Math.hypot(b.x - a.x, b.y - a.y); }, 0);
    expect(Math.abs(topArea - outlineArea)).toBeLessThan(perimeter * gridMm / 20);
    expect(baseArea).toBeCloseTo(topArea, 6);
  });
});

const StringSetupPanelSolve = (p: ViolinFamilyParams) => solveStringSetup(p)!;

describe('the fingerboard solid', () => {
  const footprint = (v: number[][]) => Math.abs((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])) / 2;

  it('waits for the board, and withholds itself while the scoop doesn\'t solve', () => {
    expect(fingerboardStl(scrolled())).toBeNull();
    const p = strung();
    p.stringSetup!.scoopAt = 0;
    expect(fingerboardStl(p)).toBeNull();
    expect(exportReady(p).has('stlFingerboard')).toBe(false);
    expect(exportReady(strung()).has('stlFingerboard')).toBe(true);
  });

  it('stands on a flat gluing face the board\'s trapezoid, nut on y = 0, its top covering it to the edge', () => {
    const p = strung();
    const ss = p.stringSetup!;
    const gridMm = 1;
    const tris = stlTriangles(fingerboardStl(p, gridMm)!);
    const top = tris.filter(t => t.n[2] > 0), base = tris.filter(t => t.n[2] < 0);
    for (const t of base) for (const v of t.v) expect(v[2]).toBe(0);
    const topArea = top.reduce((sum, t) => sum + footprint(t.v), 0);
    const baseArea = base.reduce((sum, t) => sum + footprint(t.v), 0);
    const s = StringSetupPanelSolve(p);
    const nutHalf = p.neck!.topWidth / 2, endHalf = neckHalfWidthAt(p, s.neck, s.fingerboardEnd!.y);
    const outlineArea = (nutHalf + endHalf) * ss.fingerboardLength;
    const perimeter = 2 * ss.fingerboardLength + 2 * nutHalf + 2 * endHalf;
    expect(Math.abs(topArea - outlineArea)).toBeLessThan(perimeter * gridMm / 20);
    expect(baseArea).toBeCloseTo(topArea, 6);
    const ys = tris.flatMap(t => t.v.map(v => v[1]));
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(ss.fingerboardLength, 6);
  });

  it('crowns higher down the middle than at the edges, scoops the bass edge deeper than the treble, and holds the edge thickness at the nut', () => {
    const p = strung();
    const ss = p.stringSetup!;
    const tris = stlTriangles(fingerboardStl(p, 1)!);
    const topVerts = tris.filter(t => t.n[2] > 0).flatMap(t => t.v);
    const t = ss.fingerboardThickness;
    const near = (v: number[], x: number, y: number) => Math.abs(v[0] - x) < 0.51 && Math.abs(v[1] - y) < 0.51;
    const zNear = (x: number, y: number) => {
      const found = topVerts.filter(v => near(v, x, y));
      expect(found.length, `vertex near ${x},${y}`).toBeGreaterThan(0);
      return found.reduce((sum, v) => sum + v[2], 0) / found.length;
    };
    const mid = ss.scoopAt;
    const s = StringSetupPanelSolve(p);
    const halfMid = neckHalfWidthAt(p, s.neck, s.fingerboardEnd!.y) * mid / ss.fingerboardLength + (p.neck!.topWidth / 2) * (1 - mid / ss.fingerboardLength);
    // the solid's frame mirrors the front view's: bass at +x
    const centre = zNear(0, mid), bass = zNear(halfMid - 1, mid), treble = zNear(-halfMid + 1, mid);
    expect(centre).toBeGreaterThan(bass);
    expect(centre).toBeGreaterThan(treble);
    expect(bass).toBeLessThan(treble);
    // every top vertex within the crown's rise above the edge thickness and the scoop below it
    for (const v of topVerts) {
      expect(v[2]).toBeLessThanOrEqual(t + 6);
      expect(v[2]).toBeGreaterThanOrEqual(t - Math.max(ss.scoopBass, ss.scoopTreble) - 1e-6);
    }
    const nutEdge = topVerts.filter(v => Math.abs(v[0] + p.neck!.topWidth / 2) < 1e-6 && v[1] < 0.51);
    expect(nutEdge.length).toBeGreaterThan(0);
    for (const v of nutEdge) expect(v[2]).toBeCloseTo(t, 2);
  });

  it('sinks each position mark as a flat pocket 2 mm under the surface at its centre, leaving the rest of the top untouched', () => {
    const p = strung();
    const s = StringSetupPanelSolve(p);
    const marks = solvePositionMarks(p, s, { semitones: [12], offset: 6, diameter: 4 }).marks;
    const gridMm = 0.5;
    const topOf = (m: typeof marks) => {
      const top = new Map<string, number>();
      for (const t of stlTriangles(fingerboardStl(p, gridMm, m)!)) if (t.n[2] > 0) for (const v of t.v) top.set(`${v[0].toFixed(3)},${v[1].toFixed(3)}`, v[2]);
      return top;
    };
    const before = topOf([]), after = topOf(marks);
    const [mark] = marks;
    const d = Math.hypot(mark.station.x - s.neck.neckTop!.x, mark.station.y - s.neck.neckTop!.y);
    // a treble-side dot in the front view lands at -x in the solid
    const r = mark.dots[0].r, cx = -mark.dots[0].x;
    expect(cx).toBeLessThan(0);
    // the surface at the centre, read off the nearest unpocketed vertex; the crown is level there
    let nearest = Infinity, centreZ = NaN;
    for (const [key, z] of before) {
      const [x, y] = key.split(',').map(Number);
      const away = Math.hypot(x - cx, y - d);
      if (away < nearest) { nearest = away; centreZ = z; }
    }
    const floor = centreZ - 2;
    let inPocket = 0;
    for (const [key, z] of after) {
      const [x, y] = key.split(',').map(Number);
      const away = Math.hypot(x - cx, y - d);
      if (away <= r - gridMm) { inPocket++; expect(z).toBeCloseTo(floor, 1); }
      else if (away > r + gridMm) expect(z).toBeCloseTo(before.get(key)!, 9);
    }
    expect(inPocket).toBeGreaterThan(0);
    // the pocket is round: its floor covers the circle's area and ends on the rim, not a grid step.
    // Read around the pocket only, since the board's edges stand near the floor's height too
    const tris = stlTriangles(fingerboardStl(p, gridMm, marks)!);
    const away = (v: number[]) => Math.hypot(v[0] - cx, v[1] - d);
    const nearby = tris.filter(t => t.v.every(v => away(v) < r + 2));
    const onFloor = (v: number[]) => Math.abs(v[2] - floor) < 0.05;
    const floorArea = nearby.filter(t => t.n[2] > 0 && t.v.every(onFloor)).reduce((sum, t) => sum + footprint(t.v), 0);
    expect(Math.abs(floorArea - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.02);
    // a half circle over the edge still builds a closed, finite solid, its rim wall stopping at the edge
    const overEdge = solvePositionMarks(p, s, { semitones: [12], offset: p.neck!.topWidth / 2, diameter: 4 }).marks;
    const edgeTris = stlTriangles(fingerboardStl(p, gridMm, overEdge)!);
    expect(edgeTris.length).toBeGreaterThan(0);
    expect(edgeTris.every(t => t.v.every(v => v.every(Number.isFinite)))).toBe(true);
    // the rim is a 48-gon, whose chords dip a few microns inside the circle
    const chordDip = r * (1 - Math.cos(Math.PI / 48));
    for (const t of nearby) for (const v of t.v) {
      if (onFloor(v)) expect(away(v)).toBeLessThanOrEqual(r + 1e-5);
      else if (v[2] > floor + 0.5) expect(away(v)).toBeGreaterThanOrEqual(r - chordDip - 1e-5);
    }
  });
});
