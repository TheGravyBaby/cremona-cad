import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { setGlobalEmitter } from './shared/message-emitter';
import { installDebugCapture, isLocalHost } from './helpers/debugDump';
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
    <div class="app" [class.sidebar-collapsed]="!sidebarOpen">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      (recipeChange)="selectRecipe($event)">
    </app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas"
          [draftFunctions]="draftArgs()"
          [fitRequest]="fitToken()"
          [nightMode]="nightMode"
          (nightModeChange)="onNightModeChange($event)"
          >
        </app-draft-canvas>

        <div class="sidebar-dock" [class.collapsed]="!sidebarOpen">
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

          <!-- Mirrors the tool bar's tab on the other edge: attached to the panel while it's open,
               flush with the screen once it's shut. -->
          <button type="button" class="sidebar-dock-handle" (click)="toggleSidebar()"
            [attr.aria-expanded]="sidebarOpen" [title]="sidebarOpen ? 'Hide recipe' : 'Show recipe'">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
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

  private static readonly SIDEBAR_OPEN_KEY = 'app-sidebar-open';

  /** 360px of recipe panel is most of a phone held in landscape, so below this the panel starts
   * out of the way. Any tablet or desktop clears it. Width rather than height, since what
   * constrains a side panel is the width it takes — the tool bar thresholds on height instead. */
  private static readonly NARROW_VIEWPORT_PX = 900;

  /** Whether the recipe panel is pushed open. Collapsed it's just the chevron tab; the file strip
   * stays up regardless, so saving and loading never need the panel expanded first. */
  sidebarOpen = true;

  constructor() {
    const savedTheme = localStorage.getItem('themeMode');
    this.nightMode = savedTheme !== 'day';
    this.applyThemeClass();

    let storedOpen: string | null = null;
    try {
      storedOpen = sessionStorage.getItem(App.SIDEBAR_OPEN_KEY);
    } catch {
      // ignore blocked sessionStorage
    }
    this.sidebarOpen = storedOpen === null
      ? window.innerWidth >= App.NARROW_VIEWPORT_PX
      : storedOpen === 'true';

    // wire global emitter to MessageService
    setGlobalEmitter((m) => this.messageService.emit(m));

    // Records console output and toasts for the `/` dumps. Same gate as the
    // buttons themselves — off a real host, nothing is patched and no buffer is
    // kept.
    if (isLocalHost()) installDebugCapture();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    try {
      sessionStorage.setItem(App.SIDEBAR_OPEN_KEY, String(this.sidebarOpen));
    } catch {
      // ignore storage errors
    }
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
