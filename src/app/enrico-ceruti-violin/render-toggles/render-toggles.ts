import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CerutiViewFlags } from '../ceruti-types';

type ToggleKey = 'showModuleArcs' | 'showAllArcs' | 'showModuleCircles' | 'showAllCircles'
  | 'showModuleGuides' | 'renderOuterPath';

@Component({
  selector: 'app-ceruti-render-toggles',
  imports: [],
  templateUrl: './render-toggles.html',
  styleUrls: ['./render-toggles.css'],
})
export class RenderToggles {
  @Input({ required: true }) flags!: CerutiViewFlags;
  @Input() showArcsRow = true;
  @Input() showCirclesRow = true;
  @Input() showGuideRow = true;
  @Input() showOuterPathRow = true;
  @Input() showAllArcs = true;
  @Input() showAllCircles = true;
  @Output() changed = new EventEmitter<void>();

  toggle(key: ToggleKey): void {
    this.flags[key] = !this.flags[key];
    this.changed.emit();
  }
}
