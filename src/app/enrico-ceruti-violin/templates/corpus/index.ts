import { EnricoCerutiTemplate } from '../../ceruti-types';
import { referenceImagesOf } from '../../../models/types';
import amatiViolinBrookings2022560097 from './amati-violin-brookings-2022560097.json';
import stradivariViolinBetts2022560101 from './stradivari-violin-betts-2022560101.json';
import guarneriViolinKreisler2022560099 from './guarneri-violin-kreisler-2022560099.json';
import stradivariViolaCassavetti2022560103 from './stradivari-viola-cassavetti-2022560103.json';
import stradivariCelloCastelbarco2022560102 from './stradivari-cello-castelbarco-2022560102.json';
import stradivariViolinWard2022560100 from './stradivari-violin-ward-2022560100.json';
import guarneriViolinGoldbergBaronVitta2023870692 from './guarneri-violin-goldberg-baron-vitta-2023870692.json';

/**
 * Instruments traced from public museum/library records, kept apart from `ceruti-templates.ts`.
 * Each carries a `TemplateMeta` (catalogue entry) and each reference image an `ImageCredit`
 * (usage terms vary by holder — the LoC sets below are educational-and-research use, not open
 * licence).
 *
 * One `.json` file per instrument rather than a pasted `const`: diffs cleanly, can't carry logic.
 * Cost is no comments (put reader notes in `meta.notes`) and no type checking
 * (`ceruti-templates.spec.ts` covers that instead).
 *
 * Adding one:
 *   1. Trace over the reference image as normal and save the recipe.
 *   2. Save the recipe JSON here as `<maker>-<instrument>-<objectId>.json`.
 *   3. Add `meta`, and a `credit` on each reference image.
 *   4. Scope images to panels via `panels`/`excludePanels` (ids from `CERUTI_PANEL_IDS`, checked
 *      by the spec) — a plan view usually wants none, a profile usually wants the arching panels.
 *   5. Import it above and add it to the array below.
 *
 * No measurement that isn't in the record — a plausible number on a real instrument is an
 * invented measurement of a real object. `arching` may be read off a side-profile image, and
 * only then: the spec pairs an `arching` block with an image scoped to the `longArching` panel.
 */
export const CORPUS_TEMPLATES: EnricoCerutiTemplate[] = [
  // cast because JSON imports infer structurally (arcs' nulls widen to null);
  // shape is pinned by ceruti-templates.spec.ts instead.
  amatiViolinBrookings2022560097 as unknown as EnricoCerutiTemplate,
  
  stradivariViolinWard2022560100 as unknown as EnricoCerutiTemplate,
  stradivariViolinBetts2022560101 as unknown as EnricoCerutiTemplate,
  guarneriViolinKreisler2022560099 as unknown as EnricoCerutiTemplate,
  guarneriViolinGoldbergBaronVitta2023870692 as unknown as EnricoCerutiTemplate,
  stradivariViolaCassavetti2022560103 as unknown as EnricoCerutiTemplate,
  stradivariCelloCastelbarco2022560102 as unknown as EnricoCerutiTemplate,
];

const LOC_HOST = 'https://tile.loc.gov/';

/**
 * True when every reference image on this template is served by the Library of Congress's IIIF
 * service, which sends the CORS header a browser needs to read an image's pixels. Used to gate
 * `templateOptions` (ceruti-violin.ts): a template that fails this only ever shows up on a local
 * dev build, with a `/ ` prefix — a deployed build never reaches an instrument whose background
 * suppression is broken, or whose image host might not be reachable at all. In practice this
 * only excludes `templates/local/` entries; every committed `CORPUS_TEMPLATES` entry is
 * LOC-sourced. Reads referenceImagesOf rather than `referenceImages` directly so a template still
 * on the deprecated singular `referenceImage` field isn't missed.
 */
export function isLocSourced(template: EnricoCerutiTemplate): boolean {
  return referenceImagesOf(template).every(img => img.href.startsWith(LOC_HOST));
}
