import { VIOLIN_FAMILY_RECIPE_NAME, ViolinFamilyRecipe } from '../violin-family-types';
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
  { name: '0.9.0', recognises: file => file?.recipeName === VIOLIN_FAMILY_RECIPE_NAME, upgrade: file => file },
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
