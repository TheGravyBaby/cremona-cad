// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { VIOLIN_FAMILY_PANEL_IDS } from '../../recipes/violin-family/violin-family-types';
import { firstParagraph, inWiki, parseArticle } from './article';
import { BOOTH_TABS, PAGE_SOURCES, WIKI } from '../pages';
import { componentProblems, markdownToText, renderMarkdown, renderPage } from './markdown';
import { DocsRegistry, idOfPath } from './registry';

const sample = (extra = '', body = 'The first paragraph.\n\nMore, with a [[other]] link.') =>
  `---\nid: thing\ntitle: Thing\nkind: concept\n${extra}---\n${body}\n`;

describe('parseArticle', () => {
  it('reads the front matter and takes the opening paragraph as the summary', () => {
    const a = parseArticle(sample('aliases: [one, two]\nunit: mm\nstandard:\n  violin: 195\n  cello: 400\n'));
    expect(a.id).toBe('thing');
    expect(a.aliases).toEqual(['one', 'two']);
    expect(a.standard).toEqual({ violin: '195', cello: '400' });
    expect(a.summary).toBe('The first paragraph.');
    expect(a.links).toEqual(['other']);
  });

  it('rejects what a reader would trip on', () => {
    expect(() => parseArticle('no front matter')).toThrow(/front matter/);
    expect(() => parseArticle(sample('colour: red\n'))).toThrow(/unknown front matter key/);
    expect(() => parseArticle(sample().replace('kind: concept', 'kind: essay'))).toThrow(/kind/);
    expect(() => parseArticle(sample().replace('id: thing', 'id: Thing_1'))).toThrow(/kebab/);
    expect(() => parseArticle(sample('standard:\n  violin: 1\n'))).toThrow(/unit/);
    expect(() => parseArticle(sample('', '## Heading first\n\ntext'))).toThrow(/summary/);
    expect(() => parseArticle(sample('date: Sep 14, 2026\n'))).toThrow(/date/);
  });

  it('joins a wrapped opening paragraph and stops at the blank line', () => {
    expect(firstParagraph('one\ntwo\n\nthree')).toBe('one two');
  });
});

describe('renderMarkdown', () => {
  const resolve = (slug: string) => slug === 'known' ? { href: '#doc/known', title: 'Known thing' } : null;

  it('renders the subset the articles use', () => {
    const html = renderMarkdown('## Head\n\nA *b* **c** `d<e>`.\n\n- one\n- two\n\n| k | v |\n|---|---|\n| a | 1 |', resolve);
    expect(html).toContain('<h4>Head</h4>');
    expect(html).toContain('<em>b</em> <strong>c</strong> <code>d&lt;e&gt;</code>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<table><thead><tr><th>k</th><th>v</th></tr></thead><tbody><tr><td>a</td><td>1</td></tr></tbody></table>');
  });

  it('turns wiki links into anchors and flags the ones that resolve to nothing', () => {
    const html = renderMarkdown('See [[known]], [[known|it]] and [[lost]].', resolve);
    expect(html).toContain('<a class="doc-link" href="#doc/known">Known thing</a>');
    expect(html).toContain('<a class="doc-link" href="#doc/known">it</a>');
    expect(html).toContain('<span class="doc-link-missing" title="no article: lost">lost</span>');
  });

  it('renders an image on its own line as a captioned figure', () => {
    expect(renderMarkdown('![A *caption*](docs/x.svg)', resolve))
      .toBe('<figure><img src="docs/x.svg" alt="A *caption*"><figcaption>A <em>caption</em></figcaption></figure>');
    expect(() => parseArticle(sample('', '![pic](docs/x.svg)\n\nThe summary.'))).toThrow(/summary/);
  });

  it('gives a table a header only when a separator follows its first row', () => {
    expect(renderMarkdown('|---|---|\n| a | 1 |\n| b | 2 |', resolve))
      .toBe('<table><tbody><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody></table>');
  });

  it('draws a known :icon: and leaves any other colon pair as text', () => {
    const html = renderMarkdown(':line: Line, :nothing: and 12:30:45', resolve);
    expect(html).toContain('<svg');
    expect(html).toContain('class="doc-icon"');
    expect(html).toContain(':nothing: and 12:30:45');
    expect(markdownToText(':line: Line')).toBe('Line');
  });

  it('escapes html in the source', () => {
    expect(renderMarkdown('<script>x</script>', resolve)).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('reduces markdown to its words', () => {
    expect(markdownToText('A **b** `c` [[d|e]] [[f]]', s => s === 'f' ? 'Eff' : undefined)).toBe('A b c e Eff');
  });
});

describe('components', () => {
  const resolve = () => null;

  it('split a page into prose and the components between it', () => {
    const pieces = renderPage('Before.\n\n<carousel>\n![One](a.png)\n\n![*Two*](b.png)\n</carousel>\n\nAfter.', resolve);
    expect(pieces.map(p => p.kind)).toEqual(['prose', 'carousel', 'prose']);
    const carousel = pieces[1];
    expect(carousel.kind === 'carousel' && carousel.slides.map(s => s.src)).toEqual(['a.png', 'b.png']);
    expect(carousel.kind === 'carousel' && carousel.slides[1].caption).toBe('<em>Two</em>');
  });

  it('reject a tag nobody defined, one left open, and the wrong thing inside', () => {
    expect(componentProblems('<carousel>\n![One](a.png)\n</carousel>')).toEqual([]);
    expect(componentProblems('<gallery>\n![One](a.png)\n</gallery>')).toEqual([expect.stringMatching(/not a component/)]);
    expect(componentProblems('<carousel>\n![One](a.png)')).toEqual([expect.stringMatching(/opened and closed/)]);
    expect(componentProblems('<carousel>\nwords\n</carousel>')).toEqual([expect.stringMatching(/images only/)]);
  });

  it('stay out of the summary and the search text', () => {
    expect(firstParagraph('<carousel>\n![One](a.png)\n</carousel>\n\nThe summary.')).toBe('');
    expect(markdownToText('<carousel>\n![One](a.png)\n</carousel>')).toBe('One');
  });
});

describe('DocsRegistry', () => {
  it('collects problems instead of throwing', () => {
    const r = new DocsRegistry({
      'thing.md': sample(),
      'bad.md': 'nothing here',
      'deep/wrong-name.md': sample().replace('id: thing', 'id: right-name'),
    });
    expect(r.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/bad\.md/),
      expect.stringMatching(/deep\/wrong-name\.md.*does not match/),
      expect.stringMatching(/thing: links to "other"/),
    ]));
    expect(r.has('thing')).toBe(true);
  });

  it('searches titles and aliases ahead of body text', () => {
    const r = new DocsRegistry({
      'a.md': '---\nid: a\ntitle: Alpha\nkind: concept\naliases: [first]\n---\nMentions beta.\n',
      'b.md': '---\nid: b\ntitle: Beta\nkind: concept\n---\nNothing.\n',
    });
    expect(r.search('beta').map(a => a.id)).toEqual(['b', 'a']);
    expect(r.search('first').map(a => a.id)).toEqual(['a']);
    expect(r.summary('missing')).toBe('');
  });
});

