import { Component, DestroyRef, inject, isDevMode } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import changelog from '../../../../CHANGELOG.md';
import { GuideComponent } from '../guide/guide';
import { renderMarkdown } from '../wiki/markdown';
import { WikiService } from '../wiki/wiki.service';
import { WikiComponent } from '../wiki/wiki';

export type HelpTab = 'guide' | 'wiki' | 'changelog' | 'about';

@Component({
  selector: 'app-help-dialog',
  standalone: true,
  imports: [GuideComponent, WikiComponent],
  templateUrl: './help-dialog.html',
  styleUrls: ['./help-dialog.css'],
})
export class HelpDialogComponent {
  readonly changelogHtml = renderMarkdown(changelog.replace(/^# .*\n/, ''), () => null);

  isOpen = false;
  activeTab: HelpTab = 'guide';

  // the wiki is a preview of what the Documentation tab becomes; it shows on a dev build only
  readonly showWiki = isDevMode();

  constructor() {
    inject(WikiService).opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.open('wiki'));
  }

  images = [
    {
      src: 'CerutiDrawing.webp',
      alt: '',
      caption: 'A drawing from the Cremonese workshop of Enrico Ceruti, early 19th century.'
    },
    {
      src: 'CC_Drawing.png',
      alt: '',
      caption: 'A CremonaCad drawing using the similar arc segments.'
    }
  ];
  currentImageIndex = 0;

  nextImage() {
    this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
  }

  previousImage() {
    this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
  }

  get currentImage() {
    return this.images[this.currentImageIndex];
  }

  open(tab: HelpTab = 'guide') {
    this.isOpen = true;
    this.activeTab = tab;
  }

  close() {
    this.isOpen = false;
  }
}
