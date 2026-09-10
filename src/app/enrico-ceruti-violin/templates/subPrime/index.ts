import { EnricoCerutiParams, EnricoCerutiTemplate, RECIPE_SCHEMA_VERSION } from '../../ceruti-types';
import amatiStoll from './amati-stoll.json';
import stradGoetz from './strad-goetz.json';
import ravatinMans from './ravatin-mans.json';
import delGesuBaltic from './del-gesu-baltic.json';
import stradDavidoff from './strad-davidoff.json';
import magginiDelmas from './maggini-delmas.json';
import mittenwaldBass from './mittenwald-bass.json';
import guadagniniPiacenza from './guadagnini-piacenza.json';
import delGesuSainton from './guarneri-violin-sainton-betti-1744.json'
import rugeriCello from './rugeri-poplar1690.json';
import amatiViolinWitten03356 from './amati-violin-witten-03356.json';
import stradivariViolinHarrison03598 from './/stradivari-violin-harrison-03598.json';

// ten instruments traced by eye, not from a record — the only ones in the repo exercising a
// bass, viol neck/corners and the double-arc options, so the suite's per-template sweeps need
// them regardless of picker visibility. Most reference-image hrefs point at files removed from
// `public/` and render broken; the params/paths are still real, usable geometry. Folded into the
// picker via SUBPRIME_PICKS, but only for a local dev build — see isLocSourced.
export const LEGACY_TEMPLATES: EnricoCerutiTemplate[] = [
  amatiStoll, amatiViolinWitten03356, stradGoetz, stradivariViolinHarrison03598, delGesuBaltic, delGesuSainton, guadagniniPiacenza, rugeriCello,
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