describe('the pages', () => {
  const registry = new DocsRegistry(PAGE_SOURCES);
  const articles = registry.all();

  // the specs are bundled for the browser, so node's fs can only be reached by a dynamic
  // import the bundler leaves alone; the environment line above is what makes it resolve
  it('every file on disk is in the index', async () => {
    const node = (name: string): Promise<any> => import(/* @vite-ignore */ name);
    const { readdirSync } = await node('node:fs');
    const { join } = await node('node:path');
    const dir = join((globalThis as any).process.cwd(), 'src', 'app', 'docs', 'pages');
    const onDisk = (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.md')).sort();
    expect(Object.keys(PAGE_SOURCES).sort()).toEqual(onDisk);
  });

  it('show only images that exist under public/', async () => {
    const node = (name: string): Promise<any> => import(/* @vite-ignore */ name);
    const { existsSync } = await node('node:fs');
    const { join } = await node('node:path');
    for (const a of articles) {
      for (const img of a.images) {
        expect(existsSync(join((globalThis as any).process.cwd(), 'public', img)), `${a.id} shows ${img}`).toBe(true);
      }
    }
  });

  it('parse, match their file names and link only to articles that exist', () => {
    expect(registry.problems).toEqual([]);
  });

  it('keep the summary short enough for a tooltip', () => {
    for (const a of articles.filter(inWiki)) expect(a.summary.length, a.id).toBeLessThanOrEqual(240);
  });

  it('file every wiki page, and only wiki pages, under a wiki category', () => {
    const filed = WIKI.flatMap(c => [...(c.overview ? [c.overview] : []), ...c.pages]).map(f => idOfPath(f.path));
    expect(filed.map(id => registry.get(id)).filter(a => !a || !inWiki(a))).toEqual([]);
    expect(articles.filter(inWiki).map(a => a.id).filter(id => !filed.includes(id))).toEqual([]);
    expect(WIKI[0].overview, 'the wiki opens on the first category\'s overview').toBeTruthy();
  });

  it('give every booth tab but the wiki and the history a booth page', () => {
    for (const tab of BOOTH_TABS) {
      if (tab !== 'wiki' && tab !== 'history') expect(registry.get(tab)?.kind, tab).toBe('booth');
    }
  });

  it('name real panels', () => {
    for (const a of articles) {
      if (a.panel) expect(VIOLIN_FAMILY_PANEL_IDS as readonly string[], a.id).toContain(a.panel);
      if (a.kind === 'field') expect(a.panel, `${a.id} is a field with no panel`).toBeTruthy();
    }
  });

  it('give standard figures as a number or a range', () => {
    for (const a of articles) {
      for (const [k, v] of Object.entries(a.standard ?? {})) {
        expect(v, `${a.id}.${k}`).toMatch(/^\d+(\.\d+)?(–\d+(\.\d+)?)?$/);
      }
    }
  });

  it.todo('every panel has a panel article (phase 2)');
});
