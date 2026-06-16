import { Component } from '@angular/core';
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
