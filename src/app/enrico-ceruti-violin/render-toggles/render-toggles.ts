import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CerutiViewFlags } from '../ceruti-types';

@Component({
  selector: 'app-ceruti-render-toggles',
  imports: [FormsModule],
  templateUrl: './render-toggles.html',
  styleUrls: ['../../sidebar.css'],
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
}
