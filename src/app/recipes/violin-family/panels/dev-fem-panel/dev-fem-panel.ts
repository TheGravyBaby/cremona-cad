import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMidsides, buildCalculixDeck, buildEdgeBand, buildTriangleMesh, saveDeckFile, FemMaterial, FemOrientation, FemShellSet, FemSolidSet, TriangleMesh } from '../../../../helpers/femExporter';
import { clamp, cross3, dist, dot, pointInPolygon, pointOnCircle, signedArcSweep, signedPolygonArea, stepAlong3, subVec, subVec3, TURN, vecAtAngle } from '../../../../helpers/math/simpleGeometry';
import { makeMonotoneSpline, pointAtPolylineLength, polylineCumulativeLengths, polylineSlice, projectOntoPolyline } from '../../../../helpers/math/vibeMath';
import { applyMatrix, pathFromPolyline, translatePath } from '../../../../helpers/math/pathMath';
import { flattenPath, heightFieldNormalAt } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPath, renderSolveFailures, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { Circle, Pt, Pt3D, Vec3 } from '../../../../models/types';
import { PlateWood, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey, Wood, WoodSpecies } from '../../violin-family-types';
import { FemFailure, FemSolve, GarlandFemSolve, GarlandRun, NeckFemSolve, NeckSolve, Plate, ScrollSolve, SurfaceRow, ViolinFemSolve } from '../../violin-family-solves';
import { PanelComponentBase } from '../panel-component-base';
import { updateSolved } from '../../violin-family-solved';
import { rowAt, solvedCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { CONTOUR_INTERVAL, rampFill, renderGarland, solvedGraduation, solvedThicknessField } from '../dev-graduation-panel/dev-graduation-panel';
import { solveBassBar } from '../dev-bassbar-panel/dev-bassbar-panel';
import { definePurflingPath, PLATE_LAYOUT_GAP, renderPlateContour, solvedPlateContour } from '../plate-contour-panel/plate-contour-panel';
import { renderFholes } from '../fhole-contours-panel/fhole-contours-panel';
import { solvedRibArcs } from '../corners-panel/corners-panel';
import { calcTopPlatePlacement, placeOnTopPlate, ribHeightAt, solveRibTaper } from '../long-arching-panel/long-arching-panel';
import { calcNeckTaper, calcScrollOnNeck, defineNeckInPlan, neckHalfWidthAt } from '../neck-panel/neck-panel';
import { defineSideScrollPath, solveScroll } from '../pegbox-panel/pegbox-panel';
import { calcPegboxCavity, pegboxWidthAt } from '../scroll-widths-panel/scroll-widths-panel';
import { defineFingerboardInPlan, fingerboardRadiusAt, solveStringSetup } from '../string-setup-panel/string-setup-panel';

// A plate as shell elements for finite element analysis, tried out on localhost only, once the
// plates are graduated: the wood each part is cut from, the mesh drawn over the plate in the
// thickness each element carries, and a CalculiX deck asking for the free plate's modes. The rib
// garland is a part beside the two plates: ribs as shells, linings and blocks as solids. The neck
// is another: neck, head and fingerboard as solids. The violin is all of them glued up. Panel and
// renders, then the plate's solve and deck, then the garland's, the neck's and the violin's.

const BAR_INK = 0;
const RIB_INK = 1;
const BLOCK_INK = 2;
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
// how finely the rib line is read before it is stepped off
const RIB_READ = 0.25;
// a block's corner node this close to the rib line stands on it, and a midside node within this
// share of the element size, being halfway along a chord of it
const ON_RIB = 0.1;
const MIDSIDE_ON_RIB = 0.15;
// the rib line turning more than this at one node is two ribs meeting, not one bending
const RIB_JOINT_TURN = Math.PI / 3;
// how finely the neck's side view is read before it is stepped off, and how many chords the heel's
// cove is read as
const SIDE_READ = 0.25;
const HEEL_CHORDS = 16;
// nothing drafted says how the neck's back is rounded. Its section is taken as a round whose half
// width falls away with depth below the fingerboard, to half the neck's at the back, which makes
// it about 0.85 of the block it is carved from
const NECK_ROUND = 0.75;
// the sound post is meshed six-sided: a hexagon this much wider than the post has its section's area
const POST_HEXAGON = Math.sqrt(TURN.full / (3 * Math.sqrt(3)));
// how far the heel's flat end may stand off the neck block's curved face and still be glued to it,
// as a share of the body
const HEEL_GAP_SHARE = 3 / 356;
// ribs whose grain runs within half of this of one another share an orientation, degrees
const GRAIN_STEP = 10;

// the constants nobody measures on a billet, as ratios to the stiffness along the grain, with the
// Poisson ratios: USDA Wood Handbook (FPL-GTR-190) tables 5-1 and 5-2 at 12 % moisture, Sitka spruce
// and sugar maple. The handbook gives sugar maple no GRT; 0.02 is where its other hardwoods sit
interface SpeciesRatios {
  ER: number; ET: number;
  GLR: number; GLT: number; GRT: number;
  nuLR: number; nuLT: number; nuRT: number; nuTR: number;
}

const SPECIES: Record<WoodSpecies, SpeciesRatios> = {
  // the handbook has no ebony: its ratios are taken as sugar maple's, another dense hardwood
  ebony: { ER: 0.132, ET: 0.065, GLR: 0.111, GLT: 0.063, GRT: 0.02, nuLR: 0.424, nuLT: 0.476, nuRT: 0.774, nuTR: 0.349 },
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
    if (!p.graduation) return;
    let spruce: Wood = { species: 'spruce', density: 420, stiffness: 12 };
    let maple: Wood = { species: 'maple', density: 620, stiffness: 11 };
    let ebony: Wood = { species: 'ebony', density: 1150, stiffness: 17 };
    if (!p.wood) {
      p.wood = {
        top: { ...spruce, cut: 'quarter' }, back: { ...maple, cut: 'quarter' }, bassBar: { ...spruce },
        ribs: { ...maple }, linings: { ...spruce }, blocks: { ...spruce }, neck: { ...maple }, fingerboard: { ...ebony }, soundPost: { ...spruce },
      };
    }
    // a file whose wood was seeded before the garland or the neck had any
    p.wood.ribs ??= { ...maple };
    p.wood.linings ??= { ...spruce };
    p.wood.blocks ??= { ...spruce };
    p.wood.neck ??= { ...maple };
    p.wood.fingerboard ??= { ...ebony };
    p.wood.soundPost ??= { ...spruce };
  }

  // what is exported and how finely: choices about the run, not the instrument, so not in the file
  part: Plate | 'garland' | 'neck' | 'violin' = 'top';
  options: FemMeshOptions = { plate: 'top', step: 6, bar: true };
  // whether the violin carries its sound post
  post = true;
  modes = 12;
  // the mesh as last built, while it still answers to the fields; null before a build and once
  // anything it was built from has moved, when only the plates' outlines are drawn
  s: FemSolve | null = null;
  garland: GarlandFemSolve | null = null;
  neck: NeckFemSolve | null = null;
  violin: ViolinFemSolve | null = null;

  // what each part of the built violin weighs, grams
  get violinWeights(): { title: string; grams: number }[] {
    let wood = this.params.wood!, v = this.violin!.volumes;
    return [
      { title: 'Top', grams: v.top * wood.top.density * 1e-6 },
      { title: 'Bass bar', grams: v.bassBar * wood.bassBar.density * 1e-6 },
      { title: 'Back', grams: v.back * wood.back.density * 1e-6 },
      { title: 'Ribs', grams: v.ribs * wood.ribs.density * 1e-6 },
      { title: 'Linings', grams: v.linings * wood.linings.density * 1e-6 },
      { title: 'Blocks', grams: v.blocks * wood.blocks.density * 1e-6 },
      { title: 'Neck', grams: v.neck * wood.neck.density * 1e-6 },
      { title: 'Fingerboard', grams: v.fingerboard * wood.fingerboard.density * 1e-6 },
      { title: 'Sound post', grams: v.soundPost * wood.soundPost.density * 1e-6 },
    ];
  }

  get violinGrams(): number {
    return this.violinWeights.reduce((sum, part) => sum + part.grams, 0);
  }

  get violinElements(): number {
    let v = this.violin!;
    return v.top.length + v.back.length + v.web.length + v.blocks.length + v.neck.length + v.board.length + v.post.length
      + v.runs.reduce((sum, run) => sum + run.ribs.length + run.linings.length, 0);
  }

  // the woods of the garland or the neck, whichever is picked, each with what was meshed of it
  get partWoods(): { title: string; wood: Wood; volume: number }[] {
    let wood = this.params.wood!, g = this.garland, n = this.neck;
    if (this.part === 'neck') {
      return [
        { title: 'Neck', wood: wood.neck, volume: n?.neckVolume ?? 0 },
        { title: 'Fingerboard', wood: wood.fingerboard, volume: n?.boardVolume ?? 0 },
      ];
    }
    return [
      { title: 'Rib', wood: wood.ribs, volume: g?.ribVolume ?? 0 },
      { title: 'Lining', wood: wood.linings, volume: g?.liningVolume ?? 0 },
      { title: 'Block', wood: wood.blocks, volume: g?.blockVolume ?? 0 },
    ];
  }

  // the garland or the neck as last built, whichever is picked
  get assembly(): GarlandFemSolve | NeckFemSolve | null {
    return this.part === 'neck' ? this.neck : this.part === 'garland' ? this.garland : null;
  }

  get assemblyElements(): number {
    if (this.part === 'neck') return this.neck!.wedges.length + this.neck!.bricks.length;
    let g = this.garland!;
    return g.runs.reduce((sum, run) => sum + run.ribs.length + run.linings.length, g.wedges.length);
  }

  get assemblyGrams(): number {
    return this.partWoods.reduce((sum, part) => sum + part.volume * part.wood.density * 1e-6, 0);
  }

  pickPart(): void {
    if (this.part === 'top' || this.part === 'back') this.options.plate = this.part;
    this.drawCanvas();
  }

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
    let built = this.violin ?? this.assembly ?? this.s;
    if (built) reportFailures(built.failures, 'Dev FEM');
  }

  // a mesh takes seconds, so it is built when asked for and never on a field's edit
  buildMesh(): void {
    if (this.part === 'garland') solvedFemGarland(this.params, this.options.step);
    else if (this.part === 'neck') solvedFemNeck(this.params, this.options.step);
    else if (this.part === 'violin') solvedFemViolin(this.params, this.options.step, this.options.bar, this.post);
    else solvedFem(this.params, this.options);
    this.drawCanvas();
    this.reportSolveFailures();
  }

  exportDeck(): void {
    this.buildMesh();
    let built = this.violin ?? this.assembly ?? this.s;
    if (!built || built.failures.length) return;
    if (!(this.modes > 0)) {
      reportFailures([buildMiss('Modes: the number of modes needs a value above 0.', ['mesh'])], 'Dev FEM');
      return;
    }
    let name = this.fileName.trim() || 'violin-family';
    if (this.part === 'garland') saveDeckFile(`${name}-garland.inp`, buildGarlandDeck(this.params, this.garland!, this.modes, name));
    else if (this.part === 'neck') saveDeckFile(`${name}-neck.inp`, buildNeckDeck(this.params, this.neck!, this.modes, name));
    else if (this.part === 'violin') saveDeckFile(`${name}-violin.inp`, buildViolinDeck(this.params, this.violin!, this.modes, name));
    else saveDeckFile(`${name}-${this.options.plate}.inp`, buildFemDeck(this.params, this.s!, this.modes, name));
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let pc = solvedPlateContour(p)!;
    let outlines = [renderPlateContour(p, pc, this.pal, this.flags, false), renderFholes(p, this.pal)];
    this.s = this.garland = this.neck = this.violin = null;
    if (this.part === 'violin') {
      // everything as it was drafted, and the top's mesh over it once the violin is built
      let drafted = [...outlines, renderGarland(solvedGraduation(p)!, this.pal), renderNeckInPlan(p, this.pal)];
      let violin = this.violin = isFemViolinBuilt(p, this.options.step, this.options.bar, this.post) ? solvedFemViolin(p, this.options.step, this.options.bar, this.post) : null;
      return violin ? [...drafted, renderFemViolin(violin, this.pal), renderSolveFailures(violin.failures, this.pal.alert)] : drafted;
    }
    if (this.part === 'neck') {
      // the neck and its board in plan as they were drafted, and the mesh's side view once there is one
      let drafted = [...outlines, renderNeckInPlan(p, this.pal)];
      let neck = this.neck = isFemNeckBuilt(p, this.options.step) ? solvedFemNeck(p, this.options.step) : null;
      return neck ? [...drafted, renderFemNeck(p, neck, this.pal), renderSolveFailures(neck.failures, this.pal.alert)] : drafted;
    }
    if (this.part === 'garland') {
      // the garland as it was drafted, and over it the mesh once there is one
      let drafted = [renderGarland(solvedGraduation(p)!, this.pal)];
      let garland = this.garland = isFemGarlandBuilt(p, this.options.step) ? solvedFemGarland(p, this.options.step) : null;
      return garland ? [...drafted, renderFemGarland(garland, this.pal), renderSolveFailures(garland.failures, this.pal.alert)] : drafted;
    }
    let s = this.s = isFemBuilt(p, this.options) ? solvedFem(p, this.options) : null;
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
  let bands = new Map<number, string[]>();
  for (let [a, b, c] of s.triangles) {
    let level = Math.floor((s.thickness[a] + s.thickness[b] + s.thickness[c]) / 3 / CONTOUR_INTERVAL);
    let d = pathFromPolyline([s.plan[a], s.plan[b], s.plan[c]], true);
    if (bands.has(level)) bands.get(level)!.push(d);
    else bands.set(level, [d]);
  }
  for (let [level, paths] of bands) {
    renderFilledPath(paths.join(' '), rampFill((level + 0.5) * CONTOUR_INTERVAL), 1, 'nonzero')(g, ui);
  }
  renderPath([...bands.values()].flat().join(' '), pal.neutral, STROKE_WEIGHT.guide, 0.5)(g, ui);
  if (s.web.length) {
    let foot = [s.plan[s.web[0][3]], ...s.web.map(quad => s.plan[quad[2]])];
    renderPath(pathFromPolyline(foot), pal.ink(BAR_INK), STROKE_WEIGHT.section)(g, ui);
  }
};

