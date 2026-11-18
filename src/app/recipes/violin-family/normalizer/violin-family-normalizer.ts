import { compareVersions } from '../../../models/types';
import { VIOLIN_FAMILY_RECIPE_NAME, ViolinFamilyRecipe } from '../violin-family-types';
import { familyStandards, SEED_RATIOS } from '../violin-family-seed';
import { fromLegacyCeruti, isLegacyCeruti } from './legacy-ceruti';

// Every file the recipe opens comes through here: a picked file, a template, the tab's session.
// Formats are listed oldest first. A file is matched to the first format that recognises it, then
// run through that format's step and every one after, each step knowing only the format it reads
// and the one it writes. The last is this build's own and passes through. A release that changes
// the file gives the last entry a step to its own format, recognised by `version`, and appends it.

interface RecipeFormat {
  name: string;
  recognises(file: any): boolean;
  // the file in the next format's shape
  upgrade(file: any): any;
}

const FORMATS: RecipeFormat[] = [
  { name: 'legacy-ceruti', recognises: isLegacyCeruti, upgrade: fromLegacyCeruti },
  { name: '0.9.0', recognises: file => file?.recipeName === VIOLIN_FAMILY_RECIPE_NAME && compareVersions(String(file.version ?? 0), '0.9.0.1') < 0, upgrade: from090 },
  { name: '0.9.0.1', recognises: file => file?.recipeName === VIOLIN_FAMILY_RECIPE_NAME, upgrade: file => file },
];

export function recipeFormat(file: unknown): string | null {
  return FORMATS.find(f => f.recognises(file))?.name ?? null;
}

// null when no format recognises the file
export function normalizeViolinFamilyRecipe(file: unknown): ViolinFamilyRecipe | null {
  let from = FORMATS.findIndex(f => f.recognises(file));
  if (from < 0) return null;
  return FORMATS.slice(from).reduce((next, f) => f.upgrade(next), file as any);
}

// 0.9.0 to 0.9.0.1. The join arcs moved from the corners to the bouts, level as 0.9.0 always drew
// them: its U2Y and L2Y were never read. The bridge took a width and the soundpost arrived, both
// the size class's. The mould's clamp box became a choice, with the windows' inset its own field.
// The Center Bout panel went, its fields to Corners. Every move checks the shape first: the served
// templates and the Ceruti step already write 0.9.0.1's while saying 0.9.0
function from090(file: any): any {
  let p = { ...file.params };
  let b = p.bouts, c = p.corners, m = p.mould;
  if (b && b.U2R == null) {
    let inset = p.body.overhang + p.body.rib;
    p.bouts = {
      ...b,
      // a file that never reached the corners takes the seed's
      U2R: c?.U2R ?? Math.round((b.UBW - 2 * inset) * SEED_RATIOS.U2toUBW), UJoinY: 0,
      L2R: c?.L2R ?? Math.round((p.body.width - 2 * inset) * SEED_RATIOS.L2toLBW), LJoinY: 0,
    };
  }
  if (c) {
    let { U2R, L2R, U2Y, L2Y, ...kept } = c;
    p.corners = kept;
  }
  if (p.stringSetup) {
    let standard = familyStandards(p.body.height).strings;
    p.stringSetup = { bridgeWidth: standard.bridgeWidth, soundPostOffset: { ...standard.soundPostOffset }, soundPostDiameter: standard.soundPostDiameter, ...p.stringSetup };
  }
  if (m && typeof m.clampBox === 'boolean') {
    // the wall the mould panel seeds, off the file's own blocks
    let windowInset = Math.round(11 * (Math.max(m.neckBlock.height, m.endBlock.height) + 4)) / 10;
    p.mould = { ...m, clampBox: m.clampBox ? 'windows' : 'none', windowInset, alignmentHoles: false };
  }
  let next = { ...file, params: p };
  if (Array.isArray(file.referenceImages)) next.referenceImages = file.referenceImages.map(foldCenterBoutScope);
  let t = file.toolboxState;
  if (t) next.toolboxState = { ...t, layers: t.layers?.map(foldCenterBoutScope), shapes: t.shapes?.map(foldCenterBoutScope) };
  return next;
}

// an image or layer listed for the Center Bout panel is listed for Main Bouts, where the same
// picture serves; one kept off it is kept off Main Bouts only if it already was
function foldCenterBoutScope(item: any): any {
  let scope = item?.scope;
  let list: string[] | undefined = scope?.only ?? scope?.except;
  if (!list?.includes('centerBout')) return item;
  let rest = list.filter(id => id !== 'centerBout');
  if (scope.only) return { ...item, scope: { only: rest.includes('mainBouts') ? rest : [...rest, 'mainBouts'] } };
  if (rest.length) return { ...item, scope: { except: rest } };
  let { scope: _, ...kept } = item;
  return kept;
}
