import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Article, ArticleKind, inWiki } from '../reader/article';
import { DocPageComponent } from '../reader/doc-page';
import { DocsService } from '../reader/docs.service';
import { IndexGroup, IndexedPagesComponent } from '../reader/indexed-pages';
import { VIOLIN_FAMILY_PANEL_IDS } from '../../recipes/violin-family/violin-family-types';

// The wiki: a contents list down the side, one article at a time beside it. Fields aren't in
// the contents, which would run to a hundred lines; each panel's page lists its own, and search
// finds the rest.
@Component({
  selector: 'app-wiki',
  standalone: true,
  imports: [IndexedPagesComponent, DocPageComponent],
  templateUrl: './wiki.html',
  styleUrls: ['./wiki.css'],
})
export class WikiComponent {
  private readonly docs = inject(DocsService);
  readonly registry = this.docs.registry;

  readonly current = signal<string>(this.startAt());
  readonly query = signal('');
  readonly history = signal<string[]>([]);

  readonly article = computed(() => this.registry.get(this.current()));
  readonly fields = computed(() => {
    const a = this.article();
    return a?.kind === 'panel' && a.panel ? this.registry.onPanel(a.panel) : [];
  });
  readonly backlinks = computed(() => this.registry.backlinks(this.current()));
  readonly results = computed(() => this.registry.search(this.query()).filter(inWiki));
  readonly measurements = computed(() => this.registry.measurements());

  private readonly contents: IndexGroup[] = [
    { label: 'Panels', entries: this.panelsInOrder() },
    { label: 'Concepts', entries: this.registry.byKind('concept') },
    { label: 'Tools', entries: this.registry.byKind('tool') },
    { label: 'Conditions', entries: this.registry.byKind('condition') },
    { label: 'About these docs', entries: this.registry.byKind('meta') },
  ].filter(g => g.entries.length);

  readonly nav = computed<IndexGroup[]>(() => {
    if (!this.query()) return this.contents;
    const hits = this.results().map(a => ({ id: a.id, title: a.title, note: this.kindLabel(a.kind) }));
    return hits.length ? [{ entries: hits }] : [];
  });

  constructor() {
    this.docs.opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(id => this.show(id));
    effect(() => this.docs.shown(this.current()));
  }

  private startAt(): string {
    const asked = this.registry.get(this.docs.requested() ?? '');
    return asked && inWiki(asked) ? asked.id : 'style';
  }

  private panelsInOrder(): Article[] {
    return VIOLIN_FAMILY_PANEL_IDS
      .map(id => this.registry.panelArticle(id))
      .filter((a): a is Article => !!a);
  }

  show(id: string): void {
    const a = this.registry.get(id);
    if (!a || !inWiki(a) || id === this.current()) return;
    this.history.update(h => [...h, this.current()]);
    this.current.set(id);
    this.query.set('');
  }

  back(): void {
    const h = this.history();
    if (!h.length) return;
    this.current.set(h[h.length - 1]);
    this.history.set(h.slice(0, -1));
  }

  kindLabel(kind: ArticleKind): string {
    return { concept: 'Concept', field: 'Field', panel: 'Panel', tool: 'Tool', condition: 'Condition', howto: 'How to', meta: '', booth: '', release: 'Release' }[kind];
  }

  standardRows(a: { standard?: Record<string, string> }): { key: string; value: string }[] {
    return Object.entries(a.standard ?? {}).map(([key, value]) => ({ key, value }));
  }
}
