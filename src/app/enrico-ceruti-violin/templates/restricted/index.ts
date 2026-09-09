import { EnricoCerutiTemplate } from '../../ceruti-types';
import guarneriViolinSaintonBetti from './guarneri-violin-sainton-betti-1744.json';

/**
 * Same as `corpus/` in every respect but one: the reference images are under a restrictive or
 * commercial licence rather than a museum's research-use terms, so they cannot ship in an open
 * build. The split is the folder, not a field — dropping this import drops every image whose
 * terms are in question, which a per-template flag could not do as reliably.
 *
 * The traces themselves are held to the same standard, and `ceruti-templates.spec.ts` runs the
 * provenance checks over this set too: measurements are facts either way, and an instrument whose
 * photographs are restricted needs its numbers rechecked more easily, not less.
 *
 * Adding one follows `corpus/index.ts`. The extra obligation here is that `credit.licence` says
 * what is actually true — who holds it and whether permission was obtained — rather than reaching
 * for the research-use wording the museum sets use.
 */
export const RESTRICTED_TEMPLATES: EnricoCerutiTemplate[] = [
  guarneriViolinSaintonBetti as unknown as EnricoCerutiTemplate,
];
