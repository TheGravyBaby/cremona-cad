// The subset of Markdown the articles use: headings, paragraphs, lists, tables, and inline code,
// bold, italic, external links and [[wiki links]]. Anything else renders as text. Output goes
// through Angular's [innerHTML] sanitiser, so the article html carries nothing it would strip.

import { LINK_PATTERN } from './article';

export type LinkResolver = (slug: string) => { href: string; title: string } | null;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(text: string, resolve: LinkResolver): string {
  // code spans are opaque, so split them out before any other inline rule runs
  return text.split(/(`[^`]*`)/).map(part => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    }
    let s = escapeHtml(part);
    s = s.replace(LINK_PATTERN, (_, slug: string, label?: string) => {
      const target = resolve(slug.trim());
      const text = label?.trim() || target?.title || slug.trim();
      return target
        ? `<a class="doc-link" href="${target.href}">${text}</a>`
        : `<span class="doc-link-missing" title="no article: ${slug.trim()}">${text}</span>`;
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return s;
  }).join('');
}

export function renderMarkdown(md: string, resolve: LinkResolver): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let table: string[][] | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), resolve)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i, resolve)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flushTable = () => {
    if (table && table.length) {
      const [head, ...rows] = table;
      const th = head.map(c => `<th>${inline(c, resolve)}</th>`).join('');
      const tr = rows.map(r => `<tr>${r.map(c => `<td>${inline(c, resolve)}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`);
    }
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushAll();
      // the page title is the article's h3, so a body heading starts at h4 whether written
      // with one hash or two
      const level = Math.min(Math.max(heading[1].length, 2) + 2, 6);
      out.push(`<h${level}>${inline(heading[2], resolve)}</h${level}>`);
      continue;
    }

    // an image on a line of its own is a figure; its alt text is the caption
    const figure = /^!\[([^\]]*)\]\((\S+)\)$/.exec(line.trim());
    if (figure) {
      flushAll();
      const caption = figure[1] ? `<figcaption>${inline(figure[1], resolve)}</figcaption>` : '';
      out.push(`<figure><img src="${escapeHtml(figure[2])}" alt="${escapeHtml(figure[1])}">${caption}</figure>`);
      continue;
    }

    if (line.startsWith('|')) {
      flushPara(); flushList();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) continue;
      (table ??= []).push(cells);
      continue;
    }
    flushTable();

    const ul = /^[-*]\s+(.+)$/.exec(line);
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      (list ??= { tag, items: [] }).items.push((ul ?? ol)![1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return out.join('\n');
}

// Markdown reduced to the words, for a tooltip or a search index.
export function markdownToText(md: string, titleFor: (slug: string) => string | undefined = () => undefined): string {
  return md
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^!\[([^\]]*)\]\(\S+\)$/gm, '$1')
    .replace(LINK_PATTERN, (_, slug: string, label?: string) => label?.trim() || titleFor(slug.trim()) || slug.trim())
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