// the ribs' inner face, before there is a mesh to stand on it
export const renderRibLine = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  let rib = solvedRibArcs(p);
  let line = rib ? definePurflingPath(p, rib, 0) : null;
  if (line) renderPath(line, pal.ink(RIB_INK), STROKE_WEIGHT.guide)(g, ui);
};

// the garland's mesh in plan over the top: the blocks' wedges from above, and the rib line the
// ribs stand on
export const renderFemGarland = (s: GarlandFemSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!s.ribLine.length) return;
  let blocks = s.triangles.map(tri => pathFromPolyline(tri.map(n => s.plan[n]), true)).join(' ');
  renderFilledPath(blocks, pal.ink(BLOCK_INK), 0.15, 'nonzero')(g, ui);
  renderPath(blocks, pal.ink(BLOCK_INK), STROKE_WEIGHT.guide, 0.5)(g, ui);
  renderPath(pathFromPolyline(s.ribLine.map(n => s.plan[n]), true), pal.ink(RIB_INK), STROKE_WEIGHT.section)(g, ui);
};

// the neck over the body in plan, the fingerboard over the neck
export const renderNeckInPlan = (p: ViolinFamilyParams, pal: PanelPalette) => (g: any, ui: any): void => {
  let setup = p.neck && p.stringSetup ? solveStringSetup(p) : null;
  if (!setup?.neck.neckTop) return;
  renderPath(defineNeckInPlan(p, setup.neck), pal.ink(BLOCK_INK), STROKE_WEIGHT.guide)(g, ui);
  let board = defineFingerboardInPlan(p, setup);
  if (board) renderPath(board, pal.ink(BAR_INK), STROKE_WEIGHT.guide)(g, ui);
};

// the neck's mesh from the side, stood beside the body with the back's gluing plane toward it:
// the wedges' triangles, and the fingerboard's outline over them
export const renderFemNeck = (p: ViolinFamilyParams, s: NeckFemSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!s.triangles.length) return;
  let dx = p.body.width * PLATE_LAYOUT_GAP;
  let wedges = s.triangles.map(tri => pathFromPolyline(tri.map(n => s.side[n]), true)).join(' ');
  renderFilledPath(translatePath(wedges, dx, 0), pal.ink(BLOCK_INK), 0.15, 'nonzero')(g, ui);
  renderPath(translatePath(wedges, dx, 0), pal.ink(BLOCK_INK), STROKE_WEIGHT.guide, 0.5)(g, ui);
  renderPath(translatePath(pathFromPolyline(s.board, true), dx, 0), pal.ink(BAR_INK), STROKE_WEIGHT.section)(g, ui);
};

// the built violin from above: the top's elements, every node where the garland under it put it
export const renderFemViolin = (s: ViolinFemSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  if (!s.top.length) return;
  let top = s.top.map(tri => pathFromPolyline(tri.slice(0, 3).map(n => new Pt(s.nodes[n].x, s.nodes[n].y)), true)).join(' ');
  renderPath(top, pal.neutral, STROKE_WEIGHT.guide, 0.5)(g, ui);
};

// whether the mesh held on the params is of these options: built, and nothing it was built from
// moved since. No wood field is among what clears it
export function isFemBuilt(p: ViolinFamilyParams, options: FemMeshOptions): boolean {
  updateSolved(p);
  return p.solved!.femMesh.solve?.options === JSON.stringify(options);
}

// the mesh as held on the params, with the wood checked against it. It is built first if an edit
// has cleared it or it was built with other options, which takes seconds: the panel asks only once
// isFemBuilt() says it stands, or the button has been pressed
export function solvedFem(p: ViolinFamilyParams, options: FemMeshOptions): FemSolve | null {
  if (!p.graduation) return null;
  updateSolved(p);
  let held = p.solved!.femMesh;
  let built = JSON.stringify(options);
  if (held.solve?.options !== built) held.solve = { options: built, mesh: solveFemMesh(p, options) };
  let s: FemSolve = { ...held.solve.mesh, failures: [...held.solve.mesh.failures] };

  if (p.wood) pushWoodFailure(s.failures, options.plate === 'top' && s.web.length ? [p.wood.top, p.wood.bassBar] : [p.wood[options.plate]]);
  return s;
}

function pushWoodFailure(failures: FemFailure[], woods: Wood[]): void {
  solveSection(failures, 'Wood', ['wood'], () => {
    let values = woods.flatMap(w => [w.density, w.stiffness]);
    let blank = buildBlankMiss('Wood', ['wood'], values);
    if (blank) return blank;
    if (values.some(v => !(v > 0))) return buildMiss('Wood: the density and stiffness need values above 0.', ['wood']);
    return null;
  });
}

