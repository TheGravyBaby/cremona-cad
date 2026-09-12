import { recordLayers } from '../../../helpers/layer-recorder';
import { archedViolin, defaultViolin, templateKeys, templateViolin } from '../../ceruti-fixtures';
import { CerutiColors, EnricoCerutiParams, PathEntry } from '../../ceruti-types';
import { ExportPanel } from './export-panel';

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

const colors = new Proxy({}, { get: () => '#888888' }) as CerutiColors;

/** The eight export buttons, and which of them need an arched plate. */
const PLAIN_EXPORTS = ['innerTrace', 'outerTrace', 'back', 'mould', 'blocks'] as const;
const ARCHING_EXPORTS = ['crossArchTemplates', 'longArchTemplates'] as const;

function makePanel(p: EnricoCerutiParams, fileName = 'test-violin'): ExportPanel {
  const panel = new ExportPanel();
  panel.params = p;
  panel.colors = colors;
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
  it.each(PLAIN_EXPORTS)('%s draws something on the canvas', type => {
    const panel = makePanel(defaultViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));

    panel.previewExport(type);

    const drawn = recordLayers(emitted[0]);
    expect(drawn.elements.length).toBeGreaterThan(0);
    expect(drawn.paths.join('')).not.toMatch(/NaN|Infinity/);
  });

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

  it.each(ARCHING_EXPORTS)('%s clears the canvas rather than throwing with no arching', type => {
    // Reachable: the export step unlocks off the outline, so a recipe can arrive
    // here with no plate at all. The panel warns and draws nothing.
    const panel = makePanel(defaultViolin());
    const emitted: any[] = [];
    panel.draftChange.subscribe(layers => emitted.push(layers));

    expect(() => panel.previewExport(type)).not.toThrow();
    expect(emitted[0]).toEqual([]);
  });
});

describe('f-holes on the top plate only', () => {
  it('seeds placement and draws both mirrored holes when previewing the outer trace', () => {
    const panel = makePanel(defaultViolin());
    panel.previewExport('outerTrace');

    expect(panel.params.fHoles).toBeDefined();
    // two separate closed loops in the cached path — one hole per side, not just the treble side
    expect(panel.paths.find(e => e.key === 'fHole')?.path.match(/M/g)).toHaveLength(2);
  });

  it('leaves f-hole placement and the path cache untouched when previewing the back trace', () => {
    const panel = makePanel(defaultViolin());
    panel.previewExport('back');

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
    const p = defaultViolin();
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
    const result = await captured(() => makePanel(archedViolin()).downloadExport('fholeTemplate'));
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

describe('the SVG a download writes', () => {
  it.each(PLAIN_EXPORTS)('%s is a parseable sheet named after the recipe', async type => {
    const result = await captured(() => makePanel(defaultViolin()).downloadExport(type));
    expect(result).not.toBeNull();
    expect(result!.name).toBe(`test-violin-${type}.svg`);

    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('falls back to a default name when the recipe is unnamed', async () => {
    const result = await captured(() => makePanel(defaultViolin(), '   ').downloadExport('outerTrace'));
    expect(result!.name).toBe('ceruti-violin-outerTrace.svg');
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

describe('the DXF a download writes', () => {
  it.each(PLAIN_EXPORTS)('%s is a complete drawing in millimetres', async type => {
    const result = await captured(() => makePanel(defaultViolin()).downloadDxf(type));
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
  it('is a binary plate model for each side', async () => {
    for (const side of ['top', 'bottom'] as const) {
      const result = await captured(() => makePanel(archedViolin()).downloadStl(side));
      expect(result, `${side} wrote nothing`).not.toBeNull();
      expect(result!.name).toBe(`test-violin-${side === 'top' ? 'top' : 'back'}-plate.stl`);
      expect(result!.text.length).toBeGreaterThan(84); // header + triangle count
    }
  }, 30000);

  it('refuses rather than throwing on a plate with no arching', async () => {
    expect(await captured(() => makePanel(defaultViolin()).downloadStl('top'))).toBeNull();
  });
});

describe('every bundled instrument exports', () => {
  it.each(templateKeys())('%s writes a parseable outer-trace sheet', async key => {
    // The templates run from violin to double bass, and the sheet is sized off
    // the body — this is the only check that the export path holds at 1110mm.
    const result = await captured(() => makePanel(templateViolin(key)).downloadExport('outerTrace'));
    const doc = new DOMParser().parseFromString(result!.text, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(result!.text).not.toMatch(/NaN|Infinity|undefined/);
  });
});
