import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { bitDiameterInfo, channelDepthInfo } from '../../ceruti-helpers';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';

@Component({
  selector: 'app-ceruti-mould-panel',
  imports: [FormsModule],
  templateUrl: './mould-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class MouldPanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input({ required: true }) colors!: CerutiColors;
  @Input({ required: true }) flags!: CerutiViewFlags;

  @Output() changed = new EventEmitter<void>();

  protected readonly bitDiameterInfo = bitDiameterInfo;
  protected readonly channelDepthInfo = channelDepthInfo;

  onChange(): void {
    this.changed.emit();
  }
}
