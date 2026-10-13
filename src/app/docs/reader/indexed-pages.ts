import { Component, ElementRef, ViewChild, effect, input, output } from '@angular/core';

export interface IndexEntry { id: string; title: string; note?: string }
export interface IndexGroup { label?: string; entries: IndexEntry[] }

// A contents list down the side and one page beside it, shared by the wiki and the history. The
// page is projected, and how it reads belongs to the doc page.
@Component({
  selector: 'app-indexed-pages',
  standalone: true,
  templateUrl: './indexed-pages.html',
  styleUrls: ['./indexed-pages.css'],
})
export class IndexedPagesComponent {
  readonly groups = input.required<IndexGroup[]>();
  readonly current = input.required<string>();
  readonly label = input('Contents');
  readonly empty = input('');
  readonly picked = output<string>();

  @ViewChild('page', { static: true }) private page!: ElementRef<HTMLElement>;

  constructor() {
    effect(() => {
      this.current();
      this.page.nativeElement.scrollTop = 0;
    });
  }
}
