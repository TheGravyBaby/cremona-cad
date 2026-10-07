import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ARTICLE_SOURCES } from './articles';
import { DocsRegistry } from './registry';

export const wiki = new DocsRegistry(ARTICLE_SOURCES);

// What a panel reaches for: `summary(id)` behind a tooltip, `open(id)` behind an ⓘ. The about
// modal listens for opens and shows the wiki at that article.
@Injectable({ providedIn: 'root' })
export class WikiService {
  readonly registry = wiki;
  private readonly opens = new Subject<string>();
  readonly opens$: Observable<string> = this.opens.asObservable();

  summary(id: string): string { return wiki.summary(id); }

  open(id: string): void { this.opens.next(id); }
}
