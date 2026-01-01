import { Component } from '@angular/core';
import { TopBarComponent } from './top-bar/top-bar';
import { SidebarComponent } from './sidebar/sidebar';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, SidebarComponent, DraftCanvasComponent],
  template: `
    <div class="app">
      <app-top-bar class="top"></app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas"></app-draft-canvas>
        <app-sidebar class="sidebar"></app-sidebar>
      </div>
    </div>
  `,
  styleUrl: './app.css',
})
export class App {}
