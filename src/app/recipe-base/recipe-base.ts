import { Component } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { RecipeInterface } from '../models/recipe';
import { Circle, Pt } from '../models/types';

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export class RecipeComponentBase {
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();
  @Input() set loadFile(file: RecipeInterface | undefined) {
    if (file) {
      this.d = file;
      this.draftChange.emit([this.firstRender]);
    }
  }
  private _saveTick = 0;

  @Input() set saveTick(v: number) {
    if (v && v !== this._saveTick) {
      this._saveTick = v;
      this.saveToDisk();
    }
  }

  d: RecipeInterface = {
    recipeName: "",
    fileName: "tst",
    version: "",
    params: undefined,
    calcs: undefined
  }

  openPanel: string = "base";


  ngOnInit() {
    this.draftChange.emit([this.firstRender]);
  }

  firstRender(canvas: any, ui: any) {
  }

  private saveToDisk() {
    const safeName = (this.d.fileName?.trim() || 'untitled') + (this.d.fileName?.endsWith('.json') ? '' : '.json');
    const json = JSON.stringify(this.d, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  onToggle(panel: string, event: Event) {
    const details = event.target as HTMLDetailsElement;
    if (details.open) {
      this.openPanel = panel;
    }
  }

  addCalcs(calcs: { name: string, d: any }[]) {
    this.d.calcs = this.d.calcs || [];
    for (const entry of calcs) {
      const idx = this.d.calcs.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.calcs.push(entry);
      else this.d.calcs[idx] = entry;
    }
  }

}