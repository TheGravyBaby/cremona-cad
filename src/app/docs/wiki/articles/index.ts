// One line per article, keyed by its path under this folder. A file on disk missing from here
// fails wiki.spec.ts.
import bouts from './outline/bouts.md';
import vesica from './outline/vesica.md';
import violNeck from './outline/viol-neck.md';
import style from './style.md';

export const ARTICLE_SOURCES: Record<string, string> = {
  'outline/bouts.md': bouts,
  'outline/vesica.md': vesica,
  'outline/viol-neck.md': violNeck,
  'style.md': style,
};