// `garland` is given when the plate is to be glued to one: its mesh then stands on the garland's,
// and has a seat for the sound post where `post` stands, as the top's plan has it
function solveFemMesh(p: ViolinFamilyParams, options: FemMeshOptions, garland: GarlandFemSolve | null = null, post: Circle | null = null): FemSolve {
  let { plate, step } = options;
  let s: FemSolve = {
    plate, seat: [], post: [], plan: [], nodes: [], normals: [], thickness: [], corners: 0, triangles: [], web: [],
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
    let surface = solvedCrossArching(p)?.[plate];
    let field = solvedThicknessField(p, plate);
    if (!surface || !field) return buildMiss(`Mesh: the ${plate} has no thickness readings yet; graduate it first.`, ['mesh']);
    let holes = plate === 'top' ? solvedGraduation(p)?.holes ?? [] : [];
    // the back is turned over, so the post's corners run round it the other way and still pair off with the top's
    let side = plate === 'back' ? -1 : 1;
    let hexagon = post ? Array.from({ length: 6 }, (_, k) => new Pt(side * (post.x + post.r * POST_HEXAGON * Math.cos(k * TURN.full / 6)), post.y + post.r * POST_HEXAGON * Math.sin(k * TURN.full / 6))) : null;
    let glued = garland ? buildGluedPlateMesh(surface.outline, holes, foot ? [foot] : [], step, step * HOLE_STEP_SHARE, garland, plate === 'back', hexagon) : null;
    if (garland && !glued) return buildMiss('Mesh: the garland\'s linings and blocks don\'t close into one glued ground under the plate.', ['mesh']);
    let mesh = glued?.mesh ?? buildTriangleMesh(surface.outline, holes, foot ? [foot] : [], step, step * HOLE_STEP_SHARE);
    s.seat = glued?.seat ?? [];
    s.post = glued?.post ?? [];

    // a row is the slow part of a surface read; the lattice shares its rows
    let rows = new Map<number, SurfaceRow>();
    let zAt = (x: number, y: number): number | null => {
      let row = rows.get(y) ?? rows.set(y, rowAt(surface, y)).get(y)!;
      return surfaceZAt(surface, x, y, row);
    };
    let edge = p.arching![plate].thickness;
    mesh.nodes.forEach((q, n) => {
      // a node on the outline can read as just off the plate, where the land is level
      let z = zAt(q.x, q.y) ?? 0;
      s.plan.push(q);
      if (s.seat[n] < -1 || s.seat[n] >= 0) {
        // out at the edge the inside is the flat gluing face, an edge thickness under the outside's
        // edge, whatever the channel does above: the node stays plumb, over its seat if it has one
        s.normals.push({ x: 0, y: 0, z: 1 });
        s.thickness.push(z + edge);
        s.nodes.push(new Pt3D(q.x, q.y, (z - edge) / 2));
        return;
      }
      let normal = heightFieldNormalAt(zAt, q.x, q.y, z, NORMAL_STEP);
      let thickness = field.at(q.x, q.y);
      s.normals.push(normal);
      s.thickness.push(thickness);
      s.nodes.push(stepAlong3(new Pt3D(q.x, q.y, z), normal, -thickness / 2));
    });
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

// a plate's plan mesh made to stand on a garland's: the garland's own blocks and lining tops in
// plan, the band out to the plate's edge zipped onto the rib line, and the open plate within the
// linings and blocks meshed as a plate alone is, from their inner edge. `seat` names the
// garland's plan node under each node; where there is none it is -2 for a node over the edge's
// flat underside, the glued ground and the overhang past it, and -1 for one over the open plate. `turned` is the back, which is
// drawn from outside and so lies on the garland mirrored. `hexagon` is where a sound post's end
// stands: the open plate is meshed round it as round a hole, and the hole filled with six
// triangles about its centre; `post` names their nodes as a FemSolve does. Null where the glued
// ground's inner edge is not one loop
function buildGluedPlateMesh(outline: Pt[], holes: Pt[][], lines: Pt[][], step: number, holeStep: number, g: GarlandFemSolve, turned: boolean, hexagon: Pt[] | null): { mesh: TriangleMesh; seat: number[]; post: number[] } | null {
  let at = g.plan.map(q => new Pt(turned ? -q.x : q.x, q.y));
  let count = g.plan.length;
  // an edge of the ground that only one block or lining has, and no rib stands on, is its inner edge
  let ribbed = new Set<number>();
  for (let k = 0; k < g.ribLine.length; k += 2) {
    let a = g.ribLine[k], b = g.ribLine[(k + 2) % g.ribLine.length];
    ribbed.add(Math.min(a, b) * count + Math.max(a, b));
  }
  let cells = [...g.triangles, ...g.linings];
  let shared = new Map<number, number>();
  for (let cell of cells) {
    for (let k = 0; k < cell.length; k++) {
      let a = cell[k], b = cell[(k + 1) % cell.length];
      let key = Math.min(a, b) * count + Math.max(a, b);
      shared.set(key, (shared.get(key) ?? 0) + 1);
    }
  }
  let beside = new Map<number, number[]>();
  let inner = 0;
  for (let [key, uses] of shared) {
    if (uses !== 1 || ribbed.has(key)) continue;
    let a = Math.floor(key / count), b = key % count;
    beside.set(a, [...(beside.get(a) ?? []), b]);
    beside.set(b, [...(beside.get(b) ?? []), a]);
    inner++;
  }
  if (!inner || [...beside.values()].some(pair => pair.length !== 2)) return null;
  let loop = [beside.keys().next().value!];
  for (let before = -1; loop.length <= inner;) {
    let here = loop[loop.length - 1];
    let next = beside.get(here)!.find(n => n !== before)!;
    if (next === loop[0]) break;
    before = here;
    loop.push(next);
  }
  if (loop.length !== inner) return null;

  let edge = loop.map(n => at[n]);
  let open = buildTriangleMesh(edge, hexagon ? [...holes, hexagon] : holes, lines, step, holeStep, edge);
  let onLoop = new Map(loop.map(n => [`${at[n].x.toFixed(6)} ${at[n].y.toFixed(6)}`, n]));
  let corners: Pt[] = [];
  let seat: number[] = [];
  let cornerOf = new Map<number, number>();
  let openCorner: number[] = [];
  for (let k = 0; k < open.corners; k++) {
    let n = onLoop.get(`${open.nodes[k].x.toFixed(6)} ${open.nodes[k].y.toFixed(6)}`);
    if (n !== undefined) cornerOf.set(n, corners.length);
    openCorner.push(corners.length);
    corners.push(n !== undefined ? at[n] : open.nodes[k]);
    seat.push(n ?? -1);
  }
  for (let n of cells.flat()) {
    if (cornerOf.has(n)) continue;
    cornerOf.set(n, corners.length);
    corners.push(at[n]);
    seat.push(n);
  }
  let triples = open.triangles.map(tri => tri.slice(0, 3).map(k => openCorner[k]));
  // the post's six corners are found among the open plate's nodes; a corner the mesh didn't keep leaves the post off
  let rim = (hexagon ?? []).map(q => openCorner[open.nodes.findIndex((node, k) => k < open.corners && dist(node, q) < 1e-6)]);
  let centre = corners.length;
  if (hexagon && rim.every(n => n !== undefined)) {
    corners.push(new Pt(hexagon.reduce((sum, q) => sum + q.x, 0) / 6, hexagon.reduce((sum, q) => sum + q.y, 0) / 6));
    seat.push(-1);
    for (let k = 0; k < 6; k++) triples.push([centre, rim[k], rim[(k + 1) % 6]]);
  } else {
    rim = [];
  }
  let openCount = triples.length;
  for (let tri of g.triangles) triples.push(tri.map(n => cornerOf.get(n)!));
  for (let [a, b, c, d] of g.linings.map(quad => quad.map(n => cornerOf.get(n)!))) triples.push([a, b, c], [a, c, d]);

  let chain = g.ribLine.filter((_, k) => k % 2 === 0);
  let band = buildEdgeBand(chain.map(n => at[n]), outline, step);
  let outerFrom = corners.length;
  for (let q of band.outer) {
    corners.push(q);
    seat.push(-1);
  }
  for (let tri of band.triangles) triples.push(tri.map(k => k < chain.length ? cornerOf.get(chain[k])! : outerFrom + k - chain.length));

  let nodes = [...corners];
  let { triangles, midsides } = addMidsides(nodes, triples.map(([a, b, c]) => {
    let turn = (nodes[b].x - nodes[a].x) * (nodes[c].y - nodes[a].y) - (nodes[c].x - nodes[a].x) * (nodes[b].y - nodes[a].y);
    return turn > 0 ? [a, b, c] : [a, c, b];
  }));
  while (seat.length < nodes.length) seat.push(-1);
  // a garland edge's midside node may stand off the chord, on the curve; the plate's goes there
  for (let [a, mid, b] of g.edges) {
    let u = cornerOf.get(a), v = cornerOf.get(b);
    let shares = u === undefined || v === undefined ? undefined : midsides.get(Math.min(u, v) * corners.length + Math.max(u, v));
    if (shares === undefined) continue;
    nodes[shares] = at[mid];
    seat[shares] = mid;
  }
  // every other node outside the open plate is over the flat of the edge all the same
  for (let tri of triangles.slice(openCount)) {
    for (let n of tri) {
      if (seat[n] === -1) seat[n] = -2;
    }
  }
  let lineNodes = open.lineNodes.map(line => line.map((k, i) => {
    if (i % 2 === 0) return openCorner[k];
    let u = openCorner[line[i - 1]], v = openCorner[line[i + 1]];
    return midsides.get(Math.min(u, v) * corners.length + Math.max(u, v))!;
  }));
  let post = rim.length ? [
    centre, ...rim,
    ...rim.map(n => midsides.get(Math.min(centre, n) * corners.length + Math.max(centre, n))!),
    ...rim.map((n, k) => midsides.get(Math.min(n, rim[(k + 1) % 6]) * corners.length + Math.max(n, rim[(k + 1) % 6]))!),
  ] : [];
  return { mesh: { nodes, corners: corners.length, triangles, lineNodes, loopNodes: [], lost: open.lost, minAngle: open.minAngle }, seat, post };
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
  let sets: FemShellSet[] = [{ name: plateName, type: 'S6', elements: s.triangles, material: `${plateName}_WOOD`, orientation: 'PLATE_GRAIN', thickness: null, normals: s.normals }];
  if (s.web.length) {
    let along: Vec3 = { ...vecAtAngle(p.bassBar!.angle * TURN.degree), z: 0 };
    // the web's upper half-plate of wood is the plate's already, so the bar's weight is spread over the web
    let share = s.barVolume / s.webVolume;
    heading.push(`** bass bar: density scaled by ${share.toFixed(3)}, the web hanging from the plate's mid-surface`);
    materials.push(calcWoodMaterial('BAR_WOOD', wood.bassBar, 'T', share));
    orientations.push({ name: 'BAR_GRAIN', x: along, xy: { x: 0, y: 0, z: 1 } });
    sets.push({ name: 'BASS_BAR', type: 'S8R', elements: s.web, material: 'BAR_WOOD', orientation: 'BAR_GRAIN', thickness: p.bassBar!.width, normals: null });
  }
  return buildCalculixDeck({ heading, nodes: s.nodes, thickness: s.thickness, sets, solids: [], ties: [], materials, orientations, modes: modes + RIGID_MODES });
}

export function isFemGarlandBuilt(p: ViolinFamilyParams, step: number): boolean {
  updateSolved(p);
  return p.solved!.femGarland.solve?.step === step;
}

// the garland as held on the params, with the wood checked against it; built first, as the
// plate's mesh is, if an edit has cleared it or it was built at another element size
export function solvedFemGarland(p: ViolinFamilyParams, step: number): GarlandFemSolve | null {
  if (!p.graduation) return null;
  updateSolved(p);
  let held = p.solved!.femGarland;
  if (held.solve?.step !== step) held.solve = { step, mesh: solveFemGarland(p, step) };
  let s: GarlandFemSolve = { ...held.solve.mesh, failures: [...held.solve.mesh.failures] };
  if (p.wood) pushWoodFailure(s.failures, [p.wood.ribs, p.wood.linings, p.wood.blocks]);
  return s;
}

// the blocks are meshed first, each in plan, and the rib line stepped off between them, so a rib
// glued over a block stands on the block's own nodes. Every plan node is then a column, the rows
// the same height all round: the lower linings, the open rib, the upper linings. A lining is a
// row of bricks behind the rib, sharing the rib's nodes on its glued face and a block's where it
// butts against one. A rib stands square to
// the back, and the taper only shortens it toward the neck
function solveFemGarland(p: ViolinFamilyParams, step: number): GarlandFemSolve {
  let s: GarlandFemSolve = { plan: [], triangles: [], ribLine: [], lined: [], edges: [], linings: [], tops: [], feet: [], nodes: [], normals: [], runs: [], wedges: [], ribVolume: 0, liningVolume: 0, blockVolume: 0, failures: [] };

  solveSection(s.failures, 'Mesh', ['mesh'], () => {
    let gr = p.graduation!;
    let blank = buildBlankMiss('Mesh', ['mesh'], [step]);
    if (blank) return blank;
    let finest = Math.round(10 * p.body.height * MIN_STEP_SHARE) / 10;
    if (step < finest) return buildMiss(`Mesh: an element size under ${finest} mm is finer than a garland's modes need.`, ['mesh']);
    let rib = solvedRibArcs(p), g = solvedGraduation(p);
    let ribPath = rib ? definePurflingPath(p, rib, 0) : null;
    if (!ribPath || !g?.blocks || !g.lining) return buildMiss('Mesh: the blocks and linings have to solve on the graduation panel before the garland is meshed.', ['mesh']);
    let taper = p.arching ? solveRibTaper(p) : null;
    if (!taper) return buildMiss('Mesh: the rib heights have to solve on the long arching panel before the garland is meshed.', ['mesh']);
    let liningHeight = gr.liningHeight;
    let ribHeight = Math.min(taper.zLower, taper.zUpper);
    if (!(liningHeight > 0 && 2 * liningHeight < ribHeight)) return buildMiss('Mesh: the linings need a height above 0 and under half the ribs\', on the graduation panel.', ['mesh']);

    // the rib line counterclockwise from its widest point on the right, which no block reaches
    let read = flattenPath(ribPath, RIB_READ)[0];
    if (signedPolygonArea(read) < 0) read.reverse();
    let widest = read.reduce((best, q, i) => q.x > read[best].x ? i : best, 0);
    let once = [...read.slice(widest), ...read.slice(0, widest), read[widest]];
    let onceCum = polylineCumulativeLengths(once);
    let around = onceCum[onceCum.length - 1];
    // twice round, so the last stretch can run on past where the loop was opened
    let twice = [...once, ...once.slice(1)];
    let twiceCum = polylineCumulativeLengths(twice);

    let faces: { nodes: number[]; from: number; to: number }[] = [];
    // where a lining butts against a block: the rib node at the block's edge, and the block's own
    // nodes halfway through the lining and on its inner edge
    let butts: { rib: number; halfway: number; inner: number }[] = [];
    let wedgePlans: number[][] = [];
    for (let block of [g.blocks.neck, g.blocks.end, ...g.blocks.corners]) {
      // the block's edge gets a node where it leaves the ribs and another a lining's thickness in,
      // so the stretch between is one element's edge: the face the lining's end is glued to
      let edge = flattenPath(block, 0.5)[0];
      let off = edge.map(q => projectOntoPolyline(q, once, onceCum).dist);
      let keep: Pt[] = [];
      let added: { after: number; at: Pt }[] = [];
      for (let way of [1, -1]) {
        let leaves = edge.findIndex((_, i) => off[i] < ON_RIB && off[(i + way + edge.length) % edge.length] >= ON_RIB);
        for (let i = leaves, walked = 0; leaves >= 0 && walked < edge.length; walked++) {
          let next = (i + way + edge.length) % edge.length;
          if (off[next] < ON_RIB) break;
          if (off[next] >= gr.lining) {
            let t = (gr.lining - off[i]) / (off[next] - off[i]);
            let meet = new Pt(edge[i].x + (edge[next].x - edge[i].x) * t, edge[i].y + (edge[next].y - edge[i].y) * t);
            // a corner block is trimmed from this very point, so its edge may hold it already
            let held = [edge[i], edge[next]].find(q => dist(q, meet) < ON_RIB);
            keep.push(edge[leaves], held ?? meet);
            if (!held) added.push({ after: way > 0 ? i : next, at: meet });
            break;
          }
          i = next;
        }
      }
      let mesh = buildTriangleMesh(edge.flatMap((q, i) => [q, ...added.filter(a => a.after === i).map(a => a.at)]), [], [], step, step, keep);
      let ring = mesh.loopNodes[0];
      if (mesh.lost.length || !ring.length) {
        let miss = buildMiss('Mesh: a block\'s elements don\'t follow its edge at the marks; try a smaller element size.', ['mesh']);
        miss.segments = mesh.lost;
        return miss;
      }
      let base = s.plan.length;
      s.plan.push(...mesh.nodes);
      for (let tri of mesh.triangles) wedgePlans.push(tri.map(n => n + base));

      // the block's outer face: the one stretch of its edge that runs along the rib line
      let on = ring.map(n => projectOntoPolyline(mesh.nodes[n], once, onceCum));
      let count = ring.length / 2;
      let glued = Array.from({ length: count }, (_, k) => on[2 * k].dist < ON_RIB && on[2 * k + 1].dist < MIDSIDE_ON_RIB * step && on[(2 * k + 2) % ring.length].dist < ON_RIB);
      let first = glued.findIndex((is, k) => is && !glued[(k + count - 1) % count]);
      let face = first < 0 ? [] : [ring[2 * first]];
      let last = first;
      for (; first >= 0 && glued[last % count]; last++) face.push(ring[(2 * last + 1) % ring.length], ring[(2 * last + 2) % ring.length]);
      if (first < 0 || last - first !== glued.filter(is => is).length) {
        return buildMiss('Mesh: a block doesn\'t stand against the ribs along one face; resize it on the mould.', ['mesh'], mesh.nodes.slice(0, 1));
      }
      for (let [end, way] of [[2 * first, -1], [2 * last, 1]]) {
        let [rib, halfway, inner] = [0, way, 2 * way].map(k => ring[(end + k + ring.length) % ring.length]);
        if (keep.some(q => dist(q, mesh.nodes[inner]) < 1e-6)) butts.push({ rib: rib + base, halfway: halfway + base, inner: inner + base });
      }
      let from = on[2 * first].s, to = on[(2 * last) % ring.length].s;
      if (from > to) { face.reverse(); [from, to] = [to, from]; }
      faces.push({ nodes: face.map(n => n + base), from, to });
    }

    faces.sort((u, v) => u.from - v.from);
    faces.forEach((face, i) => {
      s.ribLine.push(...face.nodes);
      for (let k = 0; k + 2 < face.nodes.length; k += 2) s.lined.push(false);
      let next = faces[(i + 1) % faces.length];
      let free = polylineSlice(twice, twiceCum, face.to, i + 1 < faces.length ? next.from : next.from + around);
      let freeCum = polylineCumulativeLengths(free);
      let length = freeCum[freeCum.length - 1];
      let count = Math.max(1, Math.round(length / step));
      for (let k = 1; k < 2 * count; k++) {
        s.ribLine.push(s.plan.length);
        s.plan.push(pointAtPolylineLength(free, freeCum, k * length / (2 * count)));
      }
      for (let k = 0; k < count; k++) s.lined.push(true);
    });

    // square to the rib line through a node's two neighbours on it, so the ribs turn smoothly. A
    // corner's tip gets none: its two ribs keep their own and meet there as a joint
    let outward = new Map<number, Vec3>();
    s.ribLine.forEach((n, k) => {
      let before = s.plan[s.ribLine[(k + s.ribLine.length - 1) % s.ribLine.length]], at = s.plan[n], after = s.plan[s.ribLine[(k + 1) % s.ribLine.length]];
      let turn = Math.abs(Math.atan2(
        (at.x - before.x) * (after.y - at.y) - (at.y - before.y) * (after.x - at.x),
        (at.x - before.x) * (after.x - at.x) + (at.y - before.y) * (after.y - at.y),
      ));
      let run = dist(before, after);
      if (turn < RIB_JOINT_TURN) outward.set(n, { x: (after.y - before.y) / run, y: (before.x - after.x) / run, z: 0 });
    });

    // behind every node of a lined stretch, a node on the lining's inner edge, and behind a corner
    // one halfway through the lining as well. They stand only as high as the linings do. A lining's
    // end takes the block's nodes instead, so its end face is the block's side
    let corner = new Set([...wedgePlans.flatMap(tri => tri.slice(0, 3)), ...s.ribLine.filter((_, k) => k % 2 === 0)]);
    let ribPlan = s.plan.length;
    let inner = new Map<number, number>();
    let halfway = new Map<number, number>();
    // the rib node each of them stands behind, whose height it takes
    let ribOf = new Map<number, number>();
    for (let butt of butts) {
      inner.set(butt.rib, butt.inner);
      halfway.set(butt.rib, butt.halfway);
    }
    s.lined.forEach((lined, e) => {
      if (!lined) return;
      let a = s.ribLine[2 * e], b = s.ribLine[(2 * e + 2) % s.ribLine.length];
      let chord = dist(s.plan[a], s.plan[b]);
      let square = { x: (s.plan[b].y - s.plan[a].y) / chord, y: (s.plan[a].x - s.plan[b].x) / chord };
      for (let n of [a, s.ribLine[2 * e + 1], b]) {
        if (inner.has(n)) continue;
        let out = outward.get(n) ?? square;
        inner.set(n, s.plan.length);
        ribOf.set(s.plan.length, n);
        s.plan.push(new Pt(s.plan[n].x - out.x * gr.lining, s.plan[n].y - out.y * gr.lining));
        if (!corner.has(n)) continue;
        corner.add(inner.get(n)!);
        halfway.set(n, s.plan.length);
        ribOf.set(s.plan.length, n);
        s.plan.push(new Pt(s.plan[n].x - out.x * gr.lining / 2, s.plan[n].y - out.y * gr.lining / 2));
      }
    });

    let liningRows = Math.max(1, Math.round(liningHeight / step));
    let openRows = Math.max(1, Math.round((ribHeight - 2 * liningHeight) / step));
    let rows = 2 * liningRows + openRows;
    // a corner of an element stands at every half row, a midside node at the whole rows alone
    let columns = s.plan.map((q, n) => {
      let height = ribHeightAt(p, s.plan[ribOf.get(n) ?? n].y, taper);
      let column: number[] = [];
      for (let half = 0; half <= 2 * rows; half += corner.has(n) ? 1 : 2) {
        let row = half / 2;
        if (n >= ribPlan && row > liningRows && row < rows - liningRows) continue;
        let z = row <= liningRows ? liningHeight * row / liningRows
          : row <= liningRows + openRows ? liningHeight + (height - 2 * liningHeight) * (row - liningRows) / openRows
          : height - liningHeight * (rows - row) / liningRows;
        column[half] = s.nodes.length;
        s.nodes.push(new Pt3D(q.x, q.y, z));
        s.normals.push(outward.get(n) ?? { x: 0, y: 0, z: 0 });
      }
      return column;
    });

    s.tops = columns.map(column => column[2 * rows]);
    s.feet = columns.map(column => column[0]);

    let runs = new Map<number, GarlandRun>();
    for (let e = 0; 2 * e < s.ribLine.length; e++) {
      let a = s.ribLine[2 * e], mid = s.ribLine[2 * e + 1], b = s.ribLine[(2 * e + 2) % s.ribLine.length];
      s.edges.push([a, mid, b]);
      if (s.lined[e]) {
        s.linings.push([a, b, inner.get(b)!, inner.get(a)!]);
        s.edges.push([inner.get(a)!, inner.get(mid)!, inner.get(b)!], [a, halfway.get(a)!, inner.get(a)!], [b, halfway.get(b)!, inner.get(b)!]);
      }
      let length = dist(s.plan[a], s.plan[b]);
      let turn = Math.atan2(s.plan[b].y - s.plan[a].y, s.plan[b].x - s.plan[a].x) / TURN.degree;
      // grain has no sense, so a rib and its mirror across the body may share a run
      let angle = ((Math.round(turn / GRAIN_STEP) * GRAIN_STEP) % 180 + 180) % 180;
      let run = runs.get(angle) ?? runs.set(angle, { angle, ribs: [], linings: [] }).get(angle)!;
      for (let row = 0; row < rows; row++) {
        let low = 2 * row, half = low + 1, high = low + 2;
        let quad = [columns[a][low], columns[b][low], columns[b][high], columns[a][high], columns[mid][low], columns[b][half], columns[mid][high], columns[a][half]];
        let rise = (s.nodes[quad[3]].z - s.nodes[quad[0]].z + s.nodes[quad[2]].z - s.nodes[quad[1]].z) / 2;
        run.ribs.push(quad);
        s.ribVolume += length * rise * p.body.rib;
        if (!s.lined[e] || (row >= liningRows && row < rows - liningRows)) continue;
        let [ia, im, ib] = [a, mid, b].map(n => columns[inner.get(n)!]);
        let [ha, hb] = [a, b].map(n => columns[halfway.get(n)!]);
        run.linings.push([
          ia[low], ib[low], ib[high], ia[high], ...quad.slice(0, 4),
          im[low], ib[half], im[high], ia[half], ...quad.slice(4),
          ha[low], hb[low], hb[high], ha[high],
        ]);
        s.liningVolume += length * rise * gr.lining;
      }
    }
    s.runs = [...runs.values()].sort((u, v) => u.angle - v.angle);

    for (let tri of wedgePlans) {
      let corners = tri.slice(0, 3), mids = tri.slice(3);
      let [a, b, c] = corners.map(n => s.plan[n]);
      let area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      s.triangles.push(corners);
      s.edges.push([tri[0], tri[3], tri[1]], [tri[1], tri[4], tri[2]], [tri[2], tri[5], tri[0]]);
      s.blockVolume += area * corners.reduce((sum, n) => sum + s.nodes[columns[n][2 * rows]].z, 0) / 3;
      for (let row = 0; row < rows; row++) {
        let low = 2 * row, half = low + 1, high = low + 2;
        s.wedges.push([
          ...corners.map(n => columns[n][low]), ...corners.map(n => columns[n][high]),
          ...mids.map(n => columns[n][low]), ...mids.map(n => columns[n][high]),
          ...corners.map(n => columns[n][half]),
        ]);
      }
    }
    return null;
  });
  return s;
}

// the deck for the garland alone, free as a plate's is. The ribs' nodes stand on their inner face,
// so a rib is drawn half its own thickness inside where it is. Rib and lining are on the quarter,
// the grain along the rib and the rings across its height; a block's grain stands upright, its
// rings taken to run across the body, which only the corner blocks would notice
export function buildGarlandDeck(p: ViolinFamilyParams, s: GarlandFemSolve, modes: number, name: string): string {
  let wood = p.wood!;
  let materials = [calcWoodMaterial('RIB_WOOD', wood.ribs, 'R'), calcWoodMaterial('LINING_WOOD', wood.linings, 'R'), calcWoodMaterial('BLOCK_WOOD', wood.blocks, 'R')];
  let orientations: FemOrientation[] = [{ name: 'BLOCK_GRAIN', x: { x: 0, y: 0, z: 1 }, xy: { x: 0, y: 1, z: 0 } }];
  let sets: FemShellSet[] = [];
  let solids: FemSolidSet[] = [{ name: 'BLOCKS', type: 'C3D15', elements: s.wedges, material: 'BLOCK_WOOD', orientation: 'BLOCK_GRAIN' }];
  for (let run of s.runs) {
    let grain = `GRAIN_${run.angle}`;
    orientations.push({ name: grain, x: { ...vecAtAngle(run.angle * TURN.degree), z: 0 }, xy: { x: 0, y: 0, z: 1 } });
    sets.push({ name: `RIBS_${run.angle}`, type: 'S8R', elements: run.ribs, material: 'RIB_WOOD', orientation: grain, thickness: p.body.rib, normals: s.normals });
    if (run.linings.length) solids.push({ name: `LININGS_${run.angle}`, type: 'C3D20', elements: run.linings, material: 'LINING_WOOD', orientation: grain });
  }
  return buildCalculixDeck({ heading: [`${name}, rib garland, free`], nodes: s.nodes, thickness: [], sets, solids, ties: [], materials, orientations, modes: modes + RIGID_MODES });
}

export function isFemNeckBuilt(p: ViolinFamilyParams, step: number): boolean {
  updateSolved(p);
  return p.solved!.femNeck.solve?.step === step;
}

// the neck as held on the params, with the wood checked against it; built first, as the plate's
// mesh is, if an edit has cleared it or it was built at another element size
export function solvedFemNeck(p: ViolinFamilyParams, step: number): NeckFemSolve | null {
  if (!p.graduation) return null;
  updateSolved(p);
  let held = p.solved!.femNeck;
  if (held.solve?.step !== step) held.solve = { step, mesh: solveFemNeck(p, step) };
  let s: NeckFemSolve = { ...held.solve.mesh, failures: [...held.solve.mesh.failures] };
  if (p.wood) pushWoodFailure(s.failures, [p.wood.neck, p.wood.fingerboard]);
  return s;
}

// half the wood's width at a point of the neck's side view. Below the nut it is the neck's own
// half width, rounded away with depth below the fingerboard; above it the pegbox's, read by
// height off its front and never under its throat's; and within the volute's reach of the eye the
// width at the first turn's bottom throughout, the eyes that stand out past it left off for the
// little they weigh. The back's own widths are not followed
export function femNeckHalfWidthAt(p: ViolinFamilyParams, n: NeckSolve, scroll: ScrollSolve, at: Pt): number {
  let nk = p.neck!, widths = p.scroll!.widths;
  let angle = nk.angle * TURN.degree;
  let off = subVec(at, n.neckTop!);
  let x = dot(off, vecAtAngle(angle)), y = dot(off, vecAtAngle(angle + TURN.quarter));
  if (y <= 0) {
    let thickness = Math.min(nk.upperThickness - calcNeckTaper(p, n) * y, nk.lowerThickness);
    let depth = clamp(-x / thickness, 0, 1);
    return neckHalfWidthAt(p, n, at.y) * Math.sqrt(1 - NECK_ROUND * depth * depth);
  }
  let eye = scroll.eye!;
  let reach = dist(pointOnCircle(scroll.S0!, scroll.S0!.start), eye);
  if (Math.hypot(x - eye.x, y - eye.y) < reach) return widths.turn1Bottom / 2;
  return Math.max(pegboxWidthAt(p, scroll, y), widths.throat) / 2;
}

// where the wood stands across the neck at a half width: its two faces, the two faces of the
// middle layer, a pegbox wall in from them, and the points halfway
function calcNeckRow(half: number, wall: number): number[] {
  let inner = Math.max(half - wall, half / 3);
  return [-half, -(half + inner) / 2, -inner, 0, inner, (half + inner) / 2, half];
}

// the side view is one outline: up the neck's front from its root, round the head, down the back
// and the heel's cove to the button and along the heel's foot. The root is the face the ribs were
// glued over, the neck block's outer face: the tenon let in past it is left to the block, which
// is meshed whole. It is meshed in triangles
// and each stood across the neck as three wedges. The fingerboard is a run of bricks on the neck's
// front edge, crowned across, and on past the root over the body
function solveFemNeck(p: ViolinFamilyParams, step: number): NeckFemSolve {
  let s: NeckFemSolve = { side: [], triangles: [], board: [], seat: [], nodes: [], wedges: [], bricks: [], neckVolume: 0, boardVolume: 0, failures: [] };

  solveSection(s.failures, 'Mesh', ['mesh'], () => {
    let blank = buildBlankMiss('Mesh', ['mesh'], [step]);
    if (blank) return blank;
    let finest = Math.round(10 * p.body.height * MIN_STEP_SHARE) / 10;
    if (step < finest) return buildMiss(`Mesh: an element size under ${finest} mm is finer than a neck's modes need.`, ['mesh']);
    if (!p.neck || !p.scroll || !p.stringSetup) return buildMiss('Mesh: the neck, the scroll and the string setup have to be drafted before the neck is meshed.', ['mesh']);
    let setup = solveStringSetup(p)!;
    let n = setup.neck;
    let scroll = solveScroll(p);
    let boardEnd = setup.fingerboardEnd;
    if (!n.neckTop || !n.bottomFront || !n.heel || !n.tip || !scroll?.spiral || !scroll.S0 || !scroll.nape || !scroll.F1 || !boardEnd || setup.failures.some(f => f.unsolved.includes('fingerboard'))) {
      return buildMiss('Mesh: the neck with its heel, the scroll and the fingerboard have to solve before the neck is meshed.', ['mesh']);
    }
    let ss = p.stringSetup;
    let angle = p.neck.angle * TURN.degree;
    let normal = vecAtAngle(angle);

    // the scroll's side path is its back, eye outward to the nape, then the four pieces of its
    // front. Of the back only what lies outside the front's end is the head's edge
    let pieces = flattenPath(defineSideScrollPath(p, scroll), SIDE_READ, true);
    let front = pieces.slice(-4).flat(), back = pieces.slice(0, -4).flat();
    let backCum = polylineCumulativeLengths(back);
    let meets = projectOntoPolyline(front[front.length - 1], back, backCum).s;
    let onNeck = calcScrollOnNeck(p, n);
    let head = [...front, ...polylineSlice(back, backCum, meets, backCum[backCum.length - 1]).slice(1)].map(q => applyMatrix(onNeck, q));
    let sweep = signedArcSweep(n.heel);
    let heel = Array.from({ length: HEEL_CHORDS + 1 }, (_, k) => pointOnCircle(n.heel!, n.heel!.start + sweep * k / HEEL_CHORDS));
    let rootY = p.body.height - p.body.overhang - p.body.rib;
    let rootShare = (rootY - n.bottomFront.y) / (n.neckTop.y - n.bottomFront.y);
    let root = new Pt(n.bottomFront.x + (n.neckTop.x - n.bottomFront.x) * rootShare, rootY);
    // a board that stops short of the root still gets a node to end on
    let boardFoot = boardEnd.y > root.y ? boardEnd : root;
    let outline = [n.neckTop, ...head, ...heel, n.tip, new Pt(0, rootY), root, boardFoot]
      .filter((q, k, all) => dist(q, all[(k + all.length - 1) % all.length]) > 1e-6);
    let mesh = buildTriangleMesh(outline, [], [], step, step, [n.neckTop, root, boardFoot]);
    let ring = mesh.loopNodes[0];
    if (mesh.lost.length || !ring.length) {
      let miss = buildMiss('Mesh: the neck\'s elements don\'t follow its edge at the marks; try a smaller element size.', ['mesh']);
      miss.segments = mesh.lost;
      return miss;
    }
    s.side = mesh.nodes;

    // every side node as a row across the neck: a corner at each half layer, a midside node at the
    // layers' faces alone
    let wall = p.scroll.wall;
    let rows = mesh.nodes.map((q, i) => {
      let across = calcNeckRow(femNeckHalfWidthAt(p, n, scroll, q), wall);
      let row: number[] = [];
      for (let k = 0; k < across.length; k += i < mesh.corners ? 1 : 2) {
        row[k] = s.nodes.length;
        s.nodes.push(new Pt3D(across[k], q.y, q.x));
      }
      return row;
    });

    // the hollow is read in the scroll's own frame
    let cavity = calcPegboxCavity(p, scroll);
    let up = vecAtAngle(angle + TURN.quarter);
    for (let tri of mesh.triangles) {
      let corners = tri.slice(0, 3), mids = tri.slice(3);
      let [a, b, c] = corners.map(i => mesh.nodes[i]);
      let area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      let centre = subVec(new Pt((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3), n.neckTop);
      let hollow = !!cavity && pointInPolygon(new Pt(dot(centre, normal), dot(centre, up)), cavity);
      s.triangles.push(corners);
      for (let layer = 0; layer < 3; layer++) {
        if (hollow && layer === 1) continue;
        let near = 2 * layer + 2, half = near - 1, far = near - 2;
        // seen from +x a side triangle runs clockwise, so a wedge stands from its +x face to its -x
        s.wedges.push([
          ...corners.map(i => rows[i][near]), ...corners.map(i => rows[i][far]),
          ...mids.map(i => rows[i][near]), ...mids.map(i => rows[i][far]),
          ...corners.map(i => rows[i][half]),
        ]);
        s.neckVolume += area * corners.reduce((sum, i) => sum + s.nodes[rows[i][near]].x - s.nodes[rows[i][far]].x, 0) / 3;
      }
    }

    // the board's stations up the fingerboard plane, corner and midside alternating: its own over
    // the body, then the neck's front edge from the root to the nut
    let stations: { at: Pt; row: number[] | null }[] = [];
    if (boardEnd.y < root.y) {
      let count = Math.max(1, Math.round(dist(boardEnd, root) / step));
      for (let k = 0; k < 2 * count; k++) {
        let t = k / (2 * count);
        stations.push({ at: new Pt(boardEnd.x + (root.x - boardEnd.x) * t, boardEnd.y + (root.y - boardEnd.y) * t), row: null });
      }
    }
    let foot = ring.findIndex(i => dist(mesh.nodes[i], boardFoot) < 1e-6), nut = ring.findIndex(i => dist(mesh.nodes[i], n.neckTop!) < 1e-6);
    for (let k = foot; ; k = (k + 1) % ring.length) {
      stations.push({ at: mesh.nodes[ring[k]], row: rows[ring[k]] });
      if (k === nut) break;
    }
    let under: number[][] = [], over: number[][] = [], between: number[][] = [], tops: number[][] = [];
    stations.forEach((station, k) => {
      let half = neckHalfWidthAt(p, n, station.at.y);
      let across = calcNeckRow(half, wall);
      let r = fingerboardRadiusAt(p, setup, station.at.y);
      under.push([]); over.push([]); between.push([]); tops.push([]);
      for (let level = 0; level < across.length; level += k % 2 ? 2 : 1) {
        let top = ss.fingerboardThickness + Math.sqrt(r * r - across[level] ** 2) - Math.sqrt(r * r - half * half);
        tops[k][level] = top;
        if (station.row) under[k][level] = station.row[level];
        else { under[k][level] = s.nodes.length; s.nodes.push(new Pt3D(across[level], station.at.y, station.at.x)); }
        over[k][level] = s.nodes.length;
        s.nodes.push(new Pt3D(across[level], station.at.y + normal.y * top, station.at.x + normal.x * top));
        if (k % 2 || level % 2) continue;
        between[k][level] = s.nodes.length;
        s.nodes.push(new Pt3D(across[level], station.at.y + normal.y * top / 2, station.at.x + normal.x * top / 2));
      }
    });
    for (let k = 0; k + 2 < stations.length; k += 2) {
      let mid = k + 1, next = k + 2;
      for (let layer = 0; layer < 3; layer++) {
        let far = 2 * layer, half = far + 1, near = far + 2;
        s.bricks.push([
          under[k][far], under[k][near], under[next][near], under[next][far],
          over[k][far], over[k][near], over[next][near], over[next][far],
          under[k][half], under[mid][near], under[next][half], under[mid][far],
          over[k][half], over[mid][near], over[next][half], over[mid][far],
          between[k][far], between[k][near], between[next][near], between[next][far],
        ]);
        let width = (s.nodes[under[k][near]].x - s.nodes[under[k][far]].x + s.nodes[under[next][near]].x - s.nodes[under[next][far]].x) / 2;
        let thickness = (tops[k][far] + tops[k][near] + tops[next][near] + tops[next][far]) / 4;
        s.boardVolume += dist(stations[k].at, stations[next].at) * width * thickness;
      }
    }
    let crown = stations.filter((_, k) => k % 2 === 0).map((station, k) => new Pt(station.at.x + normal.x * tops[2 * k][3], station.at.y + normal.y * tops[2 * k][3]));
    s.board = [...stations.map(station => station.at), ...crown.reverse()];

    // a side node over the hollow has no wood at its middle: the nodes on no element are dropped
    let used = new Map<number, number>();
    let kept: Pt3D[] = [];
    for (let element of [...s.wedges, ...s.bricks]) {
      for (let i of element) {
        if (!used.has(i)) { used.set(i, kept.length); kept.push(s.nodes[i]); }
      }
    }
    s.nodes = kept;
    s.wedges = s.wedges.map(element => element.map(i => used.get(i)!));
    s.bricks = s.bricks.map(element => element.map(i => used.get(i)!));
    s.seat = [...new Set(s.wedges.flat())].filter(i => Math.abs(s.nodes[i].y - rootY) < 1e-9);
    return null;
  });
  return s;
}

// the deck for the neck alone, free. Neck and board are on the quarter, the grain up the neck
// along the fingerboard and the rings across it
export function buildNeckDeck(p: ViolinFamilyParams, s: NeckFemSolve, modes: number, name: string): string {
  let wood = p.wood!;
  let angle = p.neck!.angle * TURN.degree;
  let materials = [calcWoodMaterial('NECK_WOOD', wood.neck, 'R'), calcWoodMaterial('BOARD_WOOD', wood.fingerboard, 'R')];
  let orientations: FemOrientation[] = [{ name: 'NECK_GRAIN', x: { x: 0, y: Math.cos(angle), z: -Math.sin(angle) }, xy: { x: 1, y: 0, z: 0 } }];
  let solids: FemSolidSet[] = [
    { name: 'NECK', type: 'C3D15', elements: s.wedges, material: 'NECK_WOOD', orientation: 'NECK_GRAIN' },
    { name: 'FINGERBOARD', type: 'C3D20', elements: s.bricks, material: 'BOARD_WOOD', orientation: 'NECK_GRAIN' },
  ];
  return buildCalculixDeck({ heading: [`${name}, neck and fingerboard, free`], nodes: s.nodes, thickness: [], sets: [], solids, ties: [], materials, orientations, modes: modes + RIGID_MODES });
}

export function isFemViolinBuilt(p: ViolinFamilyParams, step: number, bar: boolean, post: boolean): boolean {
  updateSolved(p);
  return p.solved!.femViolin.solve?.options === JSON.stringify([step, bar, post]);
}

// the violin as held on the params, every part's wood checked against it; built first if an edit
// has cleared it or it was built with other options, which takes longer than any part alone
export function solvedFemViolin(p: ViolinFamilyParams, step: number, bar: boolean, post: boolean): ViolinFemSolve | null {
  if (!p.graduation) return null;
  updateSolved(p);
  let held = p.solved!.femViolin;
  let built = JSON.stringify([step, bar, post]);
  if (held.solve?.options !== built) held.solve = { options: built, mesh: solveFemViolin(p, step, bar, post) };
  let s: ViolinFemSolve = { ...held.solve.mesh, failures: [...held.solve.mesh.failures] };
  let wood = p.wood;
  if (wood) pushWoodFailure(s.failures, [wood.top, wood.back, wood.bassBar, wood.ribs, wood.linings, wood.blocks, wood.neck, wood.fingerboard, wood.soundPost]);
  return s;
}

// the garland and the neck are meshed as they are alone, and each plate over again to stand on
// the garland. The garland's nodes are numbered first and keep their numbers; a plate's node that
// has a seat takes the garland's node at that column's end and moves it to where the plate has it,
// so the column runs on half an edge thickness into the plate. The neck's nodes come after, and
// last the sound post's between the two plates' seats for it
function solveFemViolin(p: ViolinFamilyParams, step: number, bar: boolean, post: boolean): ViolinFemSolve {
  let s: ViolinFemSolve = {
    nodes: [], thickness: [], plateNormals: [], ribNormals: [], top: [], back: [], web: [], runs: [], blocks: [], neck: [], board: [], post: [], heel: [], mortise: [],
    shares: { ribs: 1, linings: 1, blocks: 1, bassBar: 1, soundPost: 1 },
    volumes: { top: 0, back: 0, bassBar: 0, ribs: 0, linings: 0, blocks: 0, neck: 0, fingerboard: 0, soundPost: 0 },
    failures: [],
  };
  let stands = post && p.neck && p.stringSetup ? solveStringSetup(p)?.soundPost ?? null : null;
  solveSection(s.failures, 'Sound post', ['post'], () => {
    return post && !stands ? buildMiss('Sound post: the post has to solve on the string setup before it can be meshed; the violin is built without it.', ['post']) : null;
  });
  let garland = solvedFemGarland(p, step)!;
  let neck = solvedFemNeck(p, step)!;
  // a part that can't be meshed is said so before the slow ones are tried
  let meshed = ![garland, neck].some(part => part.failures.some(f => f.unsolved.includes('mesh')));
  let back = meshed ? solveFemMesh(p, { plate: 'back', step, bar }, garland, stands) : null;
  let top = back && !back.failures.length ? solveFemMesh(p, { plate: 'top', step, bar }, garland, stands) : null;
  s.failures.push(...[garland, neck, top, back].flatMap(part => part?.failures ?? []).filter(f => !f.unsolved.includes('wood')));
  let taper = p.arching ? solveRibTaper(p) : null;
  if (!top || !back || !taper || s.failures.some(f => f.unsolved.includes('mesh'))) return s;

  let topEdge = p.arching!.top.thickness, backEdge = p.arching!.back.thickness;
  let placement = calcTopPlatePlacement(p, taper);
  let tilt = placement.angleDeg * TURN.degree;
  let none: Vec3 = { x: 0, y: 0, z: 0 };
  s.nodes = [...garland.nodes];
  s.ribNormals = [...garland.normals];

  // the top is carved against its own gluing plane and set on the taper by the side view's rotation
  let topNodes = top.nodes.map((q, n) => {
    let side = placeOnTopPlate(placement, new Pt(taper.zLower + q.z + topEdge, q.y));
    let seat = top.seat[n] ?? -1;
    let node = seat < 0 ? s.nodes.length : garland.tops[seat];
    let normal = top.normals[n];
    s.nodes[node] = new Pt3D(q.x, side.y, side.x);
    s.thickness[node] = top.thickness[n];
    s.plateNormals[node] = { x: normal.x, y: normal.z * Math.sin(tilt) + normal.y * Math.cos(tilt), z: normal.z * Math.cos(tilt) - normal.y * Math.sin(tilt) };
    return node;
  });
  // the back is turned over about the body's long axis, its gluing plane the garland's foot
  let backNodes = back.nodes.map((q, n) => {
    let seat = back.seat[n] ?? -1;
    let node = seat < 0 ? s.nodes.length : garland.feet[seat];
    let normal = back.normals[n];
    s.nodes[node] = new Pt3D(-q.x, q.y, -(q.z + backEdge));
    s.thickness[node] = back.thickness[n];
    s.plateNormals[node] = { x: -normal.x, y: normal.y, z: -normal.z };
    return node;
  });
  let neckFrom = s.nodes.length;
  s.nodes.push(...neck.nodes);

  // the post: a column from each of the back's nodes under it to the top's over it, a corner's
  // with a node at every half layer and a midside node's at the layers' faces alone
  if (stands && top.post.length && back.post.length) {
    let high = top.post.map(n => topNodes[n]), low = back.post.map(n => backNodes[n]);
    let from = s.nodes[low[0]], to = s.nodes[high[0]];
    let length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    let layers = Math.max(2, Math.round(length / step));
    let columns = high.map((end, j) => {
      let foot = s.nodes[low[j]], head = s.nodes[end];
      let column = [low[j]];
      for (let half = j < 7 ? 1 : 2; half < 2 * layers; half += j < 7 ? 1 : 2) {
        let t = half / (2 * layers);
        column[half] = s.nodes.length;
        s.nodes.push(new Pt3D(foot.x + (head.x - foot.x) * t, foot.y + (head.y - foot.y) * t, foot.z + (head.z - foot.z) * t));
      }
      column[2 * layers] = end;
      return column;
    });
    for (let layer = 0; layer < layers; layer++) {
      let under = 2 * layer, half = under + 1, over = under + 2;
      for (let k = 0; k < 6; k++) {
        // the centre's column, two of the six round it, then the spoke, the edge round and the next spoke
        let corners = [columns[0], columns[1 + k], columns[1 + (k + 1) % 6]];
        let mids = [columns[7 + k], columns[13 + k], columns[7 + (k + 1) % 6]];
        s.post.push([...corners.map(c => c[under]), ...corners.map(c => c[over]), ...mids.map(c => c[under]), ...mids.map(c => c[over]), ...corners.map(c => c[half])]);
      }
    }
    let fitted = length - (s.thickness[low[0]] + s.thickness[high[0]]) / 2;
    s.shares.soundPost = fitted / length;
    s.volumes.soundPost = Math.PI * stands.r ** 2 * fitted;
  }
  for (let n = 0; n < s.nodes.length; n++) {
    s.thickness[n] ??= 0;
    s.plateNormals[n] ??= none;
    s.ribNormals[n] ??= none;
  }

  s.top = top.triangles.map(tri => tri.map(n => topNodes[n]));
  s.web = top.web.map(quad => quad.map(n => topNodes[n]));
  s.back = back.triangles.map(tri => tri.map(n => backNodes[n]));
  s.runs = garland.runs;
  s.blocks = garland.wedges;
  s.neck = neck.wedges.map(wedge => wedge.map(n => n + neckFrom));
  s.board = neck.bricks.map(brick => brick.map(n => n + neckFrom));
  s.heel = neck.seat.map(n => n + neckFrom);

  // the neck block's outer face: the wedges of the block at the neck end that a rib stands on
  let count = garland.plan.length;
  let ribbed = new Set<number>();
  for (let k = 0; k < garland.ribLine.length; k += 2) {
    let a = garland.ribLine[k], b = garland.ribLine[(k + 2) % garland.ribLine.length];
    ribbed.add(Math.min(a, b) * count + Math.max(a, b));
  }
  let rows = garland.wedges.length / garland.triangles.length;
  garland.triangles.forEach((tri, t) => {
    if ((garland.plan[tri[0]].y + garland.plan[tri[1]].y + garland.plan[tri[2]].y) / 3 < 0.9 * p.body.height) return;
    for (let k = 0; k < 3; k++) {
      let a = tri[k], b = tri[(k + 1) % 3];
      if (!ribbed.has(Math.min(a, b) * count + Math.max(a, b))) continue;
      // a wedge's side faces are its third to fifth, in the order of its triangle's edges
      for (let row = 0; row < rows; row++) s.mortise.push({ element: t * rows + row, face: 3 + k });
    }
  });

  let height = (taper.zLower + taper.zUpper) / 2;
  let longer = topEdge / 2 + backEdge / 2;
  s.shares = {
    ...s.shares,
    ribs: height / (height + longer),
    blocks: height / (height + longer),
    linings: 2 * p.graduation!.liningHeight / (2 * p.graduation!.liningHeight + longer),
    bassBar: top.webVolume ? top.barVolume / top.webVolume : 1,
  };
  s.volumes = {
    ...s.volumes,
    top: top.plateVolume, back: back.plateVolume, bassBar: top.barVolume,
    ribs: garland.ribVolume, linings: garland.liningVolume, blocks: garland.blockVolume,
    neck: neck.neckVolume, fingerboard: neck.boardVolume,
  };
  return s;
}

// the deck for the whole violin, free: every part's elements under the materials and grain its own
// deck gives it, the garland's woods lightened by their shares, and the heel tied to the neck block
export function buildViolinDeck(p: ViolinFamilyParams, s: ViolinFemSolve, modes: number, name: string): string {
  let wood = p.wood!;
  let neckAngle = p.neck!.angle * TURN.degree;
  let materials = [
    calcWoodMaterial('TOP_WOOD', wood.top, wood.top.cut === 'quarter' ? 'R' : 'T'),
    calcWoodMaterial('BACK_WOOD', wood.back, wood.back.cut === 'quarter' ? 'R' : 'T'),
    calcWoodMaterial('RIB_WOOD', wood.ribs, 'R', s.shares.ribs),
    calcWoodMaterial('LINING_WOOD', wood.linings, 'R', s.shares.linings),
    calcWoodMaterial('BLOCK_WOOD', wood.blocks, 'R', s.shares.blocks),
    calcWoodMaterial('NECK_WOOD', wood.neck, 'R'),
    calcWoodMaterial('BOARD_WOOD', wood.fingerboard, 'R'),
  ];
  let orientations: FemOrientation[] = [
    { name: 'PLATE_GRAIN', x: { x: 0, y: 1, z: 0 }, xy: { x: -1, y: 0, z: 0 } },
    { name: 'BLOCK_GRAIN', x: { x: 0, y: 0, z: 1 }, xy: { x: 0, y: 1, z: 0 } },
    { name: 'NECK_GRAIN', x: { x: 0, y: Math.cos(neckAngle), z: -Math.sin(neckAngle) }, xy: { x: 1, y: 0, z: 0 } },
  ];
  let sets: FemShellSet[] = [
    { name: 'TOP', type: 'S6', elements: s.top, material: 'TOP_WOOD', orientation: 'PLATE_GRAIN', thickness: null, normals: s.plateNormals },
    { name: 'BACK', type: 'S6', elements: s.back, material: 'BACK_WOOD', orientation: 'PLATE_GRAIN', thickness: null, normals: s.plateNormals },
  ];
  if (s.web.length) {
    materials.push(calcWoodMaterial('BAR_WOOD', wood.bassBar, 'T', s.shares.bassBar));
    orientations.push({ name: 'BAR_GRAIN', x: { ...vecAtAngle(p.bassBar!.angle * TURN.degree), z: 0 }, xy: { x: 0, y: 0, z: 1 } });
    sets.push({ name: 'BASS_BAR', type: 'S8R', elements: s.web, material: 'BAR_WOOD', orientation: 'BAR_GRAIN', thickness: p.bassBar!.width, normals: null });
  }
  let solids: FemSolidSet[] = [
    { name: 'BLOCKS', type: 'C3D15', elements: s.blocks, material: 'BLOCK_WOOD', orientation: 'BLOCK_GRAIN' },
    { name: 'NECK', type: 'C3D15', elements: s.neck, material: 'NECK_WOOD', orientation: 'NECK_GRAIN' },
    { name: 'FINGERBOARD', type: 'C3D20', elements: s.board, material: 'BOARD_WOOD', orientation: 'NECK_GRAIN' },
  ];
  if (s.post.length) {
    // its grain stands upright as a block's does
    materials.push(calcWoodMaterial('POST_WOOD', wood.soundPost, 'R', s.shares.soundPost));
    solids.push({ name: 'SOUND_POST', type: 'C3D15', elements: s.post, material: 'POST_WOOD', orientation: 'BLOCK_GRAIN' });
  }
  for (let run of s.runs) {
    let grain = `GRAIN_${run.angle}`;
    orientations.push({ name: grain, x: { ...vecAtAngle(run.angle * TURN.degree), z: 0 }, xy: { x: 0, y: 0, z: 1 } });
    sets.push({ name: `RIBS_${run.angle}`, type: 'S8R', elements: run.ribs, material: 'RIB_WOOD', orientation: grain, thickness: p.body.rib, normals: s.ribNormals });
    if (run.linings.length) solids.push({ name: `LININGS_${run.angle}`, type: 'C3D20', elements: run.linings, material: 'LINING_WOOD', orientation: grain });
  }
  let ties = [{ name: 'NECK_JOINT', tolerance: p.body.height * HEEL_GAP_SHARE, nodes: s.heel, faces: s.mortise.map(face => ({ set: 'BLOCKS', ...face })) }];
  return buildCalculixDeck({ heading: [`${name}, the violin glued up, free`], nodes: s.nodes, thickness: s.thickness, sets, solids, ties, materials, orientations, modes: modes + RIGID_MODES });
}
