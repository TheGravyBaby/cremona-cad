import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { BeardViolinComponent } from './beard-violin/beard-violin';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';
import { DenisViolin } from "./denis-violin/denis-violin";
import { RecipeInterface, ReferenceImage } from './models/types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, BeardViolinComponent, DraftCanvasComponent, FormsModule, DenisViolin],
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
          (referenceImageChange)="onReferenceImageChange($event)">
        </app-draft-canvas>

        @if (selectedRecipe == "Beard Violin") {
         <app-beard-violin class="sidebar"
          (draftChange)="draftArgs = $event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage">
        </app-beard-violin>

        }
        @if (selectedRecipe == "Denis Violin") {
        <app-denis-violin class="sidebar"
          (draftChange)="draftArgs = $event"
          [loadFile]="loadedFileData"
          [saveTick]="saveTick"
          [referenceImageParams]="referenceImage">
        </app-denis-violin>
        }
      </div>
    </div>
  `,
  styleUrl: './app.css',
})

export class App {
  draftArgs: Array<(g: any, ui: any) => void> = [];
  selectedRecipe: string = 'Beard Violin';
  loadedFileData: RecipeInterface | undefined = undefined;
  saveTick = 0;

  referenceImage: ReferenceImage | null = null;

  onReferenceImageChange(img: ReferenceImage | null) {
    this.referenceImage = img;
  }

  loadFile(data: RecipeInterface) {
    this.loadedFileData = data;

    // pull reference image out of loaded file (if present)
    this.referenceImage = data?.params?.referenceImage ?? null;

    const name = (data.recipeName ?? '').toLowerCase();
    if (name === 'beard') this.selectedRecipe = 'Beard Violin';
    if (name === 'denis') this.selectedRecipe = 'Denis Violin';
  }

  requestSave() {
    this.saveTick++;
  }
}
