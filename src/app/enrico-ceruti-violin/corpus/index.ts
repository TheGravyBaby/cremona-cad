import { EnricoCerutiTemplate } from '../ceruti-types';
import amatiBrothersCello898377 from './amati-brothers-cello-898377.json';
import stradivariViolinWard2022560100 from './stradivari-violin-ward-2022560100.json';

/**
 * Instruments traced from open-licence museum records, kept apart from `ceruti-templates.ts`.
 *
 * Same type as the older bundled templates — the split is by where an instrument came from, not by
 * what it is. Each carries a `TemplateMeta` naming the public catalogue entry its numbers can be
 * rechecked against, and each reference image carries an `ImageCredit` naming the licence, so both
 * travel with the geometry rather than living in a README.
 *
 * One `.json` file per instrument, rather than the pasted-`const` style `ceruti-templates.ts` uses.
 * A template is data: as JSON it diffs cleanly, and there is no way to slip logic into it. The
 * cost is that JSON carries no comments — anything a reader of the numbers needs goes in
 * `meta.notes` — and no type checking, which `ceruti-templates.spec.ts` covers instead.
 *
 * Adding one:
 *   1. Trace the instrument over its reference image as normal and save the recipe.
 *   2. Save the recipe JSON here as `<maker>-<instrument>-<objectId>.json`.
 *   3. Add `meta`, and a `credit` on each reference image.
 *   4. Add `panels` to any image that belongs to particular drafting steps rather than all of
 *      them — a plan view usually wants none, a profile or section usually wants the arching
 *      panels. Ids come from `CERUTI_PANEL_IDS`; the spec checks every one of them exists.
 *   5. Import it above and add it to the array below.
 *
 * Two rules the older templates already follow and these must too: no `arching` block, and no
 * measurement that isn't in the record. A plausible-looking number on a real instrument is an
 * invented measurement of a real object.
 */
export const CORPUS_TEMPLATES: EnricoCerutiTemplate[] = [
  // Cast because a JSON import is inferred structurally: `meta.record.source` widens to `string`
  // rather than the union, and the null-valued arc fields to `null`. The shape is pinned by
  // ceruti-templates.spec.ts instead, which is also where a hand-authored file's mistakes show.
  amatiBrothersCello898377 as unknown as EnricoCerutiTemplate,
  stradivariViolinWard2022560100 as unknown as EnricoCerutiTemplate,
];
