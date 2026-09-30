import { Component, ElementRef, HostListener, inject, Input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { AxisGridController, AxisGridPreferences } from '../axis-grid-controller';

// the strip and popup chrome is layer-controls.css, shared rather than restated, so the three
// bottom-bar lists stay one look
@Component({
  selector: 'app-axis-controls',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './axis-controls.html',
  styleUrls: ['../layer-controls/layer-controls.css', './axis-controls.css'],
})
export class AxisControlsComponent {
  private elRef = inject(ElementRef<HTMLElement>);

  // draft-canvas owns the controller, since it draws from it
  @Input({ required: true }) axisGrid!: AxisGridController;

  public open = false;

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.open) return;
    if (this.elRef.nativeElement.contains(event.target as Node)) return;
    this.open = false;
  }

  toggleOpen(): void {
    this.open = !this.open;
  }

  toggle(key: 'visible' | 'showAxes' | 'showGridX' | 'showGridY'): void {
    this.axisGrid.updatePreferences({ [key]: !this.axisGrid[key] });
  }

  // written back into the field, since a sanitized or rejected entry can leave the bound value
  // unchanged and Angular would then leave the typed text standing
  setStep(key: 'gridStepX' | 'gridStepY', input: HTMLInputElement): void {
    this.axisGrid.updatePreferences({ [key]: input.valueAsNumber } as Partial<AxisGridPreferences>);
    input.value = String(this.axisGrid[key]);
  }
}
