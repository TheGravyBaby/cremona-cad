import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcStart } from '../../../helpers/arcDegrees';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { Arc } from '../../../models/types';
import { centerBoutWidthInfo, fitC0Info } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';
import { RenderToggles } from '../../render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-center-bout-panel',
  imports: [FormsModule, RenderToggles],
  templateUrl: './center-bout-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class CenterBoutPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  /** Emits `false` when CBW/C0.y are hand-edited (forces useKellyC0 off); undefined otherwise. See calculateCenterBout. */
  @Output() changed = new EventEmitter<boolean | undefined>();
  @Output() arcFocus = new EventEmitter<{ arc: Arc; color: string }>();
  @Output() arcBlur = new EventEmitter<void>();

  protected readonly nearestFraction = nearestFraction;
  protected readonly centerBoutWidthInfo = centerBoutWidthInfo;
  protected readonly fitC0Info = fitC0Info;
  protected readonly adjustArcStart = adjustArcStart;

  onChange(solveC0?: boolean): void {
    this.changed.emit(solveC0);
  }

  onArcFocus(arc: Arc, color: string): void {
    this.arcFocus.emit({ arc, color });
  }

  onArcBlur(): void {
    this.arcBlur.emit();
  }
}
