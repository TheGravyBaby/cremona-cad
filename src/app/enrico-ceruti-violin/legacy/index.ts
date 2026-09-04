import { EnricoCerutiParams, EnricoCerutiTemplate, RECIPE_SCHEMA_VERSION } from '../ceruti-types';
import amatiStoll from './amati-stoll.json';
import stradGoetz from './strad-goetz.json';
import ravatinMans from './ravatin-mans.json';
import delGesuBaltic from './del-gesu-baltic.json';
import stradDavidoff from './strad-davidoff.json';
import magginiDelmas from './maggini-delmas.json';
import mittenwaldBass from './mittenwald-bass.json';
import guadagniniPiacenza from './guadagnini-piacenza.json';

// eight instruments traced by eye, not from a record — excluded from the template picker, kept
// only because the suite's per-template sweeps need them: they're the only ones in the repo
// exercising a bass, viol neck/corners and the double-arc options. Reference image hrefs point at
// files removed from `public/`; restoring one to the picker means restoring its image too.
export const LEGACY_TEMPLATES: EnricoCerutiTemplate[] = [
  amatiStoll, stradGoetz, delGesuBaltic, guadagniniPiacenza,
  stradDavidoff, ravatinMans, magginiDelmas, mittenwaldBass,
].map(templateFromRecipeJson);

// converts a raw pasted session-storage recipe (nested `params`, plus stray fields like
// `toolboxState` a template has no slot for) into an EnricoCerutiTemplate.
function templateFromRecipeJson(raw: any): EnricoCerutiTemplate {
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
