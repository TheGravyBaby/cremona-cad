import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { setGlobalEmitter } from './shared/message-emitter';
import { MessageService } from './shared/message.service';
import { TopBarComponent } from './top-bar/top-bar';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { NamedReferenceImage } from './models/types';
import { Pt } from './models/types';
import { normalizeReferenceImages } from './helpers/referenceImages';
import { CerutiViolin } from './enrico-ceruti-violin/ceruti-violin';
import { HelloRecipe } from './hello-recipe/hello-recipe';
import { MessageCenterComponent } from './shared/message-center.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, DraftCanvasComponent, CerutiViolin, HelloRecipe, MessageCenterComponent],
  template: `
    <div class="app">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      [nightMode]="nightMode"
      (recipeChange)="selectRecipe($event)"
      (nightModeChange)="onNightModeChange($event)">
    </app-top-bar>
    <div class="top-spacer" aria-hidden="true"></div>

      <div class="main">
        <app-draft-canvas class="canvas"
          [draftFunctions]="draftArgs()"
          [referenceImages]="referenceImages()"
          (referenceImagesChange)="onReferenceImagesChange($event)"
          [setCameraBounds]="bounds"
          >
        </app-draft-canvas>

        @if (selectedRecipe == "enrico-ceruti-violin") {
         <app-ceruti-violin class="sidebar"
          (draftChange)="onDraftChange($event)"
          (setBounds)="bounds=$event"
          [referenceImages]="referenceImages()"
          [cameraBounds]="bounds"
          [nightMode]="nightMode"
          (referenceImagesChange)="onReferenceImagesChange($event)">
        </app-ceruti-violin>
        }

        @if (selectedRecipe == "hello-recipe") {
         <app-hello-recipe class="sidebar"
          (draftChange)="onDraftChange($event)"
          (setBounds)="bounds=$event"
          [referenceImages]="referenceImages()"
          [cameraBounds]="bounds"
          (referenceImagesChange)="onReferenceImagesChange($event)">
        </app-hello-recipe>
        }


      </div>
      <app-message-center></app-message-center>
    </div>
  `,
  styleUrl: './app.css',
})

export class App {
  private readonly doc = inject(DOCUMENT);
  // inject MessageService via Angular's injector
  private messageService = inject(MessageService);

  draftArgs = signal<Array<(g: any, ui: any) => void>>([]);
  selectedRecipe: string = 'enrico-ceruti-violin';
  bounds: {pt1: Pt, pt2: Pt} | null = null;
  sessionData = sessionStorage.getItem('recipeData');

  referenceImages = signal<NamedReferenceImage[]>(normalizeReferenceImages(
    this.sessionData ? JSON.parse(this.sessionData) : null
  ));

  nightMode = true;

  constructor() {
    const savedTheme = localStorage.getItem('themeMode');
    this.nightMode = savedTheme !== 'day';
    this.applyThemeClass();

    // wire global emitter to MessageService
    setGlobalEmitter((m) => this.messageService.emit(m));
  }

  onNightModeChange(enabled: boolean) {
    this.nightMode = enabled;
    localStorage.setItem('themeMode', enabled ? 'night' : 'day');
    this.applyThemeClass();
  }

  private applyThemeClass() {
    this.doc.documentElement.classList.toggle('day-mode', !this.nightMode);
  }

  onDraftChange(fns: Array<(g: any, ui: any) => void>) {
    this.draftArgs.set(fns);
  }

  onReferenceImagesChange(imgs: NamedReferenceImage[]) {
    this.referenceImages.set(imgs ?? []);
  }

  /** Switches the active recipe, clearing state that belonged to the old one. */
  selectRecipe(recipe: string): void {
    if (recipe === this.selectedRecipe) return;
    this.selectedRecipe = recipe;
    this.referenceImages.set([]);
  }
}
