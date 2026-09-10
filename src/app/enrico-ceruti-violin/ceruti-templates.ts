import { EnricoCerutiTemplate, DefaultParams, RECIPE_SCHEMA_VERSION } from "./ceruti-types";
import { CORPUS_TEMPLATES } from "./templates/corpus";

/**
 * The instruments the template picker offers.
 *
 * `ceruti-new` first — ceruti-violin.ts reads index 0 as the blank and filters it out of the
 * picker, and opens on index 1.
 */
export const CERUTI_TEMPLATES: EnricoCerutiTemplate[] = [
  {
    key: 'ceruti-new',
    label: 'New Instrument',
    recipeName: 'enrico-ceruti-violin',
    fileName: 'New Instrument',
    description: 'A blank template to start from...',
    version: RECIPE_SCHEMA_VERSION,
    params: DefaultParams,
    paths: [],
    referenceImages: [],
  },
  // museum-traced instruments live in templates/corpus/index.ts, appended rather than interleaved.
  ...CORPUS_TEMPLATES,
];
