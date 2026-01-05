import { Component } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { RecipeInterface } from '../models/recipe';
import { Pt } from '../models/types';

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
    ratios: undefined,
    paths: undefined
  }

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

  openPanel: string = "base";

  onToggle(panel: string, event: Event) {
    const details = event.target as HTMLDetailsElement;
    if (details.open) {
      this.openPanel = panel;
    }
  }

  // partsOrSegments:
  // - number => equal parts
  // - number[] => segment weights (e.g. [3,4,3])
  renderBoxLine(
    g: any,
    ui: any,
    start: Pt,
    end: Pt,
    partsOrSegments: number | number[],
    color1: string,
    color2: string,
    label: boolean,
    opts?: {
      thickness?: number;          // px
      outline?: boolean;
      tickMode?: "boundaries" | "none";
      labelMode?: "segmentIndex" | "segmentWeight";
      labelOffset?: number;        // multiplier of thickness
    }
  ) {
    const thickness = opts?.thickness ?? 10;
    const outlineOn = opts?.outline ?? true;
    const tickMode = opts?.tickMode ?? "boundaries";
    const labelMode = opts?.labelMode ?? "segmentIndex";
    const labelOffsetMul = opts?.labelOffset ?? 0.9;

    // Build "weights"
    let weights: number[];
    if (Array.isArray(partsOrSegments)) {
      weights = partsOrSegments.slice();
    } else {
      const n = Math.floor(partsOrSegments);
      if (!n || n <= 0) return;
      weights = new Array(n).fill(1);
    }

    // sanitize weights
    weights = weights.map(w => (Number.isFinite(w) ? w : 0)).filter(w => w > 0);
    if (weights.length === 0) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const halfT = thickness / 2;

    const total = weights.reduce((a, b) => a + b, 0);
    const unit = len / total; // length per "part"

    if (outlineOn) {
      const outline = g.append("g").attr("class", "boxline-outline");
      outline.append("line")
        .attr("x1", start.x + nx * halfT)
        .attr("y1", start.y + ny * halfT)
        .attr("x2", end.x + nx * halfT)
        .attr("y2", end.y + ny * halfT)
        .attr("stroke", "rgba(0,0,0,0.25)")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke");

      outline.append("line")
        .attr("x1", start.x - nx * halfT)
        .attr("y1", start.y - ny * halfT)
        .attr("x2", end.x - nx * halfT)
        .attr("y2", end.y - ny * halfT)
        .attr("stroke", "rgba(0,0,0,0.25)")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke");
    }

    const segGroup = g.append("g").attr("class", "boxline-segments");
    const textGroup = ui.append("g").attr("class", "boxline-labels");

    // running distance along the line
    let cursor = 0;

    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      const segLen = w * unit;

      const a = cursor;
      const b = cursor + segLen;

      const ax = start.x + ux * a;
      const ay = start.y + uy * a;
      const bx = start.x + ux * b;
      const by = start.y + uy * b;

      const p1 = { x: ax + nx * halfT, y: ay + ny * halfT };
      const p2 = { x: bx + nx * halfT, y: by + ny * halfT };
      const p3 = { x: bx - nx * halfT, y: by - ny * halfT };
      const p4 = { x: ax - nx * halfT, y: ay - ny * halfT };

      const fill = (i % 2 === 0) ? color1 : color2;

      segGroup.append("path")
        .attr("d", `M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} Z`)
        .attr("fill", fill)
        .attr("stroke", "rgba(0,0,0,0.15)")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke")
        .attr('opacity', 0.25);;

      if (tickMode === "boundaries") {
        // boundary tick at start of segment (skip i=0 if you don't want it)
        const tx = ax;
        const ty = ay;
        segGroup.append("line")
          .attr("x1", tx + nx * halfT)
          .attr("y1", ty + ny * halfT)
          .attr("x2", tx - nx * halfT)
          .attr("y2", ty - ny * halfT)
          .attr("stroke", "rgba(0,0,0,0.35)")
          .attr("stroke-width", 1)
          .attr("vector-effect", "non-scaling-stroke");
      }

      if (label) {
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        const lx = cx + nx * (thickness * labelOffsetMul);
        const ly = cy + ny * (thickness * labelOffsetMul);

        const txt =
          labelMode === "segmentWeight"
            ? String(w)           // shows 3,4,3
            : String(i + 1);      // shows 1,2,3

        textGroup.append("text")
          .attr("x", lx)
          .attr("y", -ly)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("font-size", 12)
          .attr("fill", "rgba(0,0,0,0.75)")
          .style("user-select", "none")
          .text(txt);
      }

      cursor = b;
    }

    // final tick at end
    if (tickMode === "boundaries") {
      segGroup.append("line")
        .attr("x1", end.x + nx * halfT)
        .attr("y1", end.y + ny * halfT)
        .attr("x2", end.x - nx * halfT)
        .attr("y2", end.y - ny * halfT)
        .attr("stroke", "rgba(0,0,0,0.35)")
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke");
    }
  }

  renderDashLine(
    g: any,
    start: { x: number; y: number },
    end: { x: number; y: number },
    color = "black",
    width = 1,
    dash = "4,4"
  ) {
    g.append("line")
      .attr("x1", start.x)
      .attr("y1", start.y)
      .attr("x2", end.x)
      .attr("y2", end.y)
      .attr("stroke", color)
      .attr("stroke-width", width)
      .attr("stroke-dasharray", dash)
      .attr("vector-effect", "non-scaling-stroke");
  }

  addPaths(calcs: {name: string, d: string}[]) {
    this.d.paths = this.d.paths || [];
    for (const entry of calcs) {
      const idx = this.d.paths.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.paths.push(entry);
      else this.d.paths[idx] = entry;
    }
  }

  renderPaths = (paths: Array<{ d: string }>) => (g: any, ui: any) => {
    paths.forEach(p => {
      g.append("path")
        .attr("d", p.d)
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 2);
    });
  };




}