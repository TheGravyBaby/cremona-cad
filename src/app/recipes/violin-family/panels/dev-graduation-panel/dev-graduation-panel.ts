import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { filletRightAngleCorner } from '../../../../helpers/math/draftMath';
import { pathFromRect, samplePathToPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { differenceFromManyPaths, intersectionFromTwoPaths, mirroredLoop } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection, SolveFailure } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { Pt, Rectangle } from '../../../../models/types';
import { RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { familyStandards } from '../../violin-family-seed';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { PLATE_LAYOUT_GAP, purflingPath, ribArcs, RibArcs, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { renderFholePlate } from '../fhole-placement-panel/fhole-placement-panel';
import { channelLoop } from '../fluting-panel/fluting-panel';
import { MouldPanel, solveMould } from '../mould-panel/mould-panel';

// Graduation, tried out on localhost only and carried without promise of support. For now it maps
// the ground: the plates each with the rib line inside their edge, the top with both holes, the back
// to its left with the button, as the outer contour lays them out, and inside the rib line the neck
// and end blocks and the two loops the solve makes, the linings' inner face and the boundary the
// graduation starts at. Its settings are kept off the file until the stage is official: they live
// in the tab's working state, and their shapes and solve live here. Panel and render, then the solve.

// where the plates can be graduated: every number is read in from the rib line (the ribs' inner
// face). `lining` is the strip glued inside the ribs, so the glue platform ends that far in;
// `edgeInset` is where the gouge may start, and `blockMargin` how far short of the neck and end
// blocks' inner faces it stops. Held at 0 for now
export interface GraduationSettings {
  lining: number;
  edgeInset: number;
  blockMargin: number;
}

export type GraduationKey = keyof GraduationSettings;
export type GraduationFailure = SolveFailure<GraduationKey>;

// the ground the plates are graduated on. The neck and end blocks sit inside the rib line, their
// inner faces flat and the corners of those faces rounded. The lining line is the glue platform's
// inner edge: a loop inside the rib line with the corners bypassed as the fluting channel does,
// stepping round the blocks. The boundary is the loop the gouge starts at, cut straight across at
// each block's inner face. Null when a loop can't be made; shared by both plates, the back's drawn
// beside the top
export interface GraduationSolve {
  blocks: { neck: string; end: string } | null;
  lining: string | null;
  boundary: string | null;
  failures: GraduationFailure[];
}

const STATE_KEY = 'violinFamilyDevGraduation';

// the linings by size class, and the gouge held off them by two rib thicknesses
export function defaultGraduation(p: ViolinFamilyParams): GraduationSettings {
  let lining = familyStandards(p.body.height).lining;
  return { lining, edgeInset: lining + 2 * p.body.rib, blockMargin: 0 };
}

@Component({
  selector: 'app-vf-dev-graduation-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-graduation-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevGraduationPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('orchid');

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  settings!: GraduationSettings;
  g!: GraduationSolve;

  ngOnInit(): void {
    this.settings = readSettings() ?? defaultGraduation(this.params);
    this.draw();
  }

  // the panel's own settings, kept for the tab alone: nothing here goes into the file or the undo history
  stateEdited(): void {
    writeWorkingState(STATE_KEY, JSON.stringify(this.settings));
    this.draw();
  }

  report(): void {
    reportFailures(this.g.failures, 'Graduation');
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
      let g = this.g = solveGraduation(p, this.settings)!;
      this.drawn.emit([
        renderFholePlate(p, this.pal, rib, false),
        renderBackPlate(p, this.pal, rib),
        renderGraduation(p, g, this.pal),
        renderSolveFailures(g.failures, this.pal.alert, true),
      ]);
    });
  }
}

function readSettings(): GraduationSettings | null {
  try {
    let parsed = JSON.parse(readWorkingState(STATE_KEY) ?? 'null');
    return parsed && typeof parsed.lining === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

const renderBackPlate = (p: ViolinFamilyParams, pal: PanelPalette, rib: RibArcs | null) => (g: any, ui: any): void => {
  let o = solveOuterContour(p);
  let dx = -p.body.width * PLATE_LAYOUT_GAP;
  if (o?.back) renderPath(translatePath(o.back, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  if (o?.button) renderPath(translatePath(o.button.path, dx, 0), pal.neutral, STROKE_WEIGHT.trace)(g, ui);
  let inner = rib ? purflingPath(p, rib, 0) : null;
  if (inner) renderPath(translatePath(inner, dx, 0), pal.neutral, STROKE_WEIGHT.guide)(g, ui);
};

// the blocks as faint fills, the lining line and the boundary, on both plates, each in its own ink
export const renderGraduation = (p: ViolinFamilyParams, s: GraduationSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  for (let dx of [0, -p.body.width * PLATE_LAYOUT_GAP]) {
    for (let block of s.blocks ? [s.blocks.neck, s.blocks.end] : []) {
      renderFilledPath(translatePath(block, dx, 0), pal.ink(2), 0.15)(g, ui);
      renderPath(translatePath(block, dx, 0), pal.ink(2), STROKE_WEIGHT.guide)(g, ui);
    }
    if (s.lining) renderPath(translatePath(s.lining, dx, 0), pal.ink(0), STROKE_WEIGHT.guide)(g, ui);
    if (s.boundary) renderPath(translatePath(s.boundary, dx, 0), pal.ink(1), STROKE_WEIGHT.trace)(g, ui);
  }
};

// how much of a block's height its inner corners are rounded by
const BLOCK_FILLET = 0.3;

// a neck or end block as the mould sizes it, trimmed to the rib line, its inner face flat and the
// face's two corners rounded. `inward` is +1 for a block whose face looks down the body (the neck
// block), -1 for one looking up (the end block). The loop reaches past the rib line and is cut to
// it, so the block's outer face is the ribs' inner face whatever the outline does there
function blockShape(ribLine: string, rect: Rectangle, inward: 1 | -1): string {
  let halfWidth = Math.abs(rect.Pt2.x - rect.Pt1.x) / 2;
  let height = Math.abs(rect.Pt2.y - rect.Pt1.y);
  let face = inward > 0 ? Math.min(rect.Pt1.y, rect.Pt2.y) : Math.max(rect.Pt1.y, rect.Pt2.y);
  let beyond = face + inward * (height + 10);
  let r = Math.min(BLOCK_FILLET * height, halfWidth);
  let fillet = filletRightAngleCorner(new Pt(halfWidth, face), new Pt(-1, inward), r)!;
  let loop = mirroredLoop(
    [[new Pt(halfWidth, beyond), new Pt(halfWidth, face + inward * r)], fillet, [new Pt(halfWidth - r, face), new Pt(0, face)]],
    [[new Pt(halfWidth, beyond), new Pt(-halfWidth, beyond)]],
  );
  return intersectionFromTwoPaths(ribLine, loop);
}


// a later panel reads the loops by calling this; it returns and never writes to the params. Both
// loops are the channel's construction run from the rib line rather than the fluting edge, and kept
// inside the rib line itself. The last answer is kept against the params and settings it was solved
// from (the joins are the slow part, as in the fluting); nothing of it reaches the file
let last: { key: string; solve: GraduationSolve } | null = null;

export function solveGraduation(p: ViolinFamilyParams, gr: GraduationSettings): GraduationSolve | null {
  if (!p.outerContour || !p.corners || !p.bouts) return null;
  let key = JSON.stringify([p.body, p.bouts, p.corners, p.outerContour, gr]);
  if (last?.key === key) return last.solve;
  let solve = solveGraduationUncached(p, gr);
  last = { key, solve };
  return solve;
}

function solveGraduationUncached(p: ViolinFamilyParams, gr: GraduationSettings): GraduationSolve {
  let s: GraduationSolve = { blocks: null, lining: null, boundary: null, failures: [] };
  let fail = (message: string, unsolved: GraduationFailure['unsolved']): GraduationFailure => ({ message, unsolved, circles: [], segments: [] });

  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  let ribLine = rib ? purflingPath(p, rib, 0) : null;
  if (!rib || !ribLine) {
    s.failures.push(fail('Graduation: the rib outline has to solve first.', ['lining', 'edgeInset', 'blockMargin']));
    return s;
  }
  let edge = samplePathToPolyline(ribLine, 0.5);

  // the blocks are the mould's; before the mould is drafted they are what its seed would make
  let q = p.mould ? p : { ...p };
  MouldPanel.seed(q);
  let blocks = solveMould(q)?.blocks ?? null;
  let faces = { neck: Infinity, end: -Infinity };
  solveSection(s.failures, 'Blocks', ['blockMargin'], () => {
    if (!blocks) return fail('Graduation: the neck and end blocks have to solve first.', ['blockMargin']);
    if (!(Number.isFinite(gr.blockMargin) && gr.blockMargin >= 0)) return fail('Graduation: the block margin needs a value of 0 or more.', ['blockMargin']);
    faces.neck = Math.min(blocks.neck.Pt1.y, blocks.neck.Pt2.y) - gr.blockMargin;
    faces.end = Math.max(blocks.end.Pt1.y, blocks.end.Pt2.y) + gr.blockMargin;
    if (!(faces.end < faces.neck)) return fail('Graduation: the blocks meet in the middle; nothing is left to graduate.', ['blockMargin']);
    s.blocks = { neck: blockShape(ribLine, blocks.neck, 1), end: blockShape(ribLine, blocks.end, -1) };
    return null;
  });

  let loop = (inset: number, key: 'lining' | 'edgeInset', label: string): string | null => {
    let made = channelLoop(p, rib!, -inset, -inset, edge);
    if (!made.joined) {
      s.failures.push(fail(`Graduation: the ${label} can't be carried round the C bout at these corners. Bring it in less, or open the corners.`, [key]));
      return null;
    }
    if (!made.path) s.failures.push(fail(`Graduation: the ${label} doesn't close into one loop this far in; it has eaten the neck face.`, [key]));
    return made.path;
  };

  solveSection(s.failures, 'Lining', ['lining'], () => {
    if (!(Number.isFinite(gr.lining) && gr.lining > 0)) return fail('Graduation: the lining needs a thickness above 0.', ['lining']);
    let made = loop(gr.lining, 'lining', 'lining line');
    // the linings run into the blocks, so the platform's edge steps round them
    s.lining = made && s.blocks ? differenceFromManyPaths(made, [s.blocks.neck, s.blocks.end]) : made;
    return null;
  });
  solveSection(s.failures, 'Edge inset', ['edgeInset'], () => {
    if (!Number.isFinite(gr.edgeInset)) return fail('Graduation: the edge inset needs a value.', ['edgeInset']);
    if (!(gr.edgeInset >= gr.lining)) return fail('Graduation: the edge inset has to reach at least to the linings, or the gouge would cut the glue platform.', ['edgeInset']);
    let made = loop(gr.edgeInset, 'edgeInset', 'boundary');
    if (!made) return null;
    if (!s.blocks) { s.boundary = made; return null; }
    let between = new Rectangle(new Pt(-p.body.width, faces.end), new Pt(p.body.width, faces.neck));
    let cut = intersectionFromTwoPaths(made, pathFromRect(between));
    if (!cut.trim()) return fail('Graduation: nothing of the boundary is left between the blocks.', ['edgeInset']);
    s.boundary = cut;
    return null;
  });
  return s;
}
