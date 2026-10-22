import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { setGlobalEmitter } from './shared/message-emitter';
import { isSmallViewport, trackViewportHeight } from './helpers/viewport';
import { MessageService } from './shared/message.service';
import { InfoBoothComponent } from './docs/info-booth/info-booth';
import { SettingsService } from './settings/settings.service';
import { TopBarComponent } from './top-bar/top-bar';
import { DraftCanvasComponent } from './draft-canvas/draft-canvas';
import { ToolboxStore } from './draft-canvas/tools/toolbox-store';
import { readWorkingState, SELECTED_RECIPE_KEY, writeWorkingState } from './helpers/workingStorage';
import { HelloWorldRecipe } from './recipes/hello-world/hello-world-recipe';
import { ViolinFamily } from './recipes/violin-family/violin-family-recipe';
import { ThemeService } from './theme/theme.service';
import { IconDirective } from './icons/icon.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TopBarComponent, InfoBoothComponent, DraftCanvasComponent, ViolinFamily, HelloWorldRecipe, IconDirective],
  template: `
    <div class="app" [class.sidebar-collapsed]="!sidebarOpen"
      [class.bar-autohide]="settings.barAutoHide() && !hasMessages()" [class.bar-revealed]="barRevealed()">
     <app-top-bar class="top"
      [selectedRecipe]="selectedRecipe"
      (recipeChange)="selectRecipe($event)"
      (boothRequested)="booth.open($event)">
    </app-top-bar>

    <!-- outside the bar: the unpinned bar is transformed, which would make this fixed backdrop
         relative to it and slide it away -->
    <app-info-booth #booth></app-info-booth>

      <div class="main">
        <app-draft-canvas class="canvas"
          [draftFunctions]="draftArgs()"
          [fitRequest]="fitToken()">
        </app-draft-canvas>
      </div>

      <div class="sidebar-dock">
        @if (selectedRecipe == "violin-family") {
         <app-violin-family class="sidebar"
          (draftChange)="onDraftChange($event)"
          (requestFit)="requestFit()">
        </app-violin-family>
        }

        @if (selectedRecipe == "hello-world-recipe") {
         <app-hello-world-recipe class="sidebar"
          (draftChange)="onDraftChange($event)"
          (requestFit)="requestFit()">
        </app-hello-world-recipe>
        }

        <!-- Mirrors the tool bar's tab on the other edge, and names what the drawer holds the
             way the compass does, so neither flips when it closes.

             The path is traced from public/fhole.jpeg and is machine output — re-trace rather
             than hand-editing it. The scale and the stroke are the tunable pair: together they
             set the glyph's weight, which is matched to the compass's stroke. viewBox width is
             17.99 x the scale. -->
        <button type="button" class="sidebar-dock-handle" (click)="toggleSidebar()"
          [attr.aria-expanded]="sidebarOpen" [title]="sidebarOpen ? 'Hide recipe' : 'Show recipe'">
          <svg icon="fhole" class="dock-handle-icon"></svg>
        </button>
      </div>
    </div>
  `,
  styleUrl: './app.css',
})

export class App implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  protected readonly settings = inject(SettingsService);
  // inject MessageService via Angular's injector
  private messageService = inject(MessageService);
  private toolbox = inject(ToolboxStore);

  draftArgs = signal<Array<(g: any, ui: any) => void>>([]);
  selectedRecipe: string = 'violin-family';
  /** Incremented to ask the canvas to re-frame; the value itself means nothing. The camera fits to
   * what the canvas rendered, so this is a signal rather than a set of extents — see
   * RecipeComponentBase.requestFit. */
  fitToken = signal(0);

  private static readonly SIDEBAR_OPEN_KEY = 'app-sidebar-open';
  private static readonly BAR_REVEAL_EDGE_PX = 6;

  /** Stops the visual-viewport listeners; see trackViewportHeight in helpers/viewport.ts. */
  private readonly releaseViewportHeight: () => void;

  /** Whether the recipe panel is pushed open. Collapsed it's just the f-hole tab under the file
   * header, which stays up so saving and loading never need the panel expanded first. */
  sidebarOpen = true;

  /** Auto-hiding, the top bar and the recipe's file header slide away together and come back while
   * the pointer is at the top edge or over either of them. While there are messages the bar stays
   * instead, taking its row rather than lying over the controls: the chips live in the bar, so a
   * hidden bar would hide them too. */
  protected readonly barRevealed = signal(false);
  protected readonly hasMessages = toSignal(
    this.messageService.messages$.pipe(map(msgs => msgs.length > 0)),
    { initialValue: false },
  );

  // a plain listener rather than a HostListener, which would run change detection on every move;
  // the signal only schedules one when the bar actually shows or hides
  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.settings.barAutoHide()) return;
    const bar = 'app-top-bar, app-recipe-toolbar';
    const reveal = e.clientY <= App.BAR_REVEAL_EDGE_PX
      || !!(e.target as Element | null)?.closest?.(bar)
      // still typing a file name with the pointer gone elsewhere
      || !!this.doc.activeElement?.matches(`:is(${bar}) input`);
    if (reveal !== this.barRevealed()) this.barRevealed.set(reveal);
  };

  constructor() {
    // auto reads the clock when the appearance is applied, not continuously
    effect(() => {
      const appearance = this.settings.appearance();
      const hour = new Date().getHours();
      const night = appearance === 'auto' ? hour < 7 || hour >= 19 : appearance === 'night';
      this.theme.setMode(night ? 'night' : 'day');
    });
    // the switch sits in the bar, so turning auto-hide on leaves the bar up until the pointer leaves
    // it rather than sliding the open menu out from under the pointer
    effect(() => {
      if (this.settings.barAutoHide()) this.barRevealed.set(true);
    });

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

    this.releaseViewportHeight = trackViewportHeight();
    this.doc.addEventListener('pointermove', this.onPointerMove, { passive: true });

    // a recipe is part of the tab's work like the design it holds: without this a reload always mounts
    // the violin, whose own session write then buries the other recipe's. checked against the names
    // the top bar offers, since a stale name would mount nothing at all.
    const stored = readWorkingState(SELECTED_RECIPE_KEY);
    if (stored === 'violin-family' || stored === 'hello-world-recipe') this.selectedRecipe = stored;
  }

  ngOnDestroy(): void {
    this.releaseViewportHeight();
    this.doc.removeEventListener('pointermove', this.onPointerMove);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    try {
      sessionStorage.setItem(App.SIDEBAR_OPEN_KEY, String(this.sidebarOpen));
    } catch {
      // ignore storage errors
    }
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
    writeWorkingState(SELECTED_RECIPE_KEY, recipe);
    this.toolbox.resetAll();
    // A different recipe draws a different thing at a different size — frame it rather than
    // leaving the camera parked where the old one was.
    this.requestFit();
  }
}
