import { ViolinFamilyTemplate } from '../../violin-family-types';
import amatiViolinBrookings2022560097 from './amati-violin-brookings-2022560097.json';
import stradivariViolinBetts2022560101 from './stradivari-violin-betts-2022560101.json';
import guarneriViolinKreisler2022560099 from './guarneri-violin-kreisler-2022560099.json';
import stradivariViolaCassavetti2022560103 from './stradivari-viola-cassavetti-2022560103.json';
import stradivariCelloCastelbarco2022560102 from './stradivari-cello-castelbarco-2022560102.json';
import stradivariViolinWard2022560100 from './stradivari-violin-ward-2022560100.json';
import guarneriViolinGoldbergBaronVitta2023870692 from './guarneri-violin-goldberg-baron-vitta-2023870692.json';

// Instruments traced from public museum/library records, one recipe file each, named
// `<maker>-<instrument>-<objectId>.json`. Each carries a `source` link to its catalogue record and
// each reference image a `credit` (the Library of Congress sets are educational and research use,
// not an open licence). Images scope to panels by `scope: { only | except: [...] }`, ids from
// `VIOLIN_FAMILY_PANEL_IDS`.
//
// Ported from the Ceruti recipe's corpus, retired in Oct 2026 and kept in the history as the
// tracing source. A stage is here only where the old file held a measurement: the Goldberg-Baron
// Vitta shipped Ceruti's seeded arching, neck, string setup and scroll with no profile image to
// read them from, so it carries the outline and f-holes alone and each later stage seeds when its
// panel opens.
//
// No measurement that isn't in the record. `arching` may be read off a side-profile image, and only
// then: the spec pairs an `arching` stage with an image scoped to the `longArching` panel.
export const CORPUS_TEMPLATES: ViolinFamilyTemplate[] = [
  // cast because JSON imports infer structurally (a literal `recipeName` widens to string);
  // the shape is pinned by violin-family-templates.spec.ts instead
  amatiViolinBrookings2022560097 as unknown as ViolinFamilyTemplate,
  // stradivariViolinWard2022560100 as unknown as ViolinFamilyTemplate,
  stradivariViolinBetts2022560101 as unknown as ViolinFamilyTemplate,
  guarneriViolinKreisler2022560099 as unknown as ViolinFamilyTemplate,
  // guarneriViolinGoldbergBaronVitta2023870692 as unknown as ViolinFamilyTemplate,
  stradivariViolaCassavetti2022560103 as unknown as ViolinFamilyTemplate,
  stradivariCelloCastelbarco2022560102 as unknown as ViolinFamilyTemplate,
];

const LOC_HOST = 'https://tile.loc.gov/';

// the Library of Congress's IIIF service sends the CORS header a browser needs to read an image's
// pixels, which the white suppression does. A template with an image from anywhere else is offered
// on a local dev build only, since a deployed one can't count on that host
export function isLocSourced(template: ViolinFamilyTemplate): boolean {
  return (template.referenceImages ?? []).every(img => img.href.startsWith(LOC_HOST));
}

// the gallery card's picture is the first reference image, asked for small: a LoC href is a IIIF
// request whose size segment can be swapped, so the card never pulls the full-resolution scan
export function thumbnailHref(template: ViolinFamilyTemplate): string | undefined {
  const href = template.referenceImages?.[0]?.href;
  if (!href) return undefined;
  if (!href.startsWith(LOC_HOST)) return href;
  return href.replace(/\/full\/[^/]+\/0\/default\./, '/full/!240,320/0/default.');
}
