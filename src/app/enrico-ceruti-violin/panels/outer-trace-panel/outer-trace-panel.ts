import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { adjustArcEnd } from '../../../helpers/arcDegrees';
import { Arc } from '../../../models/types';
import { buttonInfo, cornerCutoffInfo, flutingInfo, purflingInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';
import { RenderToggles } from '../../render-toggles/render-toggles';

@Component({
  selector: 'app-ceruti-outer-trace-panel',
  imports: [FormsModule, RenderToggles],
  templateUrl: './outer-trace-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class OuterTracePanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();
  @Output() arcFocus = new EventEmitter<{ arc: Arc; color: string }>();
  @Output() arcBlur = new EventEmitter<void>();

  protected readonly buttonInfo = buttonInfo;
  protected readonly cornerCutoffInfo = cornerCutoffInfo;
  protected readonly purflingInfo = purflingInfo;
  protected readonly flutingInfo = flutingInfo;
  protected readonly adjustArcEnd = adjustArcEnd;

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
