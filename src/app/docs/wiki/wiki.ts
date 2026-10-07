import { Component, DestroyRef, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Article, ArticleKind } from './article';
import { WikiService } from './wiki.service';
import { CERUTI_PANEL_IDS } from '../../enrico-ceruti-violin/ceruti-types';

interface NavGroup { label: string; articles: Article[] }

// The wiki: a contents list down the side, one article at a time beside it. Fields aren't in
// the contents, which would run to a hundred lines; each panel's page lists its own, and search
// finds the rest.
@Component({
  selector: 'app-wiki',
  standalone: true,
  imports: [],
  templateUrl: './wiki.html',
  styleUrls: ['./wiki.css'],
})
export class WikiComponent {
  private readonly docs = inject(WikiService);
  readonly registry = this.docs.registry;

  readonly current = signal<string>('style');
  readonly query = signal('');
  readonly history = signal<string[]>([]);

  @ViewChild('page') private page?: ElementRef<HTMLElement>;

  readonly article = computed(() => this.registry.get(this.current()));
  readonly html = computed(() => this.registry.html(this.current()));
  readonly fields = computed(() => {
    const a = this.article();
    return a?.kind === 'panel' && a.panel ? this.registry.onPanel(a.panel) : [];
  });
  readonly backlinks = computed(() => this.registry.backlinks(this.current()));
  readonly results = computed(() => this.registry.search(this.query()));
  readonly measurements = computed(() => this.registry.measurements());

  readonly groups: NavGroup[] = [
    { label: 'Panels', articles: this.panelsInOrder() },
    { label: 'Concepts', articles: this.registry.byKind('concept') },
    { label: 'Tools', articles: this.registry.byKind('tool') },
    { label: 'Conditions', articles: this.registry.byKind('condition') },
    { label: 'About these docs', articles: this.registry.byKind('meta') },
  ].filter(g => g.articles.length);

  constructor() {
    this.docs.opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(id => this.show(id));
  }

  private panelsInOrder(): Article[] {
    return CERUTI_PANEL_IDS
      .map(id => this.registry.panelArticle(id))
      .filter((a): a is Article => !!a);
  }

  show(id: string): void {
    if (!this.registry.has(id) || id === this.current()) return;
    this.history.update(h => [...h, this.current()]);
    this.current.set(id);
    this.query.set('');
    if (this.page) this.page.nativeElement.scrollTop = 0;
  }

  back(): void {
    const h = this.history();
    if (!h.length) return;
    this.current.set(h[h.length - 1]);
    this.history.set(h.slice(0, -1));
  }

  // links in the rendered article are plain anchors to #doc/<id>; catch them here rather than
  // letting the browser scroll the page to a fragment that isn't there
  onPageClick(e: Event): void {
    const a = (e.target as Element | null)?.closest?.('a.doc-link') as HTMLAnchorElement | null;
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href')?.replace(/^#doc\//, '');
    if (id) this.show(id);
  }

  kindLabel(kind: ArticleKind): string {
    return { concept: 'Concept', field: 'Field', panel: 'Panel', tool: 'Tool', condition: 'Condition', howto: 'How to', meta: '' }[kind];
  }

  standardRows(a: { standard?: Record<string, string> }): { key: string; value: string }[] {
    return Object.entries(a.standard ?? {}).map(([key, value]) => ({ key, value }));
  }
}
