import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { BeardViolinComponent } from './beard-violin/beard-violin';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, BeardViolinComponent, DraftCanvasComponent, FormsModule],
  template: `
    <div class="app">
      <app-top-bar class="top"></app-top-bar>
      <div class="main">
        <app-draft-canvas class="canvas" [draftFunctions]="draftArgs"></app-draft-canvas>
        <app-beard-violin class="sidebar"
          (draftChange)="draftArgs = $event">
        </app-beard-violin>
      </div>
    </div>
  `,
  styleUrl: './app.css',
})

export class App {
   draftArgs: Array<(arg: any) => void> = []
}