import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { PAGE_SOURCES } from '../pages';
import { DocsRegistry } from './registry';

export const docs = new DocsRegistry(PAGE_SOURCES);

// What a panel reaches for: `summary(id)` behind a tooltip, `open(id)` behind an ⓘ. The info
// booth listens for opens and turns to whichever tab shows that page. `requested` is the last one
// asked for, so a tab that opens in answer to it can start there.
//
// The address bar follows the page shown, as #doc/<id>, the same href a link in a page carries, so
// any page can be linked from outside and opens the booth there. It's replaced rather than pushed,
// so paging through the booth doesn't fill the browser's back button.
@Injectable({ providedIn: 'root' })
export class DocsService {
  readonly registry = docs;
  readonly requested = signal<string | null>(null);
  private readonly opens = new Subject<string>();
  readonly opens$: Observable<string> = this.opens.asObservable();

  summary(id: string): string { return docs.summary(id); }

  openFromAddress(): void {
    const id = decodeURIComponent(/^#doc\/(.+)$/.exec(location.hash)?.[1] ?? '');
    if (docs.has(id)) this.open(id);
  }

  shown(id: string | null): void {
    history.replaceState(history.state, '', location.pathname + location.search + (id ? `#doc/${id}` : ''));
  }

  open(id: string): void {
    this.requested.set(id);
    this.opens.next(id);
  }
}
