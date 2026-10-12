import { Directive, EventEmitter, Output } from '@angular/core';
import { showFieldHelp } from '../docs/field-help';
import { safeRun } from '../helpers/validators';
import { ViolinFamilyParams } from './violin-family-types';

// What every Violin Family panel shares: the class it extends, the memo its solver is wrapped in,
// and the ratio filter. A panel file holds the rest of its stage, seed to solve to render.

export type RenderLayer = (g: any, ui: any) => void;

// Every field in a panel's template calls edited(): the shell seeds the stage and schedules the
// commit (the undo entry, the session write, report() of what didn't solve) for when the typing
// stops, and the panel redraws now.
@Directive()
export abstract class ViolinFamilyPanel {
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  protected readonly help = showFieldHelp;

  // public so a spec can call it without a canvas
  public abstract draw(): RenderLayer[];

  // messages for what didn't solve, raised once the edit settles rather than on every keystroke
  public report(): void {}

  public redraw(): void {
    safeRun(() => this.drawn.emit(this.draw()));
  }

  // the shell seeds before the redraw, so a toggle that opens new fields has values to show
  public edited(): void {
    this.edit.emit();
    this.redraw();
  }
}

// A stage's solver, re-run only when the params it reads change. The key is the JSON of `reads`,
// so an edit on a later panel leaves an earlier stage's solve standing. One slot is enough: there
// is one recipe open.
export function stage<R>(reads: (p: ViolinFamilyParams) => unknown[], run: (p: ViolinFamilyParams) => R): (p: ViolinFamilyParams) => R {
  let last: { key: string; value: R } | null = null;
  return p => {
    let key = JSON.stringify(reads(p));
    if (last?.key !== key) last = { key, value: run(p) };
    return last.value;
  };
}

// a ratio over a width that has gone to nothing says nothing, so it's left off rather than shown as NaN
export function finiteRatios<R extends object>(r: R): Partial<R> {
  let kept: Partial<R> = {};
  for (let key of Object.keys(r) as (keyof R)[]) {
    let value = r[key] as unknown as number;
    if (value > 0 && Number.isFinite(value)) kept[key] = r[key];
  }
  return kept;
}
