import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { setGlobalEmitter } from './shared/message-emitter';
import { MessageService } from './shared/message.service';
import { TopBarComponent } from './top-bar/top-bar';
import { BeardViolinComponent } from './beard-violin/beard-violin';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';
import { RecipeInterface, ReferenceImage } from './models/types';
import { Pt } from './models/types';
import { KellyViolin } from './kelly-violin/kelly-violin';
import { EnricoCerutiViolin } from './enrico-ceruti-violin/enrico-ceruti-violin';
import { MessageCenterComponent } from './shared/message-center.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, BeardViolinComponent, DraftCanvasComponent, FormsModule, KellyViolin, EnricoCerutiViolin, MessageCenterComponent],
  template: `
    <div class="app">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      [nightMode]="nightMode"
      (recipeChange)="selectedRecipe = $event"
      (nightModeChange)="onNightModeChange($event)"
      (loadFile)="loadFile($event)"
      (saveFile)="requestSave()"
      (newFile)="newFile()">
    </app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas" 
          [draftFunctions]="draftArgs"
          [referenceImageParams]="referenceImage"
          (referenceImageChange)="onReferenceImageChange($event)"
          [setCameraBounds]="bounds"
          >
        </app-draft-canvas>

        @if (selectedRecipe == "Kelly Violin") {
         <app-kelly-violin class="sidebar"
          (draftChange)="onDraftChange($event)"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [newFile]="newFileTick"
          [referenceImageParams]="referenceImage"
          [cameraBounds]="bounds"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-kelly-violin>
        }

        @if (selectedRecipe == "enrico-ceruti-violin") {
         <app-enrico-ceruti-violin class="sidebar"
          (draftChange)="onDraftChange($event)"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [newFile]="newFileTick"
          [referenceImageParams]="referenceImage"
          [cameraBounds]="bounds"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-enrico-ceruti-violin>
        }

        @if (selectedRecipe == "Beard Violin") {
         <app-beard-violin class="sidebar"
          (draftChange)="onDraftChange($event)"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage"
          [cameraBounds]="bounds"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-beard-violin>
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

  draftArgs: Array<(g: any, ui: any) => void> = [];
  selectedRecipe: string = 'enrico-ceruti-violin';
  loadedFileData: RecipeInterface | undefined = undefined;
  saveTick = 0;
  bounds: {pt1: Pt, pt2: Pt} | null = null;
  sessionData = sessionStorage.getItem('recipeData');

  referenceImage: ReferenceImage | null = this.sessionData ? JSON.parse(this.sessionData).referenceImage : null;

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
    queueMicrotask(() => {
      this.draftArgs = fns;
    });
  }

  onReferenceImageChange(img: ReferenceImage | null) {
    queueMicrotask(() => {
      this.referenceImage = img;
    });
  }

  newFileTick = 0;

  newFile() {
    queueMicrotask(() => {
      this.newFileTick += 1;
    });
  }

  loadFile(data: RecipeInterface) {
    this.loadedFileData = data;
    sessionStorage.setItem('recipeData', JSON.stringify(this.loadedFileData));
    this.referenceImage = data.referenceImage ?? null;


    // pull reference image out of loaded file (if present)
    this.referenceImage = data?.referenceImage ?? null;

    const name = (data.recipeName ?? '').toLowerCase();
    if (name === 'kelly') this.selectedRecipe = 'Kelly Violin';
    if (name === 'beard') this.selectedRecipe = 'Beard Violin';
    if (name === 'ceruti') this.selectedRecipe = 'enrico-ceruti-violin';
  }

  requestSave() {
    this.saveTick++;
  }
}
