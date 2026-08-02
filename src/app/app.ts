import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { setGlobalEmitter } from './shared/message-emitter';
import { MessageService } from './shared/message.service';
import { TopBarComponent } from './top-bar/top-bar';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { ToolboxStore } from './draft-canvas/tools/toolbox-store';
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
          [fitRequest]="fitToken()"
          >
        </app-draft-canvas>

        @if (selectedRecipe == "enrico-ceruti-violin") {
         <app-ceruti-violin class="sidebar"
          (draftChange)="onDraftChange($event)"
          (requestFit)="requestFit()"
          [nightMode]="nightMode">
        </app-ceruti-violin>
        }

        @if (selectedRecipe == "hello-recipe") {
         <app-hello-recipe class="sidebar"
          (draftChange)="onDraftChange($event)"
          (requestFit)="requestFit()">
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
  private toolbox = inject(ToolboxStore);

  draftArgs = signal<Array<(g: any, ui: any) => void>>([]);
  selectedRecipe: string = 'enrico-ceruti-violin';
  /** Incremented to ask the canvas to re-frame; the value itself means nothing. The camera fits to
   * what the canvas rendered, so this is a signal rather than a set of extents — see
   * RecipeComponentBase.requestFit. */
  fitToken = signal(0);

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

  requestFit(): void {
    this.fitToken.update(n => n + 1);
  }

  /** Switches the active recipe, clearing canvas state that belonged to the old one — including
   * its reference images, which are ToolboxStore shapes now rather than something this component
   * threads between the canvas and the sidebar. */
  selectRecipe(recipe: string): void {
    if (recipe === this.selectedRecipe) return;
    this.selectedRecipe = recipe;
    this.toolbox.resetAll();
    // A different recipe draws a different thing at a different size — frame it rather than
    // leaving the camera parked where the old one was.
    this.requestFit();
  }
}
