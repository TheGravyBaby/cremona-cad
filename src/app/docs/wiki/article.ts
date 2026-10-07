// An article is one Markdown file with a front-matter block. The first paragraph after the
// front matter is its summary, which is what a tooltip shows; the whole body is what the wiki
// renders. `[[slug]]` in the body links another article by id.

export const ARTICLE_KINDS = ['concept', 'field', 'panel', 'tool', 'condition', 'howto', 'meta'] as const;
export type ArticleKind = typeof ARTICLE_KINDS[number];

export const ARTICLE_STATUSES = ['unreviewed', 'stale'] as const;
export type ArticleStatus = typeof ARTICLE_STATUSES[number];

export interface Article {
  id: string;
  title: string;
  kind: ArticleKind;
  panel?: string;
  aliases: string[];
  unit?: string;
  // instrument or part → figure, as written: '195', '29–32'
  standard?: Record<string, string>;
  status?: ArticleStatus;
  summary: string;
  body: string;
  links: string[];
  // image paths the body shows, relative to public/
  images: string[];
}

const FRONT_MATTER_KEYS = new Set(['id', 'title', 'kind', 'panel', 'aliases', 'unit', 'standard', 'status']);

export class ArticleParseError extends Error {}

type FrontMatter = Record<string, string | string[] | Record<string, string>>;

function parseFrontMatter(lines: string[]): FrontMatter {
  const out: FrontMatter = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const m = /^([a-z][a-zA-Z]*):\s*(.*)$/.exec(line);
    if (!m) throw new ArticleParseError(`front matter line not key: value — "${line}"`);
    const [, key, raw] = m;
    if (!FRONT_MATTER_KEYS.has(key)) throw new ArticleParseError(`unknown front matter key "${key}"`);
    const value = raw.trim();
    i++;
    if (value === '') {
      const nested: Record<string, string> = {};
      while (i < lines.length && /^\s+\S/.test(lines[i])) {
        const n = /^\s+([^:]+):\s*(.+)$/.exec(lines[i]);
        if (!n) throw new ArticleParseError(`bad nested line under "${key}" — "${lines[i]}"`);
        nested[n[1].trim()] = n[2].trim();
        i++;
      }
      out[key] = nested;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = value.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export const LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function linksIn(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.replace(/`[^`]*`/g, '').matchAll(LINK_PATTERN)) found.add(m[1].trim());
  return [...found];
}

export function imagesIn(body: string): string[] {
  return [...body.matchAll(/^!\[[^\]]*\]\((\S+)\)$/gm)].map(m => m[1]);
}

export function firstParagraph(body: string): string {
  const lines = body.split('\n');
  const para: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { if (para.length) break; else continue; }
    if (para.length === 0 && /^(#|[-*] |\d+\. |\||!\[)/.test(line)) break;
    para.push(line.trim());
  }
  return para.join(' ');
}

export function parseArticle(source: string, file?: string): Article {
  const where = file ? ` (${file})` : '';
  const text = source.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) throw new ArticleParseError(`no front matter${where}`);
  const end = text.indexOf('\n---', 4);
  if (end < 0) throw new ArticleParseError(`front matter never closes${where}`);
  const fm = parseFrontMatter(text.slice(4, end).split('\n'));
  const body = text.slice(end + 4).replace(/^\n+/, '').trimEnd();

  const str = (k: string): string | undefined => {
    const v = fm[k];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw new ArticleParseError(`"${k}" must be a single value${where}`);
    return v;
  };
  const id = str('id');
  const title = str('title');
  const kind = str('kind');
  if (!id) throw new ArticleParseError(`missing id${where}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new ArticleParseError(`id "${id}" is not kebab-case${where}`);
  if (!title) throw new ArticleParseError(`missing title${where}`);
  if (!kind || !(ARTICLE_KINDS as readonly string[]).includes(kind)) {
    throw new ArticleParseError(`kind "${kind}" is not one of ${ARTICLE_KINDS.join(', ')}${where}`);
  }
  const status = str('status');
  if (status && !(ARTICLE_STATUSES as readonly string[]).includes(status)) {
    throw new ArticleParseError(`status "${status}" is not one of ${ARTICLE_STATUSES.join(', ')}${where}`);
  }
  const aliases = fm['aliases'];
  if (aliases !== undefined && !Array.isArray(aliases)) throw new ArticleParseError(`aliases must be a [list]${where}`);
  const standard = fm['standard'];
  if (standard !== undefined && (typeof standard !== 'object' || Array.isArray(standard))) {
    throw new ArticleParseError(`standard must be an indented block${where}`);
  }
  if (standard && !fm['unit']) throw new ArticleParseError(`standard figures need a unit${where}`);
  const summary = firstParagraph(body);
  if (!summary) throw new ArticleParseError(`no opening paragraph to use as the summary${where}`);

  return {
    id, title, kind: kind as ArticleKind,
    panel: str('panel'),
    aliases: (aliases as string[] | undefined) ?? [],
    unit: str('unit'),
    standard: standard as Record<string, string> | undefined,
    status: status as ArticleStatus | undefined,
    summary, body, links: linksIn(body), images: imagesIn(body),
  };
}
