import { Component, EventEmitter, Output, Input } from '@angular/core';
import packageJson from '../../../package.json';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  readonly appVersion: string = packageJson.version;

  @Input() selectedRecipe: string = 'Beard';
  @Input() nightMode = true;
  @Output() recipeChange = new EventEmitter<string>();
  @Output() nightModeChange = new EventEmitter<boolean>();

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

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }

  onNightModeToggle() {
    this.nightModeChange.emit(!this.nightMode);
  }

  aboutOpen = false;
  activeTab: 'about' | 'tutorial' | 'author' | 'version' | 'license' | '' = 'about';

  openAbout() {
    this.aboutOpen = true;
    this.activeTab = 'about';
  }

  closeAbout() {
    this.aboutOpen = false;
  }
}
