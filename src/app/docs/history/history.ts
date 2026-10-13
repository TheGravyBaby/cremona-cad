import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Article } from '../reader/article';
import { DocPageComponent } from '../reader/doc-page';
import { DocsService } from '../reader/docs.service';
import { IndexGroup, IndexedPagesComponent } from '../reader/indexed-pages';

// The release pages, newest first and grouped by month; one without a date is still unreleased.
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [IndexedPagesComponent, DocPageComponent],
  templateUrl: './history.html',
  styles: [':host { display: contents; }'],
})
export class HistoryComponent {
  private readonly docs = inject(DocsService);

  private readonly releases: Article[] = this.docs.registry.byKind('release')
    .sort((a, b) => (b.date ?? '9999').localeCompare(a.date ?? '9999'));

  readonly current = signal(this.startAt());

  readonly groups: IndexGroup[] = this.releases.reduce<IndexGroup[]>((groups, r) => {
    const label = r.date ? this.format(r.date, { month: 'short', year: 'numeric' }) : 'Unreleased';
    const entry = { id: r.id, title: r.title, note: r.date ? this.format(r.date, { month: 'short', day: 'numeric' }) : undefined };
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
    return groups;
  }, []);

  constructor() {
    this.docs.opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(id => {
      if (this.releases.some(r => r.id === id)) this.current.set(id);
    });
    effect(() => this.docs.shown(this.current()));
  }

  private startAt(): string {
    const asked = this.docs.requested();
    return this.releases.find(r => r.id === asked)?.id ?? this.releases[0]?.id ?? '';
  }

  date(id: string): string {
    const d = this.docs.registry.get(id)?.date;
    return d ? this.format(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  // a bare YYYY-MM-DD parses as UTC midnight, so it's formatted in UTC too or it slips a day west
  private format(date: string, opts: Intl.DateTimeFormatOptions): string {
    return new Date(date).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
  }
}
