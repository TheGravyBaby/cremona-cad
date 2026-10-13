import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BOOTH_TABS, BoothTab } from '../pages';
import { DocPageComponent } from '../reader/doc-page';
import { DocsService } from '../reader/docs.service';
import { HistoryComponent } from '../history/history';
import { WikiComponent } from '../wiki/wiki';

// The info booth: every page in pages/, one tab per booth page plus the wiki and the history.
@Component({
  selector: 'app-info-booth',
  standalone: true,
  imports: [DocPageComponent, WikiComponent, HistoryComponent],
  templateUrl: './info-booth.html',
  styleUrls: ['./info-booth.css'],
  // bound here rather than in the service so the view refreshes when an address is pasted
  host: { '(window:hashchange)': 'docs.openFromAddress()' },
})
export class InfoBoothComponent {
  protected readonly docs = inject(DocsService);

  readonly tabs = BOOTH_TABS.map(id => ({
    id,
    label: id === 'wiki' ? 'Wiki' : id === 'history' ? 'History' : this.docs.registry.get(id)?.title ?? id,
  }));

  isOpen = false;
  activeTab: BoothTab = 'cremona-cad';

  constructor() {
    this.docs.opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(id => this.open(this.tabFor(id)));
    this.docs.openFromAddress();
  }

  private tabFor(id: string): BoothTab {
    const kind = this.docs.registry.get(id)?.kind;
    if (kind === 'release') return 'history';
    if (kind === 'booth' && (BOOTH_TABS as readonly string[]).includes(id)) return id as BoothTab;
    return 'wiki';
  }

  // every page's links are plain anchors to #doc/<id>; catch them here rather than letting the
  // browser scroll to a fragment that isn't there, and turn to whichever tab shows that page
  onPageClick(e: Event): void {
    const a = (e.target as Element | null)?.closest?.('a.doc-link');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href')?.replace(/^#doc\//, '');
    if (id) this.docs.open(id);
  }

  open(tab: BoothTab = 'cremona-cad') {
    this.isOpen = true;
    this.select(tab);
  }

  // the wiki and the history put their own page in the address bar
  select(tab: BoothTab) {
    this.activeTab = tab;
    if (tab !== 'wiki' && tab !== 'history') this.docs.shown(tab);
  }

  close() {
    this.isOpen = false;
    this.docs.shown(null);
  }
}
