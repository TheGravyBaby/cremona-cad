import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildCalculixDeck, buildTriangleMesh, saveDeckFile, FemMaterial, FemShellSet } from '../../../../helpers/femExporter';
import { cross3, stepAlong3, subVec3, TURN, vecAtAngle } from '../../../../helpers/math/simpleGeometry';
import { makeMonotoneSpline } from '../../../../helpers/math/vibeMath';
import { pathFromPolyline } from '../../../../helpers/math/pathMath';
import { heightFieldNormalAt } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { Pt, Pt3D, Vec3 } from '../../../../models/types';
import { PlateWood, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, Wood, WoodSpecies } from '../../violin-family-types';
import { FemSolve, Plate, SurfaceRow } from '../../violin-family-solves';
import { PanelComponentBase } from '../panel-component-base';
import { rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { CONTOUR_INTERVAL, rampFill, solveGraduation, thicknessField } from '../dev-graduation-panel/dev-graduation-panel';
import { solveBassBar } from '../dev-bassbar-panel/dev-bassbar-panel';
import { PLATE_LAYOUT_GAP, renderPlateContour, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';

// A plate as shell elements for finite element analysis, tried out on localhost only, once the
// plates are graduated: the wood each part is cut from, the mesh drawn over the plate in the
// thickness each element carries, and a CalculiX deck asking for the free plate's modes. Panel and
// render, then the solve, then the deck.

const BAR_INK = 0;
// a violin's plate meshes well at 6 mm; the bigger instruments scale from it
const SEED_STEP_SHARE = 6 / 356;
// under this share of the body an element is finer than a plate's modes need and the mesh too big to draw
const MIN_STEP_SHARE = 1.5 / 356;
// the holes' outlines turn tighter than the plate's, so they are stepped off this much closer
const HOLE_STEP_SHARE = 0.5;
// how far either side the outside is read for its slope
const NORMAL_STEP = 0.25;
// a stretch of the bar shallower than this carries no web
const MIN_WEB = 0.2;
// a free plate's first six modes are it moving whole, at no frequency
const RIGID_MODES = 6;

// the constants nobody measures on a billet, as ratios to the stiffness along the grain, with the
// Poisson ratios: USDA Wood Handbook (FPL-GTR-190) tables 5-1 and 5-2 at 12 % moisture, Sitka spruce
// and sugar maple. The handbook gives sugar maple no GRT; 0.02 is where its other hardwoods sit
interface SpeciesRatios {
  ER: number; ET: number;
  GLR: number; GLT: number; GRT: number;
  nuLR: number; nuLT: number; nuRT: number; nuTR: number;
}

const SPECIES: Record<WoodSpecies, SpeciesRatios> = {
  spruce: { ER: 0.078, ET: 0.043, GLR: 0.064, GLT: 0.061, GRT: 0.003, nuLR: 0.372, nuLT: 0.467, nuRT: 0.435, nuTR: 0.245 },
  maple: { ER: 0.132, ET: 0.065, GLR: 0.111, GLT: 0.063, GRT: 0.02, nuLR: 0.424, nuLT: 0.476, nuRT: 0.774, nuTR: 0.349 },
};

export interface FemMeshOptions {
  plate: Plate;
  // the element size, mm
  step: number;
  // whether the top carries its bar
  bar: boolean;
}

@Component({
  selector: 'app-vf-dev-fem-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-fem-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevFemPanel extends PanelComponentBase implements OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('lamplight');
  @Input() fileName = '';

  // typical tonewood, for the fields to start from: nobody's billet
  static seed(p: ViolinFamilyParams): void {
    if (p.wood || !p.graduation) return;
    p.wood = {
      top: { species: 'spruce', density: 420, stiffness: 12, cut: 'quarter' },
      back: { species: 'maple', density: 620, stiffness: 11, cut: 'quarter' },
      bassBar: { species: 'spruce', density: 420, stiffness: 12 },
    };
  }

  // what is exported and how finely: choices about the run, not the instrument, so not in the file
  options: FemMeshOptions = { plate: 'top', step: 6, bar: true };
  modes = 12;
  // the mesh as last built, while it still answers to the fields; null before a build and once
  // anything it was built from has moved, when only the plates' outlines are drawn
  s: FemSolve | null = null;

  get plateWood(): PlateWood {
    return this.params.wood![this.options.plate];
  }

  get barWood(): Wood {
    return this.params.wood!.bassBar;
  }

  get hasBar(): boolean {
    return this.options.plate === 'top' && !!this.params.bassBar;
  }

  get minAngle(): number {
    return this.s!.minAngle / TURN.degree;
  }

  get plateGrams(): number {
    return this.s!.plateVolume * this.plateWood.density * 1e-6;
  }

  get barGrams(): number {
    return this.s!.barVolume * this.barWood.density * 1e-6;
  }

  override ngOnInit(): void {
    this.options.step = Math.round(2 * this.params.body.height * SEED_STEP_SHARE) / 2;
    super.ngOnInit();
  }

  reportSolveFailures(): void {
    if (this.s) reportFailures(this.s.failures, 'Dev FEM');
  }

  // a mesh takes seconds, so it is built when asked for and never on a field's edit
  buildMesh(): void {
    solveFem(this.params, this.options);
    this.drawCanvas();
    this.reportSolveFailures();
  }

  exportDeck(): void {
    this.buildMesh();
    let s = this.s;
    if (!s || s.failures.length) return;
    if (!(this.modes > 0)) {
      reportFailures([buildMiss('Modes: the number of modes needs a value above 0.', ['mesh'])], 'Dev FEM');
      return;
    }
    let name = this.fileName.trim() || 'violin-family';
    saveDeckFile(`${name}-${this.options.plate}.inp`, buildFemDeck(this.params, s, this.modes, name));
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let s = this.s = isFemBuilt(p, this.options) ? solveFem(p, this.options) : null;
    let outlines = [renderPlateContour(p, solvePlateContour(p)!, this.pal, this.flags, false), renderFholes(p, this.pal)];
    if (!s) return outlines;
    // the back lies to the top's left, as the plate contour lays the two out
    let dx = s.plate === 'back' ? -p.body.width * PLATE_LAYOUT_GAP : 0;
    return [
      ...outlines,
      renderTranslatedLayers([renderFemMesh(s, this.pal), renderSolveFailures(s.failures, this.pal.alert)], dx),
    ];
  }
}

// the mesh in plan, every element filled in the thickness it carries, banded as the graduation
// map is, so what the deck holds can be checked against what was graduated; the bar's web is the
// line it stands on
export const renderFemMesh = (s: FemSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!s.triangles.length) return;
  let lo = Math.min(...s.thickness), hi = Math.max(...s.thickness);
  let scale = { lo, hi: Math.max(hi, lo + CONTOUR_INTERVAL) };
  let bands = new Map<number, string[]>();
  for (let [a, b, c] of s.triangles) {
    let level = Math.floor((s.thickness[a] + s.thickness[b] + s.thickness[c]) / 3 / CONTOUR_INTERVAL);
    let d = pathFromPolyline([s.plan[a], s.plan[b], s.plan[c]], true);
    if (bands.has(level)) bands.get(level)!.push(d);
    else bands.set(level, [d]);
  }
  for (let [level, paths] of bands) {
    renderFilledPath(paths.join(' '), rampFill(pal, scale, (level + 0.5) * CONTOUR_INTERVAL), 1, 'nonzero')(g, ui);
  }
  renderPath([...bands.values()].flat().join(' '), pal.neutral, STROKE_WEIGHT.guide, 0.5)(g, ui);
  if (s.web.length) {
    let foot = [s.plan[s.web[0][3]], ...s.web.map(quad => s.plan[quad[2]])];
    renderPath(pathFromPolyline(foot), pal.ink(BAR_INK), STROKE_WEIGHT.section)(g, ui);
  }
};

// the mesh is the slow part and no wood field moves it, so it is kept against everything else
let last: { key: string; mesh: FemSolve } | null = null;

const femKey = (p: ViolinFamilyParams, options: FemMeshOptions): string => JSON.stringify([options, { ...p, wood: undefined }]);

// whether the kept mesh is of these params and options, so reading it costs nothing
export function isFemBuilt(p: ViolinFamilyParams, options: FemMeshOptions): boolean {
  return last?.key === femKey(p, options);
}

// a later panel reads the mesh by calling this; it returns and never writes to the params
export function solveFem(p: ViolinFamilyParams, options: FemMeshOptions): FemSolve | null {
  if (!p.graduation) return null;
  let key = femKey(p, options);
  if (last?.key !== key) last = { key, mesh: solveFemMesh(p, options) };
  let s: FemSolve = { ...last.mesh, failures: [...last.mesh.failures] };

  solveSection(s.failures, 'Wood', ['wood'], () => {
    if (!p.wood) return null;
    let woods = options.plate === 'top' && s.web.length ? [p.wood.top, p.wood.bassBar] : [p.wood[options.plate]];
    let values = woods.flatMap(w => [w.density, w.stiffness]);
    let blank = buildBlankMiss('Wood', ['wood'], values);
    if (blank) return blank;
    if (values.some(v => !(v > 0))) return buildMiss('Wood: the density and stiffness need values above 0.', ['wood']);
    return null;
  });
  return s;
}

function solveFemMesh(p: ViolinFamilyParams, options: FemMeshOptions): FemSolve {
  let { plate, step } = options;
  let s: FemSolve = {
    plate, plan: [], nodes: [], normals: [], thickness: [], corners: 0, triangles: [], web: [],
    webVolume: 0, plateVolume: 0, barVolume: 0, minAngle: 0, failures: [],
  };
  let bb = options.bar && plate === 'top' ? p.bassBar : undefined;
  let b = bb ? solveBassBar(p, 1) : null;
  let foot: [Pt, Pt] | null = null;

  solveSection(s.failures, 'Bass bar', ['bar'], () => {
    if (!bb) return null;
    if (!b?.lowerLeft || !b.lowerRight || !b.upperLeft || !b.upperRight || b.knots.length < 2 || b.failures.length) {
      return buildMiss('Bass bar: the bar has to solve before it can be meshed; the top is meshed without it.', ['bar']);
    }
    foot = [
      new Pt((b.lowerLeft.x + b.lowerRight.x) / 2, (b.lowerLeft.y + b.lowerRight.y) / 2),
      new Pt((b.upperLeft.x + b.upperRight.x) / 2, (b.upperLeft.y + b.upperRight.y) / 2),
    ];
    return null;
  });

  solveSection(s.failures, 'Mesh', ['mesh'], () => {
    let blank = buildBlankMiss('Mesh', ['mesh'], [step]);
    if (blank) return blank;
    let finest = Math.round(10 * p.body.height * MIN_STEP_SHARE) / 10;
    if (step < finest) return buildMiss(`Mesh: an element size under ${finest} mm is finer than a plate's modes need.`, ['mesh']);
    let surface = solveCrossArching(p)?.[plate];
    let field = thicknessField(p, plate);
    if (!surface || !field) return buildMiss(`Mesh: the ${plate} has no thickness readings yet; graduate it first.`, ['mesh']);
    let holes = plate === 'top' ? solveGraduation(p)?.holes ?? [] : [];
    let mesh = buildTriangleMesh(surface.outline, holes, foot ? [foot] : [], step, step * HOLE_STEP_SHARE);

    // a row is the slow part of a surface read; the lattice shares its rows
    let rows = new Map<number, SurfaceRow>();
    let zAt = (x: number, y: number): number | null => {
      let row = rows.get(y) ?? rows.set(y, rowAt(surface, y)).get(y)!;
      return surfaceZAt(surface, x, y, row);
    };
    for (let q of mesh.nodes) {
      // a node on the outline can read as just off the plate, where the land is level
      let z = zAt(q.x, q.y) ?? 0;
      let normal = heightFieldNormalAt(zAt, q.x, q.y, z, NORMAL_STEP);
      let thickness = field.at(q.x, q.y);
      s.plan.push(q);
      s.normals.push(normal);
      s.thickness.push(thickness);
      s.nodes.push(stepAlong3(new Pt3D(q.x, q.y, z), normal, -thickness / 2));
    }
    s.corners = mesh.corners;
    s.triangles = mesh.triangles;
    s.minAngle = mesh.minAngle;
    for (let [a, c, e] of mesh.triangles) {
      let area = cross3(subVec3(s.nodes[c], s.nodes[a]), subVec3(s.nodes[e], s.nodes[a]));
      s.plateVolume += Math.hypot(area.x, area.y, area.z) / 2 * (s.thickness[a] + s.thickness[c] + s.thickness[e]) / 3;
    }

    if (bb && b && foot && mesh.lineNodes[0]?.length) pushBarWeb(s, mesh.lineNodes[0], foot[0], bb.width, makeMonotoneSpline(b.knots.map(k => k.bottom.y), b.knots.map(k => k.bottom.x)));

    if (mesh.lost.length) {
      let miss = buildMiss('Mesh: the elements don\'t follow the edge at the marks; try a smaller element size.', ['mesh']);
      miss.segments = mesh.lost;
      return miss;
    }
    return null;
  });
  return s;
}

// the bar as a web: under each node along its foot a node on its underside, and between each pair
// of corners a quadrilateral, its upper edge the plate's own. The web hangs from the plate's
// mid-surface, half a plate above the bar's glued face, so its volume is kept beside the bar's own
function pushBarWeb(s: FemSolve, along: number[], lowerEnd: Pt, width: number, bottomZAt: (station: number) => number): void {
  let under: number[] = [];
  let depth: number[] = [];
  for (let n of along) {
    let top = s.nodes[n];
    let z = bottomZAt(Math.hypot(s.plan[n].x - lowerEnd.x, s.plan[n].y - lowerEnd.y));
    under.push(s.nodes.length);
    depth.push(top.z - z);
    s.nodes.push(new Pt3D(top.x, top.y, z));
    s.plan.push(s.plan[n]);
    s.normals.push(s.normals[n]);
    s.thickness.push(width);
  }
  let middles = new Map<number, number>();
  for (let k = 0; k + 2 < along.length; k += 2) {
    if (depth[k] < MIN_WEB || depth[k + 2] < MIN_WEB) continue;
    for (let end of [k, k + 2]) {
      if (middles.has(end)) continue;
      let top = s.nodes[along[end]], bottom = s.nodes[under[end]];
      middles.set(end, s.nodes.length);
      s.nodes.push(new Pt3D((top.x + bottom.x) / 2, (top.y + bottom.y) / 2, (top.z + bottom.z) / 2));
      s.plan.push(s.plan[along[end]]);
      s.normals.push(s.normals[along[end]]);
      s.thickness.push(width);
    }
    s.web.push([under[k], under[k + 2], along[k + 2], along[k], under[k + 1], middles.get(k + 2)!, along[k + 1], middles.get(k)!]);
    let run = Math.hypot(s.plan[along[k + 2]].x - s.plan[along[k]].x, s.plan[along[k + 2]].y - s.plan[along[k]].y);
    let carved = [k, k + 2].map(end => Math.max(0, depth[end] - s.thickness[along[end]] * s.normals[along[end]].z / 2));
    s.webVolume += width * run * (depth[k] + depth[k + 2]) / 2;
    s.barVolume += width * run * (carved[0] + carved[1]) / 2;
  }
}

// a wood's nine constants in the deck's units, in axes that run 1 along the grain, 2 as `second`
// says and 3 the way that is left: across the rings (R) or along them (T)
export function calcWoodMaterial(name: string, wood: Wood, second: 'R' | 'T', densityShare = 1): FemMaterial {
  let r = SPECIES[wood.species];
  let E = wood.stiffness * 1000;
  let density = wood.density * 1e-12 * densityShare;
  return second === 'R'
    ? { name, density, E1: E, E2: E * r.ER, E3: E * r.ET, nu12: r.nuLR, nu13: r.nuLT, nu23: r.nuRT, G12: E * r.GLR, G13: E * r.GLT, G23: E * r.GRT }
    : { name, density, E1: E, E2: E * r.ET, E3: E * r.ER, nu12: r.nuLT, nu13: r.nuLR, nu23: r.nuTR, G12: E * r.GLT, G13: E * r.GLR, G23: E * r.GRT };
}

// the deck for a free plate: no supports, so the first six modes are the plate moving whole and
// that many more are asked for. A carved plate's grain runs straight up the body whatever the arch
// does, so one orientation serves every element: on the quarter the rings stand across the plate,
// on the slab they lie in it. The bar's grain follows the bar, its rings upright
export function buildFemDeck(p: ViolinFamilyParams, s: FemSolve, modes: number, name: string): string {
  let wood = p.wood!;
  let plateName = s.plate.toUpperCase();
  let heading = [`${name}, ${s.plate} plate, free`];
  let materials = [calcWoodMaterial(`${plateName}_WOOD`, wood[s.plate], wood[s.plate].cut === 'quarter' ? 'R' : 'T')];
  let orientations = [{ name: 'PLATE_GRAIN', x: { x: 0, y: 1, z: 0 }, xy: { x: -1, y: 0, z: 0 } }];
  let sets: FemShellSet[] = [{ name: plateName, type: 'S6', elements: s.triangles, material: `${plateName}_WOOD`, orientation: 'PLATE_GRAIN', thickness: null, ownNormals: true }];
  if (s.web.length) {
    let along: Vec3 = { ...vecAtAngle(p.bassBar!.angle * TURN.degree), z: 0 };
    // the web's upper half-plate of wood is the plate's already, so the bar's weight is spread over the web
    let share = s.barVolume / s.webVolume;
    heading.push(`** bass bar: density scaled by ${share.toFixed(3)}, the web hanging from the plate's mid-surface`);
    materials.push(calcWoodMaterial('BAR_WOOD', wood.bassBar, 'T', share));
    orientations.push({ name: 'BAR_GRAIN', x: along, xy: { x: 0, y: 0, z: 1 } });
    sets.push({ name: 'BASS_BAR', type: 'S8R', elements: s.web, material: 'BAR_WOOD', orientation: 'BAR_GRAIN', thickness: p.bassBar!.width, ownNormals: false });
  }
  return buildCalculixDeck({ heading, nodes: s.nodes, thickness: s.thickness, normals: s.normals, sets, materials, orientations, modes: modes + RIGID_MODES });
}
