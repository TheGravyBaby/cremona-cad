import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { SidebarComponent } from './sidebar/sidebar';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { FormsModule } from '@angular/forms';
import { DraftState } from './models/draftState';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, SidebarComponent, DraftCanvasComponent, FormsModule],
  template: `
    <div class="app">
      <app-top-bar class="top"></app-top-bar>
      <div class="main">
        <app-draft-canvas class="canvas" [draft]="draft"></app-draft-canvas>
        <app-sidebar 
          class="sidebar" 
          [draft]="draft"
          (draftChange)="draft = $event">
        </app-sidebar>
      </div>
    </div>
  `,
  styleUrl: './app.css',
})
export class App {
   draft: DraftState = {
    heightMm: 50,
    ratioHeight: 7,
    ratioWidth: 5,
  };
}