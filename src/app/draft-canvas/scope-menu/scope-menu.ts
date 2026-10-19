import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { PanelChoice, ToolboxStore } from '../tools/toolbox-store';
import {
  isScopeNowhere, isScopeOnly, PanelScope, scopeOnly, scopeShows, scopeWith, SCOPE_EVERYWHERE, SCOPE_NOWHERE,
} from '../tools/panel-scope';

/**
 * Which panels a layer or image shows on, answered from the open panel's point of view (see
 * panel-scope.ts). Opened from a row in the bottom bar's lists and from a selected image's
 * settings; it only proposes a scope, and the host writes it to whichever thing it belongs to.
 */
@Component({
  selector: 'app-scope-menu',
  standalone: true,
  templateUrl: './scope-menu.html',
  styleUrls: ['./scope-menu.css'],
})
export class ScopeMenuComponent {
  private toolbox = inject(ToolboxStore);

  @Input({ required: true }) scope: PanelScope | undefined;
  @Output() scopeChange = new EventEmitter<PanelScope | undefined>();

  /** The full checklist starts folded, so the presets are what you see first. */
  public panelListOpen = false;

  public get availablePanels(): readonly PanelChoice[] { return this.toolbox.availablePanels; }
  public get activePanel(): string | null { return this.toolbox.activePanel; }

  public get shownHere(): boolean { return this.toolbox.shownHere(this.scope); }
  public get isEverywhere(): boolean { return !this.scope; }
  public get isHereOnly(): boolean { return isScopeOnly(this.scope, this.activePanel); }
  public get isNowhere(): boolean { return isScopeNowhere(this.scope); }
  public shownOn(panelId: string): boolean { return scopeShows(this.scope, panelId); }

  applyPreset(preset: 'everywhere' | 'here' | 'nowhere'): void {
    this.scopeChange.emit(
      preset === 'everywhere' ? SCOPE_EVERYWHERE : preset === 'here' ? scopeOnly(this.activePanel) : SCOPE_NOWHERE);
  }

  toggleHere(): void {
    this.scopeChange.emit(scopeWith(this.scope, this.activePanel, !this.shownHere));
  }

  togglePanel(panelId: string): void {
    this.scopeChange.emit(scopeWith(this.scope, panelId, !this.shownOn(panelId)));
  }
}
