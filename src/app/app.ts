import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { setGlobalEmitter } from './shared/message-emitter';
import { installDebugCapture, isLocalHost } from './helpers/debugDump';
import { isSmallViewport, trackViewportHeight } from './helpers/viewport';
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
      (recipeChange)="selectRecipe($event)"
      [nightMode]="nightMode"
      (nightModeChange)="onNightModeChange($event)">
    </app-top-bar>

      <div class="main">
        <app-draft-canvas class="canvas"
          [draftFunctions]="draftArgs()"
          [fitRequest]="fitToken()">
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

          <!-- Mirrors the tool bar's tab on the other edge, and names what the drawer holds the
               way the compass does, so neither flips when it closes.

               The path is traced from public/fhole.jpeg and is machine output — re-trace rather
               than hand-editing it. The scale and the stroke are the tunable pair: together they
               set the glyph's weight, which is matched to the compass's stroke. viewBox width is
               17.99 x the scale. -->
          <button type="button" class="sidebar-dock-handle" (click)="toggleSidebar()"
            [attr.aria-expanded]="sidebarOpen" [title]="sidebarOpen ? 'Hide recipe' : 'Show recipe'">
            <svg class="dock-handle-icon" viewBox="0 0 15.47 24" fill="currentColor"
              stroke="currentColor" stroke-width="0.45" stroke-linejoin="round" aria-hidden="true">
              <path transform="scale(0.86 1)" d="M15.1 0.6C15.8 0.4 16.3 0.4 16.6 0.6C17 0.8 17.4 1.3 17.4 1.6C17.4 1.9 17.4 2.2 16.8 2.2C16.2 2.3 14.5 1.7 13.8 1.9C13 2 13 1.6 12.4 3.1C11.8 4.7 10.5 9.7 10.1 11.1C9.7 12.5 10 11.4 10.1 11.6C10.2 11.8 10.8 12.1 10.7 12.3C10.7 12.4 10.1 11.9 9.7 12.8C9.4 13.6 9.1 16 8.7 17.1C8.4 18.2 8.2 18.8 7.9 19.4C7.6 20 7.4 20.3 7 20.8C6.6 21.2 5.9 21.9 5.5 22.3C5 22.6 4.7 22.8 4.2 23C3.8 23.2 3.3 23.4 2.7 23.4C2.2 23.4 1.3 23.4 1 23.3C0.6 23.2 0.7 23.1 0.6 22.9C0.5 22.7 0.5 22.3 0.6 22.1C0.7 22 0.4 21.8 1.1 21.8C1.8 21.7 3.8 22 4.6 21.9C5.4 21.8 5.5 21.5 5.9 21C6.2 20.6 6.2 20.5 6.6 19.1C7 17.8 7.9 14.2 8.1 13.1C8.4 12 8.3 12.9 8.1 12.6C8 12.4 7.2 12 7.2 11.7C7.3 11.5 8.1 12.1 8.6 11C9.1 9.8 9.8 6.2 10.2 4.9C10.7 3.5 10.9 3.6 11.2 3.1C11.6 2.6 12 2.1 12.6 1.7C13.3 1.3 14.5 0.8 15.1 0.6Z" />
            </svg>
          </button>
        </div>
      </div>
      <app-message-center></app-message-center>
    </div>
  `,
  styleUrl: './app.css',
})

export class App implements OnDestroy {
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

  /** Stops the visual-viewport listeners; see trackViewportHeight in helpers/viewport.ts. */
  private readonly releaseViewportHeight: () => void;

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
    // Same test the tool bar uses (helpers/viewport.ts), so a small screen opens with neither bar
    // over the drawing rather than one of them.
    this.sidebarOpen = storedOpen === null ? !isSmallViewport() : storedOpen === 'true';

    // wire global emitter to MessageService
    setGlobalEmitter((m) => this.messageService.emit(m));

    // Records console output and toasts for the `/` dumps. Same gate as the
    // buttons themselves — off a real host, nothing is patched and no buffer is
    // kept.
    if (isLocalHost()) installDebugCapture();

    this.releaseViewportHeight = trackViewportHeight();
  }

  ngOnDestroy(): void {
    this.releaseViewportHeight();
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
