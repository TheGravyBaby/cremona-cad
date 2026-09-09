import { EnricoCerutiTemplate } from '../ceruti-types';
import amatiViolinBrookings2022560097 from './amati-violin-brookings-2022560097.json';
import stradivariViolinBetts2022560101 from './stradivari-violin-betts-2022560101.json';
import guarneriViolinKreisler2022560099 from './guarneri-violin-kreisler-2022560099.json';
import stradivariViolaCassavetti2022560103 from './stradivari-viola-cassavetti-2022560103.json';
import stradivariCelloCastelbarco2022560102 from './stradivari-cello-castelbarco-2022560102.json';
import stradivariViolinWard2022560100 from './stradivari-violin-ward-2022560100.json';
import rugeriCello from './rugeri-poplar1690.json'
import guarneriViolinGoldbergBaronVitta2023870692 from './guarneri-violin-goldberg-baron-vitta-2023870692.json';
import amatiViolinWitten03356 from './amati-violin-witten-03356.json';
import stradivariViolinHarrison03598 from './stradivari-violin-harrison-03598.json';

/**
 * Instruments traced from public museum/library records, kept apart from `ceruti-templates.ts` —
 * same type as the photo-traced set in `legacy/`, split by where the numbers came from. Each
 * carries a `TemplateMeta` (catalogue entry) and each reference image an `ImageCredit` (usage
 * terms vary by holder — the LoC sets below are educational-and-research use, not open licence).
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
 * No `arching` block, and no measurement that isn't in the record — a plausible number on a real
 * instrument is an invented measurement of a real object.
 */
export const CORPUS_TEMPLATES: EnricoCerutiTemplate[] = [
  // cast because JSON imports infer structurally (arcs' nulls widen to null);
  // shape is pinned by ceruti-templates.spec.ts instead.
  amatiViolinBrookings2022560097 as unknown as EnricoCerutiTemplate,
  amatiViolinWitten03356 as unknown as EnricoCerutiTemplate,
  stradivariViolinWard2022560100 as unknown as EnricoCerutiTemplate,
  stradivariViolinBetts2022560101 as unknown as EnricoCerutiTemplate,
  stradivariViolinHarrison03598 as unknown as EnricoCerutiTemplate,
  guarneriViolinKreisler2022560099 as unknown as EnricoCerutiTemplate,
  guarneriViolinGoldbergBaronVitta2023870692 as unknown as EnricoCerutiTemplate,
  stradivariViolaCassavetti2022560103 as unknown as EnricoCerutiTemplate,
  stradivariCelloCastelbarco2022560102 as unknown as EnricoCerutiTemplate,
  rugeriCello as unknown as EnricoCerutiTemplate,

];
