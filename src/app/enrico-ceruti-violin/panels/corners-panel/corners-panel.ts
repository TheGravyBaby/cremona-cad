import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcStart } from '../../../helpers/arcDegrees';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { Arc } from '../../../models/types';
import { compoundArcInfo, cornerPositionInfo, violCornerInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';
import { RenderToggles } from '../../render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-corners-panel',
  imports: [FormsModule, RenderToggles],
  templateUrl: './corners-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CornersPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();
  @Output() arcFocus = new EventEmitter<{ arc: Arc; color: string }>();
  @Output() arcBlur = new EventEmitter<void>();

  protected readonly nearestFraction = nearestFraction;
  protected readonly cornerPositionInfo = cornerPositionInfo;
  protected readonly violCornerInfo = violCornerInfo;
  protected readonly compoundArcInfo = compoundArcInfo;
  protected readonly adjustArcStart = adjustArcStart;

  onChange(): void {
    this.changed.emit();
  }

  onArcFocus(arc: Arc, color: string): void {
    this.arcFocus.emit({ arc, color });
  }

  onArcBlur(): void {
    this.arcBlur.emit();
  }
}
