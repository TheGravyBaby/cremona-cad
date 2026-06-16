import { Component, EventEmitter, Output, Input, ViewChild, ElementRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeInterface } from '../models/types';
import { MessageService } from '../shared/message.service';
import { RECIPE_SCHEMA_VERSION } from '../enrico-ceruti-violin/ceruti-types';
import packageJson from '../../../package.json';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  readonly appVersion: string = packageJson.version;
  private messages = inject(MessageService);

  @Input() selectedRecipe: string = 'Beard';
  @Input() nightMode = true;
  @Output() recipeChange = new EventEmitter<string>();
  @Output() newFile = new EventEmitter<boolean>();
  @Output() loadFile = new EventEmitter<RecipeInterface>();
  @Output() saveFile = new EventEmitter<void>();
  @Output() nightModeChange = new EventEmitter<boolean>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @Input() templateOptions: Array<{ key: string; label: string }> = [];
  @Output() templateSelect = new EventEmitter<string>();
  activeTemplateKey = '';

  @Input() set syncedTemplateKey(key: string) {
    this.activeTemplateKey = key;
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

  onNewClick() {
    const confirmed = confirm('Start a new file? Any unsaved work will be lost.');
    if (confirmed) {
      this.newFile.emit(true);
    }
  }

  onSaveClick() {
    this.saveFile.emit();
  }

  onTemplateSelect(key: string): void {
    if (!key) return;
    this.activeTemplateKey = key;
    this.templateSelect.emit(key);
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

  triggerFilePick() {
    this.fileInput.nativeElement.click();
  }

  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const data = JSON.parse(text) as RecipeInterface;

        const fileRecipe = (data.recipeName ?? '').toLowerCase();
        const selected = (this.selectedRecipe ?? '').toLowerCase();

        if (fileRecipe !== selected) {
          alert(`That file is for "${fileRecipe}", but you currently selected "${selected}".`);
          input.value = ''; // allow re-picking same file
          return;
        }

        if (data.version && data.version !== RECIPE_SCHEMA_VERSION) {
          this.messages.warn({
            title: 'Older file format',
            message: `This file uses schema version "${data.version}" (current: "${RECIPE_SCHEMA_VERSION}"). It has been loaded, but some fields may be missing or behave unexpectedly.`,
            autoDismiss: false,
          });
        }

        this.loadFile.emit(data);
      } catch (e) {
        console.error('Failed to load/parse recipe file:', e);
        alert('Could not read that file. Is it valid JSON?');
      } finally {
        input.value = ''; // allow re-picking same file
      }
    };

    reader.readAsText(file);
  }
}
