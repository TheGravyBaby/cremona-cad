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
  renderBoxLine = (
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
  ) => (g: any, ui: any) => {
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

  renderDashLine = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    color = "black",
    width = 1,
    dash = "4,4"
  ) => (g: any, ui: any) => {
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

  addCalcs(calcs: { name: string, d: any }[]) {
    this.d.calcs = this.d.calcs || [];
    for (const entry of calcs) {
      const idx = this.d.calcs.findIndex((c: any) => c.name === entry.name);
      if (idx === -1) this.d.calcs.push(entry);
      else this.d.calcs[idx] = entry;
    }
  }

  renderPaths = (paths: Array<{ d: string }>, color: string) => (g: any, ui: any) => {
    paths.forEach(p => {
      this.renderPath(p.d, color)
    });
  };

  renderPath = (path: string, color: string) => (g: any, ui: any) => {
    g.append("path")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1);
  };

  renderCircle = (C: Circle, color: string) => (g: any, ui: any) => {
    g.append('circle')
      .attr('cx', C.x)
      .attr('cy', C.y)
      .attr('r', C.r)
      .attr('stroke', color)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  renderLine = (P: Pt, Q: Pt, color: string, opacity: boolean = true) => (g: any, ui: any) => {
    g.append("line")
      .attr("x1", Q.x)
      .attr("y1", Q.y)
      .attr("x2", P.x)
      .attr("y2", P.y)
      .attr("stroke", color)
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', opacity ? 0.25 : 1);
  }

  renderRectangle = (P: Pt, w: number, h: number, fill: string, stroke: string) => (g: any, ui: any) => {
    g.append('rect')
      .attr('x', P.x)
      .attr('y', P.y)
      .attr('width', w)
      .attr('height', h)
      .attr('fill', fill)
      .attr('stroke', stroke)
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0.25);
  }

  // 1) Crosshair point marker (+ optional dot)
  renderCrosshair = (
    P: Pt,
    color: string,
    size: number = 3,          // half-length of crosshair arms in px
    strokeWidth: number = 2,
    opacity: number = 1,
    showDot: boolean = false,
    dotR: number = 2
  ) => (g: any, ui: any) => {
    const grp = g.append("g")
      .attr("class", "draft-crosshair")
      .attr("transform", `translate(${P.x},${P.y})`)
      .attr("opacity", opacity);

    // horizontal arm
    grp.append("line")
      .attr("x1", -size).attr("y1", 0)
      .attr("x2", size).attr("y2", 0)
      .attr("stroke", color)
      .attr("stroke-width", strokeWidth)
      .attr("vector-effect", "non-scaling-stroke");

    // vertical arm
    grp.append("line")
      .attr("x1", 0).attr("y1", -size)
      .attr("x2", 0).attr("y2", size)
      .attr("stroke", color)
      .attr("stroke-width", strokeWidth)
      .attr("vector-effect", "non-scaling-stroke");

    if (showDot) {
      grp.append("circle")
        .attr("cx", 0).attr("cy", 0).attr("r", dotR)
        .attr("fill", color)
        .attr("vector-effect", "non-scaling-stroke");
    }
  };

  // 2) Labeled point (uses crosshair under the hood)
  renderPointLabel = (
    P: Pt,
    label: string,
    color: string,
    offset: Pt = { x: 10, y: -10 },
    fontSize: number = 12,
    bg: boolean = true
  ) => (g: any, ui: any) => {
    // marker
    this.renderCrosshair(P, color, 7, 2, 1, true, 2)(g, ui);

    const grp = g.append("g")
      .attr("class", "draft-point-label")
      .attr("transform", `translate(${P.x + offset.x},${P.y + offset.y})`);

    if (bg) {
      // crude background "pill" without measuring text: good enough for drafting UI
      grp.append("rect")
        .attr("x", -4).attr("y", -fontSize)
        .attr("width", Math.max(22, label.length * (fontSize * 0.62)))
        .attr("height", fontSize + 6)
        .attr("rx", 4).attr("ry", 4)
        .attr("fill", "black")
        .attr("opacity", 0.35);
    }

    grp.append("text")
      .text(label)
      .attr("x", 0)
      .attr("y", 0)
      .attr("fill", color)
      .attr("font-size", fontSize)
      .attr("dominant-baseline", "alphabetic")
      .attr("vector-effect", "non-scaling-stroke");
  };

  // 3) Dashed construction line (for guides)
  renderDashedLine = (
    P: Pt,
    Q: Pt,
    color: string,
    dash: string = "6 6",
    strokeWidth: number = 2,
    opacity: number = 0.5
  ) => (g: any, ui: any) => {
    g.append("line")
      .attr("x1", Q.x).attr("y1", Q.y)
      .attr("x2", P.x).attr("y2", P.y)
      .attr("stroke", color)
      .attr("stroke-width", strokeWidth)
      .attr("stroke-dasharray", dash)
      .attr("opacity", opacity)
      .attr("vector-effect", "non-scaling-stroke");
  };

  // 4) Measurement between two points: end ticks + label at midpoint
  renderMeasure = (
    P: Pt,
    Q: Pt,
    label: string,
    color: string,
    tickSize: number = 6,
    fontSize: number = 12,
    offset: number = -10 // offset label along the normal
  ) => (g: any, ui: any) => {
    const dx = Q.x - P.x;
    const dy = Q.y - P.y;
    const len = Math.hypot(dx, dy) || 1;

    // unit direction + normal
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    // main line
    g.append("line")
      .attr("x1", P.x).attr("y1", P.y)
      .attr("x2", Q.x).attr("y2", Q.y)
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("opacity", 0.75);

    // ticks at ends (perpendicular)
    const tick = (A: Pt) => {
      g.append("line")
        .attr("x1", A.x + nx * tickSize).attr("y1", A.y + ny * tickSize)
        .attr("x2", A.x - nx * tickSize).attr("y2", A.y - ny * tickSize)
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("vector-effect", "non-scaling-stroke");
    };
    tick(P); tick(Q);

    // label at midpoint, nudged along normal
    const mx = (P.x + Q.x) / 2 + nx * offset;
    const my = (P.y + Q.y) / 2 + ny * offset;

    g.append("text")
      .text(label)
      .attr("x", mx)
      .attr("y", my)
      .attr("fill", color)
      .attr("font-size", fontSize)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("vector-effect", "non-scaling-stroke");
  };







}