import { EnricoCerutiParams, EnricoCerutiTemplate, RECIPE_SCHEMA_VERSION } from '../ceruti-types';

// Converts a raw pasted session-storage recipe (nested `params`, plus stray fields like
// `toolboxState` a template has no slot for) into an EnricoCerutiTemplate. Used by
// templates/local/generated-index.ts to normalize whatever JSON a developer drops in that folder.
export function templateFromRecipeJson(raw: any): EnricoCerutiTemplate {
  return {
    key: raw.key ?? '',
    label: raw.label ?? '',
    // `||` not `??`: pasted JSON has twice arrived with `"recipeName": ""`, which fails the
    // identity check on restore and silently reverts to the default template.
    recipeName: raw.recipeName || 'enrico-ceruti-violin',
    fileName: raw.fileName ?? '',
    version: raw.version ?? RECIPE_SCHEMA_VERSION,
    description: raw.description ?? '',
    meta: raw.meta,
    referenceImage: raw.referenceImage,
    referenceImages: raw.referenceImages,
    params: (raw.params ?? raw) as EnricoCerutiParams,
    paths: raw.paths ?? [],
  };
}
