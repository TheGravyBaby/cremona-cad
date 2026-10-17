import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inchFraction } from '../helpers/nearestFraction';
import { NumberStepperDirective } from './number-stepper';

// one length, typed in either unit: mm on the left, inches on the right, the nearest 32nd by the
// inch title so it reads like the shop's tapes. The value in and out is always mm; the box being
// typed in is left alone and only the other one is rewritten, so a half-typed "0.7" is not snapped

const MM_PER_INCH = 25.4;

@Component({
  selector: 'app-mm-inch',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './mm-inch-field.html',
  styleUrls: ['../sidebar.css'],
  styles: [':host { display: contents; }'],
})
export class MmInchField {
  @Input() label = '';
  @Input() step = 0.1;
  @Input() min?: number;
  @Input() disabled = false;
  @Input() borderColor?: string;
  @Output() valueChange = new EventEmitter<number>();

  mm: number | null = null;
  inches: number | null = null;
  fraction = '';

  @Input() set value(mm: number) {
    if (mm === this.mm || (Number.isNaN(mm) && this.mm === null)) return;
    this.mm = Number.isFinite(mm) ? mm : null;
    this.inches = this.mm === null ? null : round(this.mm / MM_PER_INCH);
    this.fraction = inchFraction(this.inches ?? NaN);
  }

  onMm(mm: number | null): void {
    this.mm = mm;
    this.inches = mm === null ? null : round(mm / MM_PER_INCH);
    this.fraction = inchFraction(this.inches ?? NaN);
    this.valueChange.emit(mm ?? NaN);
  }

  onInches(inches: number | null): void {
    this.inches = inches;
    this.mm = inches === null ? null : round(inches * MM_PER_INCH);
    this.fraction = inchFraction(inches ?? NaN);
    this.valueChange.emit(this.mm ?? NaN);
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
