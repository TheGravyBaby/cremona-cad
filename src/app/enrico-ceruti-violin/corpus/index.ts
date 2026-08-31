import { EnricoCerutiTemplate } from '../ceruti-types';
import amatiViolinBrookings2022560097 from './amati-violin-brookings-2022560097.json';
import stradivariViolinBetts2022560101 from './stradivari-violin-betts-2022560101.json';
import guarneriViolinKreisler2022560099 from './guarneri-violin-kreisler-2022560099.json';
import stradivariViolaCassavetti2022560103 from './stradivari-viola-cassavetti-2022560103.json';
import stradivariCelloCastelbarco2022560102 from './stradivari-cello-castelbarco-2022560102.json';
import stradivariViolinWard2022560100 from './stradivari-violin-ward-2022560100.json';

/**
 * Instruments traced from public museum and library records, kept apart from
 * `ceruti-templates.ts`.
 *
 * Same type as the photo-traced set in `legacy/` — the split is by where an instrument's numbers
 * came from, not by what it is. Each carries a `TemplateMeta` naming the catalogue entry its
 * numbers can be rechecked against, and each reference image carries an `ImageCredit` naming the
 * terms it is used under, so both travel with the geometry rather than living in a README. Terms
 * vary by holder — the Library of Congress sets below are educational-and-research use, not an
 * open licence — which is why the credit is per-image rather than a blanket statement here.
 *
 * One `.json` file per instrument, rather than the pasted-`const` style the legacy set uses.
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
 *      `excludePanels` is the inverse, for a default image that suits every panel but a few.
 *   5. Import it above and add it to the array below.
 *
 * Two rules: no `arching` block, and no measurement that isn't in the record. A plausible-looking
 * number on a real instrument is an invented measurement of a real object.
 */
export const CORPUS_TEMPLATES: EnricoCerutiTemplate[] = [
  // Cast because a JSON import is inferred structurally: `meta.record.source` widens to `string`
  // rather than the union, and the null-valued arc fields to `null`. The shape is pinned by
  // ceruti-templates.spec.ts instead, which is also where a hand-authored file's mistakes show.
  amatiViolinBrookings2022560097 as unknown as EnricoCerutiTemplate,
  stradivariViolinWard2022560100 as unknown as EnricoCerutiTemplate,
  stradivariViolinBetts2022560101 as unknown as EnricoCerutiTemplate,
  guarneriViolinKreisler2022560099 as unknown as EnricoCerutiTemplate,
  stradivariViolaCassavetti2022560103 as unknown as EnricoCerutiTemplate,
  stradivariCelloCastelbarco2022560102 as unknown as EnricoCerutiTemplate,
];
