import { EnricoCerutiParams, EnricoCerutiTemplate, RECIPE_SCHEMA_VERSION } from '../ceruti-types';
import amatiStoll from './amati-stoll.json';
import stradGoetz from './strad-goetz.json';
import ravatinMans from './ravatin-mans.json';
import delGesuBaltic from './del-gesu-baltic.json';
import stradDavidoff from './strad-davidoff.json';
import magginiDelmas from './maggini-delmas.json';
import mittenwaldBass from './mittenwald-bass.json';
import guadagniniPiacenza from './guadagnini-piacenza.json';

/**
 * The eight instruments that shipped before the corpus.
 *
 * They are traced by eye off a photograph rather than measured from a record, so they are no
 * longer offered in the template picker — CERUTI_TEMPLATES does not include them and the app
 * never loads them. They stay because the suite runs its per-template sweeps over them: between
 * them they carry a bass, two cellos, a viola and the only instruments in the repo that set
 * `useViolNeck`, `useViolCornerUC`/`LC` and the double-arc options. Nothing in the corpus
 * exercises those, and nothing ever will — the corpus is violins and violas from museum records.
 *
 * Deleting these deletes that coverage. Adding one is not expected; if a traced instrument
 * earns a place in the picker it belongs in `corpus/` with a record behind it.
 *
 * Their `referenceImage`/`referenceImages` hrefs point at files removed from `public/` when they
 * left the picker — nothing fetches them, since the specs only read the geometry. Putting one of
 * these back in front of a user means restoring its image too.
 *
 * Reached from tests through `templateViolin`/`templateKeys` in ceruti-fixtures.ts.
 */
export const LEGACY_TEMPLATES: EnricoCerutiTemplate[] = [
  amatiStoll, stradGoetz, delGesuBaltic, guadagniniPiacenza,
  stradDavidoff, ravatinMans, magginiDelmas, mittenwaldBass,
].map(templateFromRecipeJson);

/**
 * Converts a raw recipe object copied from session storage into an EnricoCerutiTemplate. The
 * session-storage JSON wraps the params under a nested `params` key alongside top-level metadata
 * fields (`key`, `label`, `fileName`, `referenceImage`, `paths`, etc.), and carries a few — like
 * `toolboxState` — that a template has no field for. Pass the pasted object directly.
 */
function templateFromRecipeJson(raw: any): EnricoCerutiTemplate {
  return {
    key: raw.key ?? '',
    label: raw.label ?? '',
    // `||`, not `??`: pasted recipe JSON has twice arrived carrying `"recipeName": ""`, which
    // `??` lets through. A blank name is not a name — it fails the identity check
    // loadMatchingStoredRecipe runs on every restore, so the design silently reverts to the
    // default template on refresh, and a file saved from it carries the blank on to disk.
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
