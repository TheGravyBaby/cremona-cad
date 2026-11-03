import { Directive, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { showFieldHelp } from '../../../docs/field-help';
import { nearestFraction } from '../../../helpers/nearestFraction';
import { safeRun } from '../../../helpers/validators';
import { PanelPalette } from '../../../theme/theme.service';
import { RenderLayer, ViolinFamilyParams, ViolinFamilyViewFlags } from '../violin-family-types';

// What every panel does the same way: takes the params and flags, redraws on a field's edit and on
// its focus, and hands the shell its layers. What a panel knows about the violin stays in the panel.

@Directive()
export abstract class PanelComponentBase<HighlightKey = never, Ratios extends object = Record<never, never>> implements OnInit {
  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  protected abstract readonly pal: PanelPalette;
  protected readonly showFieldHelp = showFieldHelp;

  // held as a key rather than the arc or point: every solve builds new arcs
  highlightedPart: { key: HighlightKey; color: string } | null = null;
  ratios: Partial<Ratios> = {};

  protected abstract buildCanvasLayers(): RenderLayer[];

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  abstract reportSolveFailures(): void;

  ngOnInit(): void {
    this.drawCanvas();
  }

  // the shell calls this too, when the theme, a view toggle or an undo has changed the picture
  drawCanvas(): void {
    safeRun(() => this.drawn.emit(this.buildCanvasLayers()));
  }

  // every field calls this: the shell seeds the stage and schedules the commit (the undo entry, the
  // session write, reportSolveFailures()) for when the typing stops, and the picture catches up now
  recordEditAndRedraw(): void {
    this.edit.emit();
    this.drawCanvas();
  }

  highlightPart(key: HighlightKey, color = ''): void {
    this.highlightedPart = { key, color };
    this.drawCanvas();
  }

  clearHighlight(): void {
    this.highlightedPart = null;
    this.drawCanvas();
  }

  formatRatio(key: keyof Ratios): string {
    let value = this.ratios[key];
    return Number.isFinite(value) ? nearestFraction(value as number) : '–';
  }
}
