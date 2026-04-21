import { Component, output } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { Pt, RecipeInterface, ReferenceImage } from '../models/types';

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export class RecipeComponentBase {
  @Output() draftChange = new EventEmitter<Array<(g: any, ui: any) => void>>();
  @Output() setBounds = new EventEmitter<{pt1: Pt, pt2: Pt}>();
  @Output() referenceImageChange = new EventEmitter<ReferenceImage | null>();

  @Input() set loadFile(file: RecipeInterface | undefined) {
    if (file) {
      this.d = file;
      this.draftChange.emit([this.firstRender]);
    }
  }
  @Input() set referenceImageParams(img: ReferenceImage | null | undefined) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;
    // sessionStorage.setItem('recipeData', JSON.stringify(this.d));
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
    const saved = sessionStorage.getItem('recipeData');
    if (saved) {
      try {
        this.d = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load from sessionStorage', e);
      }
    }
    this.draftChange.emit([this.firstRender]);
  }

  ngOnDestroy() {
    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
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

  onReferenceImageChange(img: ReferenceImage | null) {
    this.d.params = this.d.params || {};
    if (img) this.d.referenceImage = img;
    else delete this.d.referenceImage;

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

    // reference image controls
  async onReferenceFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const dataUrl = await this.readFileAsDataUrl(file);

    // Load it once to get natural dimensions
    const { w, h } = await this.getImageSize(dataUrl);

    // Simple, predictable default:
    // - size in "mm units" = natural px (same as your current approach)
    // - place centered on X, start near Y=0
    const width = w;
    const height = h;

    this.d.referenceImage = {
      href: dataUrl,
      "xlink:href": dataUrl,
      x: -width / 2,
      y: 0,
      width,
      height,
    };

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
    this.referenceImageChange.emit(this.d.referenceImage);

    // // Optional: auto-enable showing it when user uploads
    // this.showReferenceImage = true;

    // this.draw();

    // optional: allow re-uploading same file by clearing the input
    input.value = '';

    sessionStorage.setItem('recipeData', JSON.stringify(this.d));
  }

    private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

}