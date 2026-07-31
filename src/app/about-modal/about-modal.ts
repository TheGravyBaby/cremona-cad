import { Component, ElementRef, ViewChild } from '@angular/core';
import packageJson from '../../../package.json';

@Component({
  selector: 'app-about-modal',
  standalone: true,
  imports: [],
  templateUrl: './about-modal.html',
  styleUrls: ['./about-modal.css'],
})
export class AboutModalComponent {
  readonly appVersion: string = packageJson.version;

  isOpen = false;
  activeTab: 'about' | 'tutorial' | 'author' | 'version' | 'license' | '' = 'about';

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

  open() {
    this.isOpen = true;
    this.activeTab = 'about';
  }

  close() {
    this.isOpen = false;
  }
}
