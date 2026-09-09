import { EnricoCerutiTemplate, DefaultParams, RECIPE_SCHEMA_VERSION } from "./ceruti-types";
import { CORPUS_TEMPLATES } from "./templates/corpus";

/**
 * The instruments the template picker offers.
 *
 * `ceruti-new` first — ceruti-violin.ts reads index 0 as the blank and filters it out of the
 * picker, and opens on index 1.
 *
 * The eight photo-traced instruments that used to sit here now live in `templates/legacy/`, out of the
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
  // museum-traced instruments live in templates/corpus/index.ts, appended rather than interleaved.
  // templates/restricted/ holds the same kind of trace where the reference image is not open-licence.
  ...CORPUS_TEMPLATES
];
