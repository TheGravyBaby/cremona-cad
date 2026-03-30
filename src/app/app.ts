import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { BeardViolinComponent } from './beard-violin/beard-violin';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';
import { DenisViolin } from "./denis-violin/denis-violin";
import { RecipeInterface, ReferenceImage } from './models/types';
import { Pt } from './models/types';
import { KellyViolin } from './kelly-violin/kelly-violin';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, BeardViolinComponent, DraftCanvasComponent, FormsModule, DenisViolin, KellyViolin],
  template: `
    <div class="app">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      (recipeChange)="selectedRecipe = $event"
      (loadFile)="loadFile($event)"
        (saveFile)="requestSave()">
    </app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas" 
          [draftFunctions]="draftArgs"
          [referenceImageParams]="referenceImage"
          [setCameraBounds]="bounds"
          >
        </app-draft-canvas>

        @if (selectedRecipe == "Kelly Violin") {
         <app-kelly-violin class="sidebar"
          (draftChange)="draftArgs = $event"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-kelly-violin>
        }

        @if (selectedRecipe == "Beard Violin") {
         <app-beard-violin class="sidebar"
          (draftChange)="draftArgs = $event"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-beard-violin>

        }
        @if (selectedRecipe == "Denis Violin") {
        <app-denis-violin class="sidebar"
          (draftChange)="draftArgs = $event"
          (setBounds)="bounds=$event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage"
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-denis-violin>

        }
      </div>
    </div>
  `,
  styleUrl: './app.css',
})

export class App {
  draftArgs: Array<(g: any, ui: any) => void> = [];
  selectedRecipe: string = 'Kelly Violin';
  loadedFileData: RecipeInterface | undefined = undefined;
  saveTick = 0;
  bounds: {pt1: Pt, pt2: Pt} | null = null;

  referenceImage: ReferenceImage | null = null;

  onReferenceImageChange(img: ReferenceImage | null) {
    this.referenceImage = img;
  }

  loadFile(data: RecipeInterface) {
    this.loadedFileData = data;

    // pull reference image out of loaded file (if present)
    this.referenceImage = data?.referenceImage ?? null;

    const name = (data.recipeName ?? '').toLowerCase();
    if (name === 'kelly') this.selectedRecipe = 'Kelly Violin';
    if (name === 'beard') this.selectedRecipe = 'Beard Violin';
    if (name === 'denis') this.selectedRecipe = 'Denis Violin';
  }

  requestSave() {
    this.saveTick++;
  }
}
