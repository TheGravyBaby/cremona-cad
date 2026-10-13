// Every page the info booth shows, one Markdown file each, keyed by its path under this folder.
// A file on disk missing from here fails docs.spec.ts.
import boothAboutMe from './booth/about-me.md';
import boothAcknowledgements from './booth/acknowledgements.md';
import boothCremonaCad from './booth/cremona-cad.md';
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
import wikiOutlineBouts from './wiki/outline/bouts.md';
import wikiOutlineVesica from './wiki/outline/vesica.md';
import wikiOutlineViolNeck from './wiki/outline/viol-neck.md';
import wikiStyle from './wiki/style.md';

export const PAGE_SOURCES: Record<string, string> = {
  'booth/about-me.md': boothAboutMe,
  'booth/acknowledgements.md': boothAcknowledgements,
  'booth/cremona-cad.md': boothCremonaCad,
  'history/v0.7.0.md': historyV070,
  'history/v0.7.1.md': historyV071,
  'history/v0.7.2.1.md': historyV0721,
  'history/v0.7.2.md': historyV072,
  'history/v0.8.0.md': historyV080,
  'history/v0.8.1.md': historyV081,
  'history/v0.8.3.1.md': historyV0831,
  'history/v0.8.3.2.md': historyV0832,
  'history/v0.8.3.3.md': historyV0833,
  'history/v0.8.3.4.md': historyV0834,
  'history/v0.8.3.md': historyV083,
  'history/v0.8.8.0.md': historyV0880,
  'history/v0.9.0.md': historyV090,
  'wiki/outline/bouts.md': wikiOutlineBouts,
  'wiki/outline/vesica.md': wikiOutlineVesica,
  'wiki/outline/viol-neck.md': wikiOutlineViolNeck,
  'wiki/style.md': wikiStyle,
};

// the booth's tabs in order: a booth page by id, or the wiki or the history
export const BOOTH_TABS = ['cremona-cad', 'wiki', 'history', 'acknowledgements', 'about-me'] as const;
export type BoothTab = typeof BOOTH_TABS[number];
