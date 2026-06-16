import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { dimensionInfo, insetInfo, referenceInfo } from '../../ceruti-helpers';
import { EnricoCerutiParams } from '../../ceruti-types';

@Component({
  selector: 'app-ceruti-base-panel',
  imports: [FormsModule],
  templateUrl: './base-panel.html',
  styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css'],
})
export class BasePanel {
  @Input({ required: true }) params!: EnricoCerutiParams;
  @Input() fileName = '';
  @Output() fileNameChange = new EventEmitter<string>();
  @Input() description: string | undefined = '';
  @Output() descriptionChange = new EventEmitter<string>();

  @Output() changed = new EventEmitter<void>();
  @Output() referenceFileSelected = new EventEmitter<Event>();

  protected readonly nearestFraction = nearestFraction;
  protected readonly referenceInfo = referenceInfo;
  protected readonly dimensionInfo = dimensionInfo;
  protected readonly insetInfo = insetInfo;

  onChange(): void {
    this.changed.emit();
  }
}
