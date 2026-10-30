// Every page the info booth shows, one Markdown file each, keyed by its path under this folder.
// A file on disk missing from here fails docs.spec.ts.
import boothAboutMe from './booth/about-me.md';
import boothSources from './booth/sources.md';
import boothCremonaCad from './booth/cremona-cad.md';
import historyLicense from './history/license.md';
import historyV070 from './history/v0.7.0.md';
import historyV071 from './history/v0.7.1.md';
import historyV0721 from './history/v0.7.2.1.md';
import historyV072 from './history/v0.7.2.md';
import historyV080 from './history/v0.8.0.md';
import historyV081 from './history/v0.8.1.md';
import historyV0831 from './history/v0.8.3.1.md';
import historyV0832 from './history/v0.8.3.2.md';
import historyV0833 from './history/v0.8.3.3.md';
import historyV0834 from './history/v0.8.3.4.md';
import historyV083 from './history/v0.8.3.md';
import historyV0880 from './history/v0.8.8.0.md';
import historyV090 from './history/v0.9.0.md';
import wikiOverview from './wiki/overview.md';
import wikiCanvasCanvas from './wiki/cremonaCad/canvas.md';
import wikiCanvasControls from './wiki/cremonaCad/controls.md';
import wikiCanvasImages from './wiki/cremonaCad/images.md';
import wikiCanvasLayers from './wiki/cremonaCad/layers.md';
import wikiCanvasTools from './wiki/cremonaCad/tools.md';
import wikiPanelsBase from './wiki/panels/base.md';
import wikiPanelsCorners from './wiki/panels/corners.md';
import wikiPanelsCenterBout from './wiki/panels/center-bout.md';
import wikiPanelsPlateContour from './wiki/panels/plate-contour.md';
import wikiPanelsFluting from './wiki/panels/fluting.md';
import wikiPanelsFHolePlacement from './wiki/panels/f-hole-placement.md';
import wikiPanelsFHoleContours from './wiki/panels/f-hole-contours.md';
import wikiPanelsLongArching from './wiki/panels/long-arching.md';
import wikiPanelsCrossArching from './wiki/panels/cross-arching.md';
import wikiPanelsNeck from './wiki/panels/neck.md';
import wikiPanelsVolute from './wiki/panels/volute.md';
import wikiPanelsScroll from './wiki/panels/scroll.md';
import wikiPanelsScrollWidths from './wiki/panels/scroll-widths.md';
import wikiPanelsStringSetup from './wiki/panels/string-setup.md';
import wikiPanelsMould from './wiki/panels/mould.md';
import wikiPanelsExport from './wiki/panels/export.md';
import wikiCanvasFiles from './wiki/cremonaCad/files.md';
import wikiConceptsParametric from './wiki/concepts/parametric-models.md';
import wikiPanelsPanel from './wiki/panels/panel.md';
import wikiPanelsBouts from './wiki/panels/bouts.md';
import wikiConceptsPerspective from './wiki/concepts/perspective.md';
import wikiConceptsVesica from './wiki/concepts/vesica.md';
import wikiConceptsViolNeck from './wiki/concepts/viol-neck.md';

export interface PageFile { path: string; source: string }
const page = (path: string, source: string): PageFile => ({ path, source });

// the wiki's contents, in the order shown. Clicking a category opens its overview, if it has one;
// the first category's overview is the page the wiki opens on
export interface WikiCategory { label: string; overview?: PageFile; pages: PageFile[] }

export const WIKI: WikiCategory[] = [
  {
    label: 'CremonaCad',
    overview: page('wiki/overview.md', wikiOverview),
    pages: [
      page('wiki/cremonaCad/canvas.md', wikiCanvasCanvas),
      page('wiki/cremonaCad/controls.md', wikiCanvasControls),
      page('wiki/cremonaCad/files.md', wikiCanvasFiles),
      page('wiki/cremonaCad/tools.md', wikiCanvasTools),
      page('wiki/cremonaCad/layers.md', wikiCanvasLayers),
      page('wiki/cremonaCad/images.md', wikiCanvasImages),
    ],
  },
  {
    label: 'Panels',
    overview: page('wiki/panels/panel.md', wikiPanelsPanel),
    pages: [
      page('wiki/panels/base.md', wikiPanelsBase),
      page('wiki/panels/bouts.md', wikiPanelsBouts),
      page('wiki/panels/corners.md', wikiPanelsCorners),
      page('wiki/panels/center-bout.md', wikiPanelsCenterBout),
      page('wiki/panels/plate-contour.md', wikiPanelsPlateContour),
      page('wiki/panels/fluting.md', wikiPanelsFluting),
      page('wiki/panels/f-hole-placement.md', wikiPanelsFHolePlacement),
      page('wiki/panels/f-hole-contours.md', wikiPanelsFHoleContours),
      page('wiki/panels/long-arching.md', wikiPanelsLongArching),
      page('wiki/panels/cross-arching.md', wikiPanelsCrossArching),
      page('wiki/panels/neck.md', wikiPanelsNeck),
      page('wiki/panels/volute.md', wikiPanelsVolute),
      page('wiki/panels/scroll.md', wikiPanelsScroll),
      page('wiki/panels/scroll-widths.md', wikiPanelsScrollWidths),
      page('wiki/panels/string-setup.md', wikiPanelsStringSetup),
      page('wiki/panels/mould.md', wikiPanelsMould),
      page('wiki/panels/export.md', wikiPanelsExport),
    ],
  },
  {
    label: 'Concepts',
    pages: [
      page('wiki/concepts/parametric-models.md', wikiConceptsParametric),
      page('wiki/concepts/perspective.md', wikiConceptsPerspective),
      page('wiki/concepts/vesica.md', wikiConceptsVesica),
      page('wiki/concepts/viol-neck.md', wikiConceptsViolNeck),
    ],
  },
];

const BOOTH: PageFile[] = [
  page('booth/about-me.md', boothAboutMe),
  page('booth/sources.md', boothSources),
  page('booth/cremona-cad.md', boothCremonaCad),
];

const HISTORY: PageFile[] = [
  page('history/license.md', historyLicense),
  page('history/v0.7.0.md', historyV070),
  page('history/v0.7.1.md', historyV071),
  page('history/v0.7.2.1.md', historyV0721),
  page('history/v0.7.2.md', historyV072),
  page('history/v0.8.0.md', historyV080),
  page('history/v0.8.1.md', historyV081),
  page('history/v0.8.3.1.md', historyV0831),
  page('history/v0.8.3.2.md', historyV0832),
  page('history/v0.8.3.3.md', historyV0833),
  page('history/v0.8.3.4.md', historyV0834),
  page('history/v0.8.3.md', historyV083),
  page('history/v0.8.8.0.md', historyV0880),
  page('history/v0.9.0.md', historyV090),
];

export const PAGE_SOURCES: Record<string, string> = Object.fromEntries(
  [...BOOTH, ...HISTORY, ...WIKI.flatMap(c => [...(c.overview ? [c.overview] : []), ...c.pages])]
    .map(f => [f.path, f.source]),
);

// the booth's tabs in order: a booth page by id, or the wiki or the history
export const BOOTH_TABS = ['cremona-cad', 'wiki', 'history', 'sources', 'about-me'] as const;
export type BoothTab = typeof BOOTH_TABS[number];
