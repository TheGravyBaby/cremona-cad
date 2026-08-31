import { EnricoCerutiTemplate, DefaultParams, RECIPE_SCHEMA_VERSION } from "./ceruti-types";
import { CORPUS_TEMPLATES } from "./corpus";

/**
 * The instruments the template picker offers.
 *
 * `ceruti-new` first — ceruti-violin.ts reads index 0 as the blank and filters it out of the
 * picker, and opens on index 1.
 *
 * The eight photo-traced instruments that used to sit here now live in `legacy/`, out of the
 * picker but still swept by the test suite. See that folder's index.ts.
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
  // Instruments traced from museum records live in their own folder — see corpus/index.ts.
  // Appended rather than interleaved, so this list stays in the order it grew.
  ...CORPUS_TEMPLATES
];
