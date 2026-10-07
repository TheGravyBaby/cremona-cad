import { Article, ArticleKind, ArticleParseError, parseArticle } from './article';
import { markdownToText, renderMarkdown } from './markdown';

export interface Measurement {
  id: string;
  title: string;
  unit: string;
  standard: Record<string, string>;
}

// Every article, parsed once from its source. `problems` collects what a human has to fix —
// parse failures, duplicate ids, links to nothing — rather than throwing, so one bad file
// doesn't take the rest of the documentation down with it; docs.spec.ts asserts it is empty.
export class DocsRegistry {
  private readonly articles = new Map<string, Article>();
  private readonly htmlCache = new Map<string, string>();
  readonly problems: string[] = [];

  constructor(sources: Record<string, string>) {
    for (const [file, source] of Object.entries(sources)) {
      let article: Article;
      try {
        article = parseArticle(source, file);
      } catch (e) {
        this.problems.push(e instanceof ArticleParseError ? e.message : `${file}: ${String(e)}`);
        continue;
      }
      // folders under articles/ are for the author's filing; ids stay global so links never carry a path
      const expected = file.replace(/^.*\//, '').replace(/\.md$/, '');
      if (article.id !== expected) this.problems.push(`${file}: id "${article.id}" does not match the file name`);
      if (this.articles.has(article.id)) this.problems.push(`${file}: duplicate id "${article.id}"`);
      this.articles.set(article.id, article);
    }
    for (const a of this.articles.values()) {
      for (const link of a.links) {
        if (!this.articles.has(link)) this.problems.push(`${a.id}: links to "${link}", which has no article`);
      }
    }
  }

  has(id: string): boolean { return this.articles.has(id); }
  get(id: string): Article | undefined { return this.articles.get(id); }

  all(): Article[] {
    return [...this.articles.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  byKind(kind: ArticleKind): Article[] { return this.all().filter(a => a.kind === kind); }

  onPanel(panel: string): Article[] { return this.all().filter(a => a.panel === panel && a.kind !== 'panel'); }

  panelArticle(panel: string): Article | undefined {
    return this.all().find(a => a.kind === 'panel' && a.panel === panel);
  }

  // what a tooltip shows: the opening paragraph as plain text. Empty for a missing article, so a
  // template binding degrades to no tooltip rather than an exception mid-render
  summary(id: string): string {
    const a = this.articles.get(id);
    return a ? markdownToText(a.summary, slug => this.articles.get(slug)?.title) : '';
  }

  html(id: string): string {
    const cached = this.htmlCache.get(id);
    if (cached !== undefined) return cached;
    const a = this.articles.get(id);
    const html = a ? renderMarkdown(a.body, slug => this.link(slug)) : '';
    this.htmlCache.set(id, html);
    return html;
  }

  link(slug: string): { href: string; title: string } | null {
    const a = this.articles.get(slug);
    return a ? { href: `#doc/${a.id}`, title: a.title } : null;
  }

  backlinks(id: string): Article[] { return this.all().filter(a => a.links.includes(id)); }

  // title and alias hits first, then anything whose text mentions it
  search(query: string): Article[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const score = (a: Article): number => {
      if (a.title.toLowerCase() === q || a.aliases.some(al => al.toLowerCase() === q)) return 3;
      if (a.title.toLowerCase().includes(q) || a.aliases.some(al => al.toLowerCase().includes(q))) return 2;
      if (markdownToText(a.body).toLowerCase().includes(q)) return 1;
      return 0;
    };
    return this.all()
      .map(a => ({ a, s: score(a) }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s || x.a.title.localeCompare(y.a.title))
      .map(x => x.a);
  }

  measurements(): Measurement[] {
    return this.all()
      .filter(a => a.standard && a.unit)
      .map(a => ({ id: a.id, title: a.title, unit: a.unit!, standard: a.standard! }));
  }
}
