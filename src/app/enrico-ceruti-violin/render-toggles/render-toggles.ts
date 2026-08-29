import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CerutiViewFlags, RenderToggleKey } from '../ceruti-types';

@Component({
  selector: 'app-ceruti-render-toggles',
  imports: [],
  templateUrl: './render-toggles.html',
  styleUrls: ['./render-toggles.css'],
})
export class RenderToggles {
  @Input({ required: true }) flags!: CerutiViewFlags;

  /** Which buttons to draw — the open panel's own list, see `CerutiPanelBase.renderToggles`.
   *  Order comes from the template below rather than from this array, so a button sits in the
   *  same place on the strip whichever panel asked for it. */
  @Input() buttons: readonly RenderToggleKey[] = [];

  @Output() changed = new EventEmitter<void>();

  has(key: RenderToggleKey): boolean {
    return this.buttons.includes(key);
  }

  toggle(key: RenderToggleKey): void {
    this.flags[key] = !this.flags[key];
    this.changed.emit();
  }
}
