// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CERUTI_PANEL_IDS } from '../../enrico-ceruti-violin/ceruti-types';
import { firstParagraph, parseArticle } from './article';
import { ARTICLE_SOURCES } from './articles';
import { markdownToText, renderMarkdown } from './markdown';
import { DocsRegistry } from './registry';

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

  it('escapes html in the source', () => {
    expect(renderMarkdown('<script>x</script>', resolve)).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });

  it('reduces markdown to its words', () => {
    expect(markdownToText('A **b** `c` [[d|e]] [[f]]', s => s === 'f' ? 'Eff' : undefined)).toBe('A b c e Eff');
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

describe('the articles', () => {
  const registry = new DocsRegistry(ARTICLE_SOURCES);
  const articles = registry.all();

  // the specs are bundled for the browser, so node's fs can only be reached by a dynamic
  // import the bundler leaves alone; the environment line above is what makes it resolve
  it('every file on disk is in the index', async () => {
    const node = (name: string): Promise<any> => import(/* @vite-ignore */ name);
    const { readdirSync } = await node('node:fs');
    const { join } = await node('node:path');
    const dir = join((globalThis as any).process.cwd(), 'src', 'app', 'docs', 'wiki', 'articles');
    const onDisk = (readdirSync(dir, { recursive: true }) as string[]).filter(f => f.endsWith('.md')).sort();
    expect(Object.keys(ARTICLE_SOURCES).sort()).toEqual(onDisk);
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
    for (const a of articles) expect(a.summary.length, a.id).toBeLessThanOrEqual(240);
  });

  it('name real panels', () => {
    for (const a of articles) {
      if (a.panel) expect(CERUTI_PANEL_IDS as readonly string[], a.id).toContain(a.panel);
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
