import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DocCarouselComponent } from './doc-carousel';
import { DocsService } from './docs.service';

// One page of the booth: its title, its rendered body and how every page reads. Whatever a tab
// adds goes in a slot: [pageLead] before the title, [pageBadge] after it, [pageAside] above the
// body, anything else below it.
@Component({
  selector: 'app-doc-page',
  standalone: true,
  imports: [DocCarouselComponent],
  templateUrl: './doc-page.html',
  styleUrls: ['./doc-page.css'],
})
export class DocPageComponent {
  private readonly registry = inject(DocsService).registry;
  private readonly sanitizer = inject(DomSanitizer);

  readonly id = input.required<string>();
  readonly article = computed(() => this.registry.get(this.id()));
  // renderMarkdown escapes every character of the source, and the sanitiser would strip the icons
  readonly pieces = computed(() => this.registry.pieces(this.id()).map(piece =>
    piece.kind === 'prose' ? { ...piece, html: this.sanitizer.bypassSecurityTrustHtml(piece.html) } : piece));
}
