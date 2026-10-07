import { Component, DestroyRef, ElementRef, EventEmitter, Input, Output, ViewChild, inject, isDevMode } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import packageJson from '../../../package.json';
import { WikiService } from '../docs/wiki/wiki.service';
import { WikiComponent } from '../docs/wiki/wiki';

export type ThemeMode = 'auto' | 'day' | 'night';

@Component({
  selector: 'app-about-modal',
  standalone: true,
  imports: [WikiComponent],
  templateUrl: './about-modal.html',
  styleUrls: ['./about-modal.css'],
})
export class AboutModalComponent {
  readonly appVersion: string = packageJson.version;

  @Input() themeMode: ThemeMode = 'auto';
  @Output() themeModeChange = new EventEmitter<ThemeMode>();

  readonly themeOptions: { id: ThemeMode; label: string; hint: string }[] = [
    { id: 'day', label: 'Day', hint: 'Light interface' },
    { id: 'auto', label: 'Auto', hint: 'Day from 7:00 to 19:00, by the time you open the app' },
    { id: 'night', label: 'Night', hint: 'Dark interface' },
  ];
  @Input() barPinned = true;
  @Output() barPinnedChange = new EventEmitter<boolean>();

  isOpen = false;
  activeTab: 'about' | 'tutorial' | 'wiki' | 'author' | 'settings' | 'version' | '' = 'about';

  // the wiki is a preview of what the Documentation tab becomes; it shows on a dev build only
  readonly showWiki = isDevMode();

  constructor() {
    inject(WikiService).opens$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.isOpen = true;
      this.activeTab = 'wiki';
    });
  }

  /** Tutorial topics, shown one at a time from the sidebar. Grouped by what they cover:
   *  the canvas itself, then the design sections in the order the recipe builds them. */
  readonly tutorialGroups: { label: string; topics: { id: string; label: string }[] }[] = [
    {
      label: 'Canvas',
      topics: [
        { id: 'basics', label: 'Basics' },
        { id: 'drawing', label: 'Drawing Tools' },
        { id: 'images', label: 'Reference Images' },
      ],
    },
    {
      label: 'Outline',
      topics: [
        { id: 'base', label: 'Base Measurements' },
        { id: 'bouts', label: 'Main Bouts' },
        { id: 'corners', label: 'Corners' },
        { id: 'center', label: 'Center Bout' },
        { id: 'outer', label: 'Outer Path' },
        { id: 'purfling', label: 'Purfling' },
      ],
    },
    {
      label: 'Arching',
      topics: [
        { id: 'fluting', label: 'Fluting Channel' },
        { id: 'long', label: 'Long Arching' },
        { id: 'cross', label: 'Cross Arching' },
      ],
    },
    {
      label: 'F-Holes',
      topics: [
        { id: 'fHolePlacement', label: 'F-Hole Placement' },
        { id: 'fHoleContours', label: 'F-Hole Contours' },
      ],
    },
    {
      label: 'Output',
      topics: [
        { id: 'mould', label: 'Mould' },
        { id: 'export', label: 'Export' },
      ],
    },
  ];

  tutorialTopic = 'basics';

  @ViewChild('topicScroll') private topicScroll?: ElementRef<HTMLElement>;

  selectTopic(id: string) {
    this.tutorialTopic = id;
    if (this.topicScroll) this.topicScroll.nativeElement.scrollTop = 0;
  }

  // Image gallery properties
  images = [
    {
      src: 'CerutiDrawing.png',
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

  open(tab: 'about' | 'tutorial' = 'about') {
    this.isOpen = true;
    this.activeTab = tab;
  }

  close() {
    this.isOpen = false;
  }
}
