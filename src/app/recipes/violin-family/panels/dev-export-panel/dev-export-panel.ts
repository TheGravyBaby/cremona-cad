import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { buildGcode, downloadGcodeFile, GcodeJob } from '../../../../helpers/gcodeExporter';
import { closestPointOnSegment, dist, flipPointAboutY, pointInPolygon, signedPolygonArea, TURN } from '../../../../helpers/math/simpleGeometry';
import { pathFromPolyline, pathsBounds, samplePathToPolyline } from '../../../../helpers/math/pathMath';
import { buildPolylineIndex, distPointToPolylineIndexed, pointAtPolylineLength, polylineCumulativeLengths, polylineSlice, simplifyPolyline3D } from '../../../../helpers/math/vibeMath';
import { erodePolygon, flattenPath, offsetPath } from '../../../../helpers/math/pathVibes';
import { inchFraction } from '../../../../helpers/nearestFraction';
import { renderCrosshair, renderPath, renderRect, renderText } from '../../../../helpers/renderFuncs';
import { safeRun } from '../../../../helpers/validators';
import { Circle, Pt, Pt3D, Rectangle } from '../../../../models/types';
import { info } from '../../../../shared/message-emitter';
import { MmInchField } from '../../../../shared/mm-inch-field';
import { DASH, STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { FholeContoursSolve, MouldRelief, MouldSolve, OuterContourSolve, Plate, PlateSurface, RenderLayer, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { contourRings, contourSampleSteps, rowAt, solveCrossArching, surfaceZAt } from '../cross-arching-panel/cross-arching-panel';
import { BACK_ARCH_INK, CHANNEL_INK, TOP_ARCH_INK } from '../long-arching-panel/long-arching-panel';
import { MOULD_EXPORT_STEP, renderMould, solveMould } from '../mould-panel/mould-panel';
import { purflingPath, ribArcs, solveOuterContour } from '../outer-contour-panel/outer-contour-panel';
import { solveMainBouts } from '../main-bouts-panel/main-bouts-panel';
import { solveCorners } from '../corners-panel/corners-panel';
import { solveCenterBout } from '../center-bout-panel/center-bout-panel';
import { fholePath, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';

// G-code for the maker's own machine, offered on localhost only: the files drive a CNC, and nobody
// else's machine is ours to answer for. The recipe names this panel only inside @defer, so a
// visitor's browser never fetches it. Not a CAM program: each export is one thing the shop cuts
// from the recipe (the mould; a plate's arching, purfling channel and contour; the cradle the plate
// is turned over into; the top's f-holes cut in that cradle; scrolls and fingerboards to come),
// planned by code that knows that part, with the user saying only what the stock is and whether
// the wood is hard. The plate, its purfling and its contour are one setup, in that order: all read
// the plate's blank and where the plate sits in it, so every file agrees, and the contour comes
// last since the waste round it is what holds the blank down. The cradle is its own slab. The
// shop's settings are not the instrument's, so they live in this browser's localStorage, not on
// the recipe. The ⓘ's text is kept here, not in docs/, for the same reason.
//
// Adding an export: a row in EXPORTS and STOCK_OF, a bit slot in StageKey if it takes its own, and
// a case in planExport that solves the part, plans its toolpaths and lists its layers. The sheet,
// the tabs' lifts and the writer are shared, and the plan the panel shows is the file's own header

export type ExportId = 'mould' | 'plate' | 'purfling' | 'contour' | 'cradle' | 'fholes';

export interface ExportKind {
  id: ExportId;
  label: string;
}

export const EXPORTS: readonly ExportKind[] = [
  { id: 'mould', label: 'Mould' }, { id: 'plate', label: 'Plate' }, { id: 'purfling', label: 'Purfling' }, { id: 'contour', label: 'Contour' }, { id: 'cradle', label: 'Cradle' }, { id: 'fholes', label: 'F-holes' },
];

// whose stock an export cuts: the purfling and the contour are cut in the plate's blank, in the
// plate's setup; the cradle in a slab of its own, and the f-holes in the plate held in that slab
export type StockId = 'mould' | 'plate' | 'cradle';
export const STOCK_OF: Record<ExportId, StockId> = { mould: 'mould', plate: 'plate', purfling: 'plate', contour: 'plate', cradle: 'cradle', fholes: 'cradle' };

export type Wood = 'soft' | 'hard';

export interface StockSettings {
  stock: { thickness: number; width: number; length: number };
  wood: Wood;
}

// the arching's stages, in cutting order
export type Stage = 'rough' | 'finish';

// a plate blank, bookmatched: planed flat on the joint face, which goes down on the bed, and a
// roof above it from `thickness` at the seam to `edge` at the blank's long edges. It sits in the
// harness, pushed into the corner of its two fences: `fence` is where they stand from the
// machine's zero, the vertical fence's X and the horizontal fence's Y, so the file's XY0 is the
// harness's zero and the blank's lower-left corner is at `fence`, the same for every file cut in
// it. The plate's centre line goes on the seam, measured from the blank's left edge as it sits
// against the fence (the two halves need not be the same width), and the plate is centred along
// the blank. The purfling strip is the shop's too: `purflingDepth` is how deep its channel goes
// under the plate's edge
export interface PlateSettings extends StockSettings {
  stock: StockSettings['stock'] & { edge: number };
  fence: Pt;
  seam: number;
  plate: Plate;
  stage: Stage;
  purflingDepth: number;
}

// the cradle's stages: the pocket the plate's outline sits in, its floor the lip, then the hole
// through the slab inside the lip. Both with the plate's roughing bit
export type CradleStage = 'pocket' | 'hole';

// a flat, square slab (MDF or ply) the plate is held in for its inside, either way up; it borrows
// the plate's roughing bit. The plate is centred in it, so no placement is typed. Cut to the
// back's outline it takes the top too
export interface CradleSettings extends StockSettings {
  plate: Plate;
  stage: CradleStage;
}

// the f-holes' stages, in cutting order: the eyes through the plate, then the outline scribed
export type FholeStage = 'eyes' | 'scribe';

// the top's f-holes, cut with the graduated plate face up in its cradle: `thickness` is the
// plate's at the f-holes once graduated, which the recipe does not know, and sets how far the
// eyes go through; `scribeDepth` how far under the surface the V bit draws the outline
export interface FholeSettings {
  stage: FholeStage;
  thickness: number;
  scribeDepth: number;
}

// the bit slots, one per thing cut with a bit of its own, each the number of a row in TOOLS. The
// cradle borrows the roughing bit; the mould's bit is the Mould panel's param
export type StageKey = Stage | 'purfling' | 'contour' | FholeStage;
export const STAGE_SHAPE: Record<StageKey, ToolShape> = { rough: 'flat', finish: 'ball', purfling: 'flat', contour: 'flat', eyes: 'flat', scribe: 'v' };

// one stock per setup: a mould comes out of a ply sheet, a plate and its purfling and contour out
// of a blank, a cradle out of a slab
export interface DevExportSettings {
  job: ExportId;
  tools: Record<StageKey, number>;
  mould: StockSettings;
  plate: PlateSettings;
  cradle: CradleSettings;
  fholes: FholeSettings;
}

export const DEFAULT_SETTINGS: DevExportSettings = {
  job: 'mould',
  tools: { rough: 2, finish: 3, purfling: 7, contour: 1, eyes: 6, scribe: 9 },
  mould: { stock: { thickness: 19, width: 300, length: 400 }, wood: 'soft' },
  plate: { stock: { thickness: 22, edge: 10, width: 230, length: 420 }, fence: { x: 25, y: 25 }, seam: 115, wood: 'soft', plate: 'top', stage: 'rough', purflingDepth: 2 },
  cradle: { stock: { thickness: 25, width: 230, length: 420 }, wood: 'soft', plate: 'back', stage: 'pocket' },
  fholes: { stage: 'eyes', thickness: 2.8, scribeDepth: 0.3 },
};

// the slot the open job cuts with; none for the mould, whose bit is the recipe's
export function stageOf(s: DevExportSettings): StageKey | null {
  let job = s.job;
  return job === 'mould' ? null : job === 'plate' ? s.plate.stage : job === 'cradle' ? 'rough' : job === 'fholes' ? s.fholes.stage : job;
}

// what never changes between jobs, so it is never asked. Z zero is the spoilboard, so a sheet
// thinner than typed still cuts through; XY zero is the sheet's lower left, where a BitZero finds
// it, and the part is centred in the sheet. The router's dial sets its speed, but Carbide Motion
// still expects an M3 with an S word. mm and mm/min
export const MACHINE = {
  overcut: 0.2,
  // above the stock's top
  safeZ: 12.7,
  // along the path, bit included
  tabWidth: 18,
  tabHeight: 3,
  spindleRpm: 18000,
} as const;

// how the sheet holds the mould while its loops are cut through
export const MOULD_TABS = { outline: 4, window: 2 } as const;

// how the blank holds the plate while its contour is cut through: a tab at the widest of each
// bout and the waist of each C, low enough to saw off a 4 mm edge
export const PLATE_TABS = { height: 1.5, width: 12 } as const;

// the cradle: a pocket of the plate's outline `wall` deep, a hair of `clearance` outside the
// outline so the plate registers against its side; a `lip` left standing inside it for the plate's
// land to rest on, wider than the land since face down the fluting channel sits above it; and a
// hole through the slab inside the lip, held by `tabs` until it drops. Face down the crown hangs in
// the hole, `crownClearance` off the bed at least. mm
export const CRADLE = { wall: 3, clearance: 0.15, lip: 8, crownClearance: 2, tabs: 4 } as const;
export type CradleSpec = { [K in keyof typeof CRADLE]: number };

// the f-holes: the eyes stop `allowance` short of the drawn circle, left for the knife, and go
// `exitMargin` past the typed thickness, since the graduated inside is the maker's own. mm
export const FHOLE = { allowance: 0.5, exitMargin: 1 } as const;

// how a plate's surface is carved: lines along the length, the roughing in terraces that leave a
// skin for the ball, the finishing one pass at the scallop's stepover. mm
export const SURFACE = {
  // over the finished surface, after roughing
  leave: 0.5,
  // between neighbouring finishing lines
  scallop: 0.05,
  // the flat bit's stepover, of its diameter
  roughStepover: 0.5,
  // the carved area past the outline, so the outline cut later lands on finished land
  skirt: 8,
  // the height field's sample spacing for the file
  grid: 0.5,
  // a vertex this close to its neighbours' chord is dropped from the file
  chordTolerance: 0.01,
} as const;

// the preview's height field, coarse enough to sample on every edit
const PREVIEW_GRID = 4;

const MACHINE_HELP = {
  title: 'Dev Export: the fixed plan',
  text:
    'Everything the panel does not ask you for is a constant, fixed so that no visit to the shop can drift it. The first mould was cut with exactly these numbers.\n\n' +
    'ZERO\n' +
    'Z0 is the spoilboard, so the file reads the top of the stock as Z = thickness. A sheet thinner than typed still cuts through, and a reference set on the stock top (which once ruined a sheet) cannot creep. ' +
    'XY0 is the sheet\'s lower-left corner, the point the BitZero finds. The part is centred in the sheet, so there is no margin to set; the sheet only has to be the part, plus one bit width, plus 5 mm a side.\n\n' +
    'OVERCUT\n' +
    `${MACHINE.overcut} mm. The last pass goes this far into the spoilboard. Ply is only nominal in thickness and the spoilboard is never quite flat, and a skin left under the part is worse than a scratch in the spoilboard.\n\n` +
    'SAFE Z\n' +
    `${MACHINE.safeZ} mm above the stock (half an inch). It is the only height the bit travels at rapid, clear of clamps and tabs. Every drop into the work is at plunge feed.\n\n` +
    'TABS\n' +
    `${MACHINE.tabWidth} mm along the path and ${MACHINE.tabHeight} mm high. The mould takes ${MOULD_TABS.outline} on the outline and ${MOULD_TABS.window} per window. ` +
    'They mirror across the centre line. The outline\'s tabs sit out on the bouts so none lands in a block notch. The windows are cut first, so the full sheet is still holding the mould while they are cut. ' +
    `A plate\'s contour takes six, ${PLATE_TABS.width} mm long and ${PLATE_TABS.height} mm high, at the widest of each bout and the waist of each C, clear of the corners.\n\n` +
    'DIRECTION\n' +
    'Climb cutting, for a router turning clockwise: counterclockwise round the outside, clockwise inside a window. It leaves a cleaner edge in ply with less tear-out.\n\n' +
    'NOTCH CORNERS\n' +
    'Each block notch is cut as a dog-bone. The bit runs to the corner, then presses into it along the diagonal exactly as far as the drawn relief circle reaches, so the block seats square.\n\n' +
    'FEEDS\n' +
    'Set per bit and wood, from the bit maker\'s chart or a job cut here, with the source of each row noted beside it in the code. Amana\'s charts run at 18,000 rpm and a depth of one diameter, with a ramp-down of the feed over the flutes: the feed and the ramp are taken as printed, the depth halved for this router. Only the 1/4" downcut in soft wood has been cut here; cut scrap before trusting any other row.\n\n' +
    'SPINDLE\n' +
    `S${MACHINE.spindleRpm}. The router's own dial sets the real speed, but Carbide Motion still wants an M3 with an S word. Before it, the file pauses (M0) with a message naming the bit and the speed; the spindle starts and the cut begins only once you resume.\n\n` +
    'PLATE\n' +
    'The blank goes joint face down, pushed into the corner of the harness\'s two fences, so Z0 is the bed it lies on and the plate\'s edge comes out at Z = its edge thickness; the floor the file never crosses is the bottom of the fluting channel, a little under that. XY0 is the harness\'s zero; the fences stand at the X and Y typed, and the blank\'s lower-left corner is in their angle. ' +
    'Type the blank\'s size and its thickness at the seam and at its long edges, and the seam\'s distance from the blank\'s left edge as it sits against the fence. The plate\'s centre line goes on the seam, and the plate is centred along the blank. The plan refuses a blank the surface would stand proud of, or that the carved area runs off. The margin past the carved area is where the screws go.\n\n' +
    `The carved area runs ${SURFACE.skirt} mm past the outline, so the outline cut later lands on finished land. Lines run along the length, bass side first, each pair joined at their ends so the bit never lifts between them. ` +
    `Roughing takes a flat bit in terraces one step down apart, riding over whatever still stands above a terrace, and leaves ${SURFACE.leave} mm for the ball. ` +
    `Finishing takes a ball bit in one pass, its lines spaced for a ${SURFACE.scallop} mm scallop; the tip stands off the surface wherever the ball would touch it first. ` +
    'A run diving steeper than 30° is fed at the plunge rate.\n\n' +
    'PURFLING\n' +
    'Cut in the plate\'s blank after its finishing pass, so it reads the blank and plate typed under Plate. The channel is the strip\'s width between the two purfling lines the Outer Contour panel draws, its floor one flat depth under the plate\'s edge, the strip\'s height: the channel is gouged flush afterwards, so its depth is held against the edge rather than the carved surface. A bit the channel\'s width takes it in one pass; a narrower one in passes across it; a bit wider than the channel is refused. Each pass goes round once per step down, diving to the next round where it closes. The corners come to the bee sting\'s point in plan and are finished with the knife.\n\n' +
    'CONTOUR\n' +
    'Cut last in the plate\'s blank, after the purfling, since the waste round the plate is what holds it down. The bit runs a radius outside the plate\'s outline, the button included on the back, counterclockwise for a climb cut, in passes from the land the arching left down through the bed\'s overcut, lifting over the tabs on the passes below them. The safe height still clears the blank\'s seam, which stands well above the land.\n\n' +
    'CRADLE\n' +
    `A slab of MDF or ply, flat and square, the plate held in it for its inside either way up: a pocket of the plate\'s outline ${CRADLE.wall} mm deep and ${CRADLE.clearance} mm clear of it, so the outline registers against the pocket\'s side; a lip ${CRADLE.lip} mm wide left standing inside the pocket for the plate\'s land to rest on, wider than the land because face down the fluting channel sits above it, and the plan refuses a lip the arch would reach; and a hole through the slab inside the lip, so face down the crown hangs free, at least ${CRADLE.crownClearance} mm off the bed. ` +
    `Two files with the plate\'s roughing bit: the pocket, loops clearing the ring from the wall to the lip\'s inner edge, and the hole, cut through in passes and held by ${CRADLE.tabs} tabs until it drops. Cut to the back\'s outline the cradle takes the top too. The slab needs no harness: clamp it to the table and set XY0 at its lower-left corner with the probe; the plate is centred in it. The dome is unsupported: pad under it for the graduation.\n\n` +
    'F-HOLES\n' +
    'Cut with the graduated top face up in its cradle, resting on the lip, so they read the slab typed under Cradle and the plate is where the cradle put it. The router never cuts the f-hole\'s edge: the passage round a wing\'s tip is narrower than any bit, and the edge is the most looked-at line on the plate. ' +
    `Two files. The eyes, cleared through the plate with a small flat bit in loops from the centre out, clockwise, stopping ${FHOLE.allowance} mm inside the drawn circle for the knife, down to the thickness you type plus ${FHOLE.exitMargin} mm, since the recipe has no map of the inside; below the eye is the cradle\'s hole, and an eye over its lip is refused. ` +
    'Then the outline, both holes as drawn with wing tips and nicks, scribed with a V bit a few tenths under the surface: its point is as fine as its depth, and the groove\'s centre is the drawn line whatever the depth, so the knife has a line to follow and the eyes drilled and sawn by hand are already done. ' +
    'Either way Z follows the surface along the loop, the outside at that point less the depth, so a small bit is never buried past its flutes at the high end of a hole that falls across the arch, and the safe height clears the crown, not the slab.\n\n' +
    'PLANNING\n' +
    'The download plans the cut again from the fine solve that the sheet exports use, so the coarser sampling of the preview never reaches the file.',
};

export interface Feeds {
  cutFeed: number;
  plungeFeed: number;
  stepDown: number;
}

export type ToolShape = 'flat' | 'ball' | 'v';

// the shop's bits, one slot each (the number the file's tool change and its prompt name): the
// recipe's mould bit has to match one by diameter to get feeds. A row is cut here, or read off the
// maker's chart, the source beside it. Amana's charts (18,000 rpm, a depth of one diameter) give
// the feed and a ramp-down of the feed over the flutes, which is the plunge here; their depth is
// halved below, the ceiling this router is trusted with until scrap says otherwise. The ball
// charts split soft and hard wood, the spiral plunge chart does not. A null row is one nobody has
// looked up yet. 1 ipm = 25.4 mm/min
export interface Tool {
  number: number;
  name: string;
  diameter: number;
  shape: ToolShape;
  // a V bit's included angle, degrees
  angle?: number;
  feeds: Record<Wood, Feeds | null>;
}

export const TOOLS: readonly Tool[] = [
  {
    number: 1, name: '1/4" downcut (Carbide #251)', diameter: 6.35, shape: 'flat',
    feeds: {
      // cut the first mould, 19 mm ply (75 ipm, 15 ipm, 0.06")
      soft: { cutFeed: 1905, plungeFeed: 381, stepDown: 1.524 },
      // Carbide Create's library default for the 1/4" #201 in hardwood (60 ipm, 12 ipm, 0.04"),
      // the #251 being its downcut twin; not yet cut here
      hard: { cutFeed: 1524, plungeFeed: 305, stepDown: 1.016 },
    },
  },
  {
    // Amana spiral plunge chart, 1/4" (46102 and kin): 180 ipm, ramp 90; not yet cut here
    number: 2, name: '1/4" upcut spiral', diameter: 6.35, shape: 'flat',
    feeds: { soft: { cutFeed: 4572, plungeFeed: 2286, stepDown: 3.175 }, hard: { cutFeed: 4572, plungeFeed: 2286, stepDown: 3.175 } },
  },
  {
    // Amana ball nose chart, 1/4", the low chip load (soft 0.007", hard 0.005", two flutes:
    // 252 and 180 ipm); not yet cut here
    number: 3, name: '1/4" ball nose', diameter: 6.35, shape: 'ball',
    feeds: { soft: { cutFeed: 6401, plungeFeed: 3200, stepDown: 3.175 }, hard: { cutFeed: 4572, plungeFeed: 2286, stepDown: 3.175 } },
  },
  {
    // Amana ball nose chart, 1/8" (soft 0.005", hard 0.003": 180 and 108 ipm); not yet cut here
    number: 4, name: '1/8" ball nose', diameter: 3.175, shape: 'ball',
    feeds: { soft: { cutFeed: 4572, plungeFeed: 2286, stepDown: 1.5875 }, hard: { cutFeed: 2743, plungeFeed: 1372, stepDown: 1.5875 } },
  },
  {
    // Amana spiral plunge chart, 1/8" (46200 and kin): 145 ipm, ramp 72.5; not yet cut here
    number: 5, name: '1/8" downcut spiral', diameter: 3.175, shape: 'flat',
    feeds: { soft: { cutFeed: 3683, plungeFeed: 1842, stepDown: 1.5875 }, hard: { cutFeed: 3683, plungeFeed: 1842, stepDown: 1.5875 } },
  },
  {
    // Amana spiral plunge chart, 1/16" (46237): 70 ipm, ramp 35; not yet cut here. Amana does not
    // guarantee bits this small against breakage
    number: 6, name: '1/16" downcut spiral', diameter: 1.5875, shape: 'flat',
    feeds: { soft: { cutFeed: 1778, plungeFeed: 889, stepDown: 0.79 }, hard: { cutFeed: 1778, plungeFeed: 889, stepDown: 0.79 } },
  },
  {
    // a luthier's purfling end mill, the width of a violin's strip; feeds from the nearest row of
    // Amana's spiral plunge chart, 3/64" (1.19 mm): 40 ipm, ramp 20; not yet cut here
    number: 7, name: '1.2 mm purfling end mill', diameter: 1.2, shape: 'flat',
    feeds: { soft: { cutFeed: 1016, plungeFeed: 508, stepDown: 0.6 }, hard: { cutFeed: 1016, plungeFeed: 508, stepDown: 0.6 } },
  },
  {
    // the same, for a violin or viola strip; between Amana's 3/64" and 1/16" rows, the smaller taken
    number: 8, name: '1.4 mm purfling end mill', diameter: 1.4, shape: 'flat',
    feeds: { soft: { cutFeed: 1016, plungeFeed: 508, stepDown: 0.7 }, hard: { cutFeed: 1016, plungeFeed: 508, stepDown: 0.7 } },
  },
  {
    // Amana's 15-60-90° V-groove engraving chart (45782 and kin, two flutes): 50 to 125 ipm in
    // soft and hard wood alike, the low end taken, ramp half; not yet cut here. The scribe is a
    // few tenths deep, nowhere near the chart's depth of one diameter
    number: 9, name: '60° V engraving bit', diameter: 6.35, shape: 'v', angle: 60,
    feeds: { soft: { cutFeed: 1270, plungeFeed: 635, stepDown: 3.175 }, hard: { cutFeed: 1270, plungeFeed: 635, stepDown: 3.175 } },
  },
];

export function toolFor(diameter: number): Tool | null {
  return TOOLS.find(t => t.shape === 'flat' && Math.abs(t.diameter - diameter) < 0.01) ?? null;
}

// what a planner is told about the bit: the mould's comes from the recipe and may match no row
export interface Bit {
  diameter: number;
  shape: ToolShape;
  angle?: number;
  feeds: Feeds | null;
}

const STORAGE_KEY = 'devExport';
const WOODS: readonly Wood[] = ['soft', 'hard'];
const PLATES: readonly Plate[] = ['top', 'back'];
const STAGES: readonly Stage[] = ['rough', 'finish'];
const CRADLE_STAGES: readonly CradleStage[] = ['pocket', 'hole'];
const FHOLE_STAGES: readonly FholeStage[] = ['eyes', 'scribe'];
const STOCKS: readonly StockId[] = ['mould', 'plate', 'cradle'];

@Component({
  selector: 'app-vf-dev-export-panel',
  imports: [FormsModule, MmInchField],
  templateUrl: './dev-export-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevExportPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('classicCremona');
  protected readonly fhole = FHOLE;
  protected readonly stageShape = STAGE_SHAPE;
  protected readonly exports = EXPORTS;

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Input() fileName = '';
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  settings: DevExportSettings = readSettings();
  // what the last draw planned; the template reads its failures
  toolpaths: Toolpaths | null = null;

  ngOnInit(): void {
    this.draw();
  }

  // a shop setting: stored here, never on the recipe, so it never reaches the undo stack
  edited(): void {
    writeSettings(this.settings);
    this.draw();
  }

  // the bit is the mould panel's param (its reliefs are cut for it), so changing it here is a
  // recipe edit like any other
  setBit(diameter: number): void {
    if (!this.params.mould) return;
    this.params.mould.bitDiameter = diameter;
    this.edit.emit();
    this.draw();
  }

  help(): void {
    info(MACHINE_HELP.text, MACHINE_HELP.title, 60000, true);
  }

  report(): void {}

  draw(): void {
    safeRun(() => {
      let bit = this.bit;
      let plan = bit ? planExport(this.params, this.settings, bit, this.pal, this.flags) : null;
      this.toolpaths = plan?.toolpaths ?? null;
      this.drawn.emit(plan ? [inSheet(plan.toolpaths, plan.layers)] : []);
    });
  }

  // the open job's stock
  get g(): StockSettings {
    return this.settings[STOCK_OF[this.settings.job]];
  }

  // cut in the plate's blank: the plate, its purfling and its contour
  get onBlank(): boolean {
    return STOCK_OF[this.settings.job] === 'plate';
  }

  // held in the cradle's slab: the cradle itself and the f-holes
  get inCradle(): boolean {
    return STOCK_OF[this.settings.job] === 'cradle';
  }

  get blank(): PlateSettings {
    return this.settings.plate;
  }

  get cradle(): CradleSettings {
    return this.settings.cradle;
  }

  get fholes(): FholeSettings {
    return this.settings.fholes;
  }

  // the settings naming the plate the job is cut to
  get cutTo(): PlateSettings | CradleSettings {
    return this.onBlank ? this.blank : this.cradle;
  }

  // the wood the bit meets: the f-holes cut the plate, not the slab it sits in
  get wood(): Wood {
    return this.settings.job === 'fholes' ? this.blank.wood : this.g.wood;
  }

  get bitDiameter(): number {
    return this.params.mould?.bitDiameter ?? NaN;
  }

  get stage(): StageKey | null {
    return stageOf(this.settings);
  }

  toolsFor(shape: ToolShape): Tool[] {
    return TOOLS.filter(t => t.shape === shape);
  }

  get tool(): Tool | null {
    let stage = this.stage;
    if (!stage) return toolFor(this.bitDiameter);
    return TOOLS.find(t => t.number === this.settings.tools[stage]) ?? null;
  }

  get feeds(): Feeds | null {
    return this.tool?.feeds[this.wood] ?? null;
  }

  get bit(): Bit | null {
    if (!this.stage) return { diameter: this.bitDiameter, shape: 'flat', feeds: this.feeds };
    let tool = this.tool;
    return tool ? { diameter: tool.diameter, shape: tool.shape, angle: tool.angle, feeds: this.feeds } : null;
  }

  // the plan as the file's header will say it
  get notes(): string[] {
    return this.feeds && this.toolpaths ? jobNotes(this.toolpaths, this.feeds) : [];
  }

  get canDownload(): boolean {
    return !!this.feeds && !!this.toolpaths && !this.toolpaths.failures.length;
  }

  reset(): void {
    this.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), job: this.settings.job };
    this.edited();
  }

  // planned again from the fine solve the sheets export from, not the preview's
  download(): void {
    let tool = this.tool, feeds = this.feeds, bit = this.bit;
    if (!tool || !feeds || !bit) return;
    let plan = planExport(this.params, this.settings, bit, this.pal, this.flags, true);
    if (!plan || plan.toolpaths.failures.length) return;
    let text = buildGcode(gcodeJob(plan.toolpaths, tool, feeds));
    let job = this.settings.job;
    let part = job === 'plate' ? `plate-${this.blank.plate}-${this.blank.stage}` : job === 'cradle' ? `cradle-${this.cradle.plate}-${this.cradle.stage}` : job === 'fholes' ? `fholes-${this.fholes.stage}` : job === 'mould' ? job : `${job}-${this.blank.plate}`;
    downloadGcodeFile(`${this.fileName.trim() || 'violin-family'}-${part}.nc`, text);
  }
}

export interface ExportPlan {
  toolpaths: Toolpaths;
  // what the canvas shows for this job, in world coordinates: inSheet shifts them onto the sheet
  layers: RenderLayer[];
}

// one case per export: solve the part (finely for the file, coarsely for the preview), plan its
// toolpaths and say what to draw. Null when the recipe has not reached that part yet
export function planExport(p: ViolinFamilyParams, settings: DevExportSettings, bit: Bit, pal: PanelPalette, flags: ViolinFamilyViewFlags, fine = false): ExportPlan | null {
  let { plate: b, cradle: c } = settings;
  switch (settings.job) {
    case 'mould': {
      let s = fine ? solveMould(p, MOULD_EXPORT_STEP) : solveMould(p);
      if (!s) return null;
      let toolpaths = mouldToolpaths(s, bit.diameter, settings.mould);
      return { toolpaths, layers: [renderMould(s, pal, flags), renderSheet(toolpaths, settings.mould, pal), renderToolpaths(toolpaths, pal)] };
    }
    case 'plate': {
      let surface = solveCrossArching(p)?.[b.plate];
      if (!surface) return null;
      let toolpaths = archingToolpaths(p, surface, bit, b, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderArching(p, surface, b.plate, toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'purfling': {
      let surface = solveCrossArching(p)?.[b.plate];
      let o = solveOuterContour(p);
      if (!surface || !o?.purfling) return null;
      let toolpaths = purflingToolpaths(p, surface, bit, b, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderLines([o.purfling, o.outerPurfling], pal), renderToolpaths(toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'contour': {
      let surface = solveCrossArching(p)?.[b.plate];
      let o = solveOuterContour(p);
      if (!surface || !o) return null;
      let toolpaths = contourToolpaths(p, surface, o, bit, b);
      return { toolpaths, layers: [renderOutline(surface, pal), renderToolpaths(toolpaths, pal), renderSeam(b, toolpaths, pal), renderSheet(toolpaths, b, pal)] };
    }
    case 'cradle': {
      let surface = solveCrossArching(p)?.[c.plate];
      let o = solveOuterContour(p);
      if (!surface || !o) return null;
      let toolpaths = cradleToolpaths(p, surface, o, bit, c);
      return { toolpaths, layers: [renderOutline(surface, pal), renderHole(o, c.plate, pal), renderToolpaths(toolpaths, pal), renderSheet(toolpaths, c, pal)] };
    }
    case 'fholes': {
      let arching = solveCrossArching(p);
      let surface = arching?.top, seat = arching?.[c.plate];
      let o = solveOuterContour(p);
      let s = p.fHoleContours ? solveFholeContours(p) : null;
      if (!surface || !seat || !o || !s?.path) return null;
      let toolpaths = fholeToolpaths(p, s, surface, seat, o, bit, c, settings.fholes, fine);
      return { toolpaths, layers: [renderOutline(surface, pal), renderHole(o, c.plate, pal), renderLines([s.path, fholePath(p, s, true)], pal), renderToolpaths(toolpaths, pal), renderSheet(toolpaths, c, pal)] };
    }
  }
}

// the panel drawn in the machine's coordinates: shifted by the sheet offset, so the canvas origin
// is the file's XY zero and a point read off the canvas is the X and Y the file sends. The ui
// group is Y-flipped, so its shift mirrors
export const inSheet = (tp: Toolpaths, layers: RenderLayer[]): RenderLayer => (g: any, ui: any): void => {
  let { x, y } = tp.sheetOffset;
  let gs = g.append('g').attr('transform', `translate(${x},${y})`);
  let uis = ui.append('g').attr('transform', `translate(${x},${-y})`);
  for (let layer of layers) layer(gs, uis);
};

// the stock as the machine sees it, drawn round the part: its outline dashed, its size written
// above it in both units, the XY zero marked; where the stock sits in a harness, the zero is the
// harness's own and the fences are drawn as the L the stock is pushed into. In the alert ink when
// the plan has something to say. In world coordinates, like the part: inSheet shifts both
export const renderSheet = (tp: Toolpaths, g: StockSettings, pal: PanelPalette) => (gr: any, ui: any): void => {
  let { width: w, length: l } = g.stock;
  if (!(w > 0 && l > 0)) return;
  let zero = { x: -tp.sheetOffset.x, y: -tp.sheetOffset.y };
  let origin = { x: zero.x + tp.stockOrigin.x, y: zero.y + tp.stockOrigin.y };
  let color = tp.failures.length ? pal.alert : pal.neutral;
  renderRect(new Rectangle(origin, { x: origin.x + w, y: origin.y + l }), color, 'none', STROKE_WEIGHT.guide, DASH.guide)(gr, ui);
  let inches = (mm: number) => inchFraction(mm / 25.4).replace(/^≈\s*/, '');
  renderText({ x: origin.x + w / 2, y: origin.y + l + 6 }, `${w} × ${l} mm  (${inches(w)}" × ${inches(l)}")`, color, SHEET_LABEL_SIZE)(gr, ui);
  if (tp.stockOrigin.x || tp.stockOrigin.y) {
    let reach = 20;
    renderPath(`M ${origin.x + w + reach} ${zero.y} L ${zero.x} ${zero.y} L ${zero.x} ${origin.y + l + reach}`, pal.neutral, STROKE_WEIGHT.section)(gr, ui);
    renderText({ x: zero.x - 6, y: origin.y + l + reach }, 'fence', pal.neutral, SHEET_LABEL_SIZE, -90)(gr, ui);
  }
  renderCrosshair(zero, color, 6, STROKE_WEIGHT.guide, 1, true, 1)(gr, ui);
  renderText({ x: zero.x + 10, y: zero.y - 6 }, 'X0 Y0', color, SHEET_LABEL_SIZE)(gr, ui);
};

const SHEET_LABEL_SIZE = 5;

// the cutter's centre lines, faint: a loop with its tabs as halos where the bit stays up, a
// surface run as it lies. In the alert ink when the plan has something to say
export const renderToolpaths = (tp: Toolpaths, pal: PanelPalette) => (g: any, ui: any): void => {
  let ink = tp.failures.length ? pal.alert : pal.ink(3);
  for (let path of tp.paths) {
    renderPath(pathFromPolyline(path.loop), ink, STROKE_WEIGHT.guide, 0.5)(g, ui);
    for (let tab of path.tabs) renderPath(pathFromPolyline(tab.pts), ink, STROKE_WEIGHT.focusHalo, 0.6)(g, ui);
  }
  for (let run of tp.surfaces) renderPath(pathFromPolyline(run.pts), ink, STROKE_WEIGHT.guide, 0.6)(g, ui);
};

// the plate's outline as the Cross Arching panel maps it
export const renderOutline = (surface: PlateSurface, pal: PanelPalette) => (gr: any, ui: any): void => {
  renderPath(pathFromPolyline(surface.outline, true), pal.neutral, STROKE_WEIGHT.guide, 0.8)(gr, ui);
};

// lines of the drawing the cut is set out from: the purfling's edges, the f-holes
export const renderLines = (ds: (string | null)[], pal: PanelPalette) => (gr: any, ui: any): void => {
  for (let d of ds) if (d) renderPath(d, pal.neutral, STROKE_WEIGHT.guide, 0.8)(gr, ui);
};

// the cradle's hole, the lip's inner edge, dashed
export const renderHole = (o: OuterContourSolve, plate: Plate, pal: PanelPalette) => (gr: any, ui: any): void => {
  let hole = o[plate] && insideOutline(o[plate]!, CRADLE.lip);
  if (hole) renderPath(hole, pal.neutral, STROKE_WEIGHT.guide, 0.8, DASH.guide)(gr, ui);
};

// the plate's contours as the Cross Arching panel maps them, under the raster's lines
export const renderArching = (p: ViolinFamilyParams, surface: PlateSurface, plate: Plate, tp: Toolpaths, pal: PanelPalette) => (gr: any, ui: any): void => {
  let ink = pal.ink(plate === 'top' ? TOP_ARCH_INK : BACK_ARCH_INK);
  let { stepMm, gridMm } = contourSampleSteps(p, p.arching![plate].arch.height);
  for (let { level, rings } of contourRings(p, surface, stepMm, gridMm)) {
    let d = rings.map(ring => `M ${ring.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`).join(' ');
    renderPath(d, level <= 0 ? pal.ink(CHANNEL_INK) : ink, STROKE_WEIGHT.guide, level <= 0 ? 0.9 : 0.7)(gr, ui);
  }
  let raster = tp.raster;
  if (!raster) return;
  let color = tp.failures.length ? pal.alert : pal.ink(3);
  for (let x of raster.xs) renderPath(`M ${x} ${raster.yMin} L ${x} ${raster.yMax}`, color, STROKE_WEIGHT.guide, 0.25)(gr, ui);
};

// the blank's seam, where the user measured it
export const renderSeam = (g: PlateSettings, tp: Toolpaths, pal: PanelPalette) => (gr: any, ui: any): void => {
  let seamX = tp.stockOrigin.x + g.seam - tp.sheetOffset.x;
  let yLow = tp.stockOrigin.y - tp.sheetOffset.y, yHigh = yLow + g.stock.length;
  renderPath(`M ${seamX} ${yLow} L ${seamX} ${yHigh}`, pal.neutral, STROKE_WEIGHT.guide, 0.8, DASH.preview)(gr, ui);
  renderText({ x: seamX, y: yHigh - 8 }, 'seam', pal.neutral, SHEET_LABEL_SIZE)(gr, ui);
};

export interface CutPlan {
  // where the passes start, and the floor in the file's own Z below which the writer refuses to move
  topZ: number;
  floorZ: number;
  passes: number;
  // how far the bit cuts
  metres: number;
}

// what the file steps through: the passes a surfacing planner counted, or a profile job's steps
// down from where its cut starts to the floor; and the cutting length, each loop once per pass
// and each run as it lies, or a raster's estimate while it has no runs yet
export function cutPlan(tp: Toolpaths, feeds: Feeds): CutPlan {
  let top = tp.cutTopZ ?? tp.stockTopZ;
  let passes = tp.passes ?? (feeds.stepDown > 0 ? Math.ceil((top - tp.floorZ) / feeds.stepDown) : 0);
  let length = (pts: Pt[]) => polylineCumulativeLengths(pts)[pts.length - 1] ?? 0;
  let mm = tp.paths.reduce((sum, path) => sum + length(path.loop) * passes, 0) + tp.surfaces.reduce((sum, run) => sum + length(run.pts), 0);
  return { topZ: top, floorZ: tp.floorZ, passes, metres: tp.paths.length || tp.surfaces.length ? mm / 1000 : tp.metres ?? 0 };
}

// the file's header, and the plan the panel shows: what the planner said of the zero, the stock
// and the cut, then the feeds and the passes
export function jobNotes(tp: Toolpaths, feeds: Feeds, machine = MACHINE): string[] {
  let plan = cutPlan(tp, feeds);
  let minutes = Math.round((plan.metres * 1000) / feeds.cutFeed);
  return [
    ...(tp.caution ? [tp.caution] : []),
    ...tp.notes,
    `Feeds ${feeds.cutFeed} cut, ${feeds.plungeFeed} plunge, ${feeds.stepDown} per pass`,
    `Z${plan.topZ.toFixed(3)} to Z${plan.floorZ.toFixed(3)} in ${plan.passes} pass${plan.passes === 1 ? '' : 'es'}, safe Z${(tp.stockTopZ + machine.safeZ).toFixed(3)}; about ${plan.metres.toFixed(1)} m, ${minutes} min at the cut feed`,
    'Air cut first',
  ];
}

// a key missing or mistyped reads as its default, as SettingsService reads its own
export function readSettings(): DevExportSettings {
  let stored: any = {};
  try {
    let parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // unreadable reads as defaults
  }
  let out: DevExportSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  let positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (EXPORTS.some(e => e.id === stored.job)) out.job = stored.job;
  for (let key of Object.keys(out.tools) as StageKey[]) {
    if (TOOLS.some(t => t.number === stored.tools?.[key])) out.tools[key] = stored.tools[key];
  }
  for (let id of STOCKS) {
    let mine = stored[id];
    let stock: Record<string, number> = out[id].stock;
    for (let key of Object.keys(stock)) if (positive(mine?.stock?.[key])) stock[key] = mine.stock[key];
    if (WOODS.includes(mine?.wood)) out[id].wood = mine.wood;
  }
  let b = stored.plate;
  if (PLATES.includes(b?.plate)) out.plate.plate = b.plate;
  if (STAGES.includes(b?.stage)) out.plate.stage = b.stage;
  for (let key of ['purflingDepth', 'seam'] as const) if (positive(b?.[key])) out.plate[key] = b[key];
  for (let key of ['x', 'y'] as const) {
    let n = b?.fence?.[key];
    if (positive(n) || n === 0) out.plate.fence[key] = n;
  }
  let c = stored.cradle;
  if (PLATES.includes(c?.plate)) out.cradle.plate = c.plate;
  if (CRADLE_STAGES.includes(c?.stage)) out.cradle.stage = c.stage;
  let f = stored.fholes;
  if (FHOLE_STAGES.includes(f?.stage)) out.fholes.stage = f.stage;
  for (let key of ['thickness', 'scribeDepth'] as const) if (positive(f?.[key])) out.fholes[key] = f[key];
  return out;
}

function writeSettings(settings: DevExportSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // a blocked store keeps the settings for this visit
  }
}

// the mould's toolpaths: the windows shrunk by the bit's radius, the outline grown by it, each
// walked the climbing way round from a point between two tabs. Every loop's stations are set out
// evenly from where it crosses the centre line at the top, so the tabs come out mirrored: the
// outline's ends are block notches, so its stations sit between them, out on the bouts; a
// window's long edges are its top and bottom, so its stations start there. Windows come before the outline, so
// the mould stays held. A notch's relief is not offset (the circle grown by the bit is a sliver
// no sampling follows) but cut as a dog-bone: the edges run to the corner, the bit presses in
// along the diagonal as far as the drawn relief reaches, and comes back out
export function mouldToolpaths(s: MouldSolve, bitDiameter: number, g: StockSettings, tabs = MOULD_TABS, machine = MACHINE): Toolpaths {
  let out = emptyToolpaths(g.stock.thickness, -machine.overcut, [
    `Z0 = SPOILBOARD, stock top Z${g.stock.thickness.toFixed(3)}`,
    `XY0 = SHEET LOWER LEFT, sheet ${g.stock.width} x ${g.stock.length}`,
    `Stock ${g.stock.thickness} mm, ${g.wood} wood`,
  ]);
  if (!s.outline) return fail(out, 'The mould has to solve first.');
  if (!(bitDiameter > 0)) return fail(out, 'The bit diameter has to be above 0.');
  let r = bitDiameter / 2;
  s.clampBox.forEach((window, i) => {
    let d = offsetPath(window, -r);
    if (d) out.paths.push(withTabs(`Window ${i + 1}`, climbingLoop(d, 'inside'), evenStations(tabs.window, 0), machine.tabWidth, out.failures));
    else fail(out, `Window ${i + 1} is too narrow for the bit.`);
  });
  let d = offsetPath(s.notchOutline ?? s.outline, r);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  out.paths.push(withTabs('Outline', climbingLoop(d, 'outside', ring => withDogBones(ring, s.reliefs, r)), evenStations(tabs.outline, 0.5), machine.tabWidth, out.failures));
  out.notes.push(`Windows then the outline, through the sheet by ${machine.overcut}; ${tabs.outline} tabs on the outline and ${tabs.window} per window, ${machine.tabHeight} high`);
  let b = pathsBounds(out.paths.map(path => pathFromPolyline(path.loop)));
  centreInSheet(out, { minX: b.minX - r, maxX: b.maxX + r, minY: b.minY - r, maxY: b.maxY + r }, g);
  return out;
}

// the dog-bones spliced into the ring: at each relief the offset edges meet at a corner point the
// ring passes through; the press goes from there to where the bit reaches as far as the relief
function withDogBones(ring: Pt[], reliefs: MouldRelief[], r: number): Pt[] {
  let splices = new Map<number, Pt[]>();
  for (let { corner, inward, reach } of reliefs) {
    let corner_ = { x: corner.x + inward.x * r * Math.SQRT2, y: corner.y + inward.y * r * Math.SQRT2 };
    let press = { x: corner.x + inward.x * (r - reach), y: corner.y + inward.y * (r - reach) };
    let best = { i: -1, d: Infinity };
    for (let i = 0; i < ring.length; i++) {
      let d = closestPointOnSegment(corner_, ring[i], ring[(i + 1) % ring.length]).dist;
      if (d < best.d) best = { i, d };
    }
    if (best.d > 1) continue;
    splices.set(best.i, [corner_, press, corner_]);
  }
  if (!splices.size) return ring;
  // a ring vertex on the corner itself would double it, so repeats are skipped
  let out: Pt[] = [];
  let push = (pt: Pt) => {
    if (!out.length || dist(out[out.length - 1], pt) > 1e-6) out.push(pt);
  };
  ring.forEach((pt, i) => {
    push(pt);
    splices.get(i)?.forEach(push);
  });
  if (out.length > 1 && dist(out[0], out[out.length - 1]) < 1e-6) out.pop();
  return out;
}

// a plate's arching: the surface the Cross Arching panel solves, carved from a blank lying joint
// face down, in lines along the length over an area a skirt past the outline. The height field is
// the plate's surface over the bed (its edge thickness up, so the land is flat at that height and
// the dome stands above it), flat beyond the outline. Roughing with a flat bit goes in terraces,
// each a step down from the last, the bit riding at the terrace or over whatever stands above it
// plus the leave, so a terrace never takes more than one step; lines the blank's roof does not
// reach are skipped. Finishing with a ball bit is one pass, the tip held wherever the ball would
// first touch the surface across its width. Either way the lines are joined end to end into one
// run, so the bit lifts once per terrace
export function archingToolpaths(p: ViolinFamilyParams, surface: PlateSurface, bit: Bit, g: PlateSettings, fine = false, grid = fine ? SURFACE.grid : PREVIEW_GRID): Toolpaths {
  let thickness = p.arching![g.plate].thickness;
  let out = plateToolpaths(p, surface, g, g.stage === 'rough' ? 'arching roughing' : 'arching finishing', bit);
  if (g.stage === 'rough' && bit.shape !== 'flat') fail(out, 'Roughing takes a flat bit.');
  if (g.stage === 'finish' && bit.shape !== 'ball') fail(out, 'Finishing takes a ball bit.');
  if (out.failures.length) return out;
  let { seamX, roof } = blankRoof(g, out);
  return surfacing(out, {
    area: carvedArea(surface),
    roof,
    top: g.stock.thickness,
    roughFloor: thickness + SURFACE.leave,
    rowZ: y => {
      let row = rowAt(surface, y);
      return x => thickness + (surfaceZAt(surface, x, y, row) ?? 0);
    },
    proud: (x, z, roofZ) => `The blank is too thin: ${Math.abs(x - seamX).toFixed(0)} mm off the seam the surface stands ${z.toFixed(1)} mm and the blank ${roofZ.toFixed(1)} mm.`,
  }, bit, g.stage, fine, grid);
}

// said by the files that start in the land the arching leaves: run on a blank still carrying its
// wedge, the bit would bury itself to the roof on the first pass
export const SURFACED_PLATE = 'EXPECTS A SURFACED PLATE: run the arching files first.';

// what the plate's stages share: the blank, its zero, the plate centred in it by the one carved
// area, and the checks on the blank and the bit
function plateToolpaths(p: ViolinFamilyParams, surface: PlateSurface, g: PlateSettings, stage: string, bit: Bit): Toolpaths {
  let thickness = p.arching![g.plate].thickness;
  let out = emptyToolpaths(g.stock.thickness, thickness, [
    `Z0 = BED, the blank's joint face; blank top at the seam Z${g.stock.thickness.toFixed(3)}`,
    `XY0 = HARNESS ZERO, fences at X${g.fence.x} Y${g.fence.y}, blank ${g.stock.width} x ${g.stock.length} in their corner, seam ${g.seam} from its left edge`,
    `Blank ${g.stock.thickness} mm at the seam, ${g.stock.edge} mm at the edges, ${g.wood} wood`,
    `${g.plate === 'top' ? 'Top' : 'Back'} plate, ${stage}; edge thickness Z${thickness.toFixed(3)}`,
  ]);
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  if (!(g.stock.edge > 0 && g.stock.edge <= g.stock.thickness)) fail(out, 'The blank\'s edge has to be between 0 and its seam thickness.');
  if (!(g.seam > 0 && g.seam < g.stock.width)) fail(out, 'The seam has to lie within the blank\'s width.');
  // the plate's centre line on the seam, the plate centred along the blank
  let area = carvedArea(surface);
  placeInSheet(out, area, g, { x: g.seam, y: g.stock.length / 2 - (area.minY + area.maxY) / 2 }, g.fence);
  return out;
}

// the outline's bounds a skirt out, the same for every stage so the plate sits in the blank the
// same way in each file
function carvedArea(surface: PlateSurface): Bounds {
  return boundsOf(surface.outline, SURFACE.skirt);
}

// the blank's roof, from the seam out to each long edge: the two halves need not be the same width
function blankRoof(g: PlateSettings, tp: Toolpaths): { seamX: number; roof: (x: number) => number } {
  let seamX = tp.stockOrigin.x + g.seam - tp.sheetOffset.x;
  let fall = g.stock.thickness - g.stock.edge;
  return { seamX, roof: x => g.stock.thickness - (fall * Math.abs(x - seamX)) / (x < seamX ? g.seam : g.stock.width - g.seam) };
}

// a line inside the plate's outline: the outline itself brought in while its corner cutoffs and
// the button allow (a few millimetres), past that the outline eroded, which cannot fold. Null once
// nothing is left. The erosion is slow enough to keep, since the preview asks again on every edit
// of a shop setting while the outline stands still
const insideCache = new Map<string, string | null>();

function insideOutline(outline: string, distance: number): string | null {
  let key = `${distance}|${outline}`;
  let hit = insideCache.get(key);
  if (hit !== undefined) return hit;
  let d = offsetPath(outline, -distance);
  if (!d) {
    let ring = erodePolygon(flattenPath(outline, 0.5)[0] ?? [], distance);
    d = ring && pathFromPolyline(ring, true);
  }
  if (insideCache.size > 24) insideCache.delete(insideCache.keys().next().value!);
  insideCache.set(key, d);
  return d;
}

// the cradle: a pocket of the plate's outline in the slab, a hair clear of it and `wall` deep, its
// floor a lip the plate's land rests on either way up, and inside the lip a hole through the slab
// for the crown to hang in face down. The pocket is loops of the outline brought in, clockwise, from
// the wall to the lip's inner edge, a half bit apart, the wall last so its side is a light cut; the
// hole is the lip's inner edge brought in a radius, cut through with tabs as a mould window is. The
// wall follows the outline itself, button and cutoffs included, so the plate registers. The lip
// is wider than the land, which is sound face down only while the fluting channel sits above it:
// the plan reads the arching over the lip and refuses a lip the arch would reach. The slab needs
// no harness: it is clamped to the table and zeroed at its own corner with the probe, the plate
// centred in it
export function cradleToolpaths(p: ViolinFamilyParams, surface: PlateSurface, o: OuterContourSolve, bit: Bit, g: CradleSettings, cradle: CradleSpec = CRADLE, machine = MACHINE): Toolpaths {
  let top = g.stock.thickness;
  let land = top - cradle.wall;
  let archHeight = p.arching![g.plate].arch.height;
  let out = emptyToolpaths(top, land, [
    `Z0 = BED, slab top Z${top.toFixed(3)}`,
    `XY0 = SLAB LOWER LEFT, slab ${g.stock.width} x ${g.stock.length}`,
    `Slab ${top} mm, ${g.wood} wood`,
    `${g.plate === 'top' ? 'Top' : 'Back'} plate cradle, ${g.stage}; lip Z${land.toFixed(3)}, ${cradle.lip} wide, pocket ${cradle.clearance} clear of the outline`,
  ]);
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  if (bit.shape !== 'flat') fail(out, 'The cradle takes a flat bit.');
  if (land < archHeight + cradle.crownClearance) fail(out, `The slab is too thin: face down the crown hangs ${archHeight.toFixed(1)} mm below the lip, and the slab leaves ${(land - archHeight).toFixed(1)} mm under it.`);
  let outline = o[g.plate];
  if (!outline) return fail(out, 'The outline has to solve first.');
  // the arch over the lip: nothing may stand above the land plane there
  for (let f of [1, 0.75, 0.5]) {
    let edge = insideOutline(outline, cradle.lip * f);
    if (!edge) return fail(out, 'The lip is too wide: its inner edge does not close.');
    let proud = samplePathToPolyline(edge, 2).map(pt => surfaceZAt(surface, pt.x, pt.y) ?? 0).reduce((a, b) => Math.max(a, b), 0);
    if (proud > 0.01) fail(out, `The lip reaches under the arch: ${(cradle.lip * f).toFixed(1)} mm in, the surface stands ${proud.toFixed(2)} mm above the land.`);
  }
  centreInSheet(out, boundsOf(surface.outline, cradle.clearance), g);
  if (out.failures.length) return out;
  let r = bit.diameter / 2;
  if (g.stage === 'pocket') {
    // from the lip's inner edge out to the wall, the last loop's outer edge the clearance off the outline
    let inner = -cradle.lip + r, outer = cradle.clearance - r;
    let n = outer > inner ? Math.ceil((outer - inner) / (SURFACE.roughStepover * bit.diameter)) + 1 : 1;
    for (let i = 0; i < n; i++) {
      let at = n > 1 ? inner + ((outer - inner) * i) / (n - 1) : outer;
      let d = insideOutline(outline, -at);
      if (!d) return fail(out, 'The pocket would not offset for the bit.');
      out.paths.push({ name: `Pocket ${i + 1}`, loop: climbingLoop(d, 'inside'), tabs: [] });
    }
    out.notes.push(`Pocket in ${n} loops from the lip's edge out to the wall, down to the lip`);
    return out;
  }
  let d = insideOutline(outline, cradle.lip - r);
  if (!d) return fail(out, 'The lip\'s edge would not offset for the bit.');
  out.paths.push(withTabs('Hole', climbingLoop(d, 'inside'), evenStations(cradle.tabs, 0.5), machine.tabWidth, out.failures));
  out.floorZ = -machine.overcut;
  out.tabTop = machine.tabHeight;
  out.notes.push(`Hole through along the lip's edge, through the bed by ${machine.overcut}; ${cradle.tabs} tabs ${machine.tabHeight} high`);
  return out;
}

// the arching's surfacing: a surface to carve, over a stock whose roof is known across x, in
// lines along the length. The height field is sampled on a grid a bit's radius past
// the area; the stock has to hold the surface everywhere (the planner's `proud` says where it
// does not); the floor is the surface's own lowest point. Roughing goes in terraces from the top,
// a step down apart to `roughFloor`, each line riding at the terrace or over whatever stands above
// it plus the leave, lines the roof never reaches skipped; finishing is one pass with the ball
interface SurfaceJob {
  area: Bounds;
  roof: (x: number) => number;
  top: number;
  roughFloor: number;
  // one row's heights at a time: the field's row solve is kept while y holds
  rowZ: (y: number) => (x: number) => number;
  proud: (x: number, z: number, roof: number) => string;
}

function surfacing(out: Toolpaths, job: SurfaceJob, bit: Bit, stage: Stage, fine: boolean, grid: number): Toolpaths {
  let r = bit.diameter / 2;
  let { area, roof } = job;
  let t = terrainGrid(area, r + grid, grid, job.rowZ);
  let proud = { by: 0.01, x: 0, z: 0 };
  let floorZ = Infinity;
  for (let j = 0; j < t.ny; j++) for (let i = 0; i < t.nx; i++) {
    let x = t.x0 + i * grid;
    if (x < area.minX || x > area.maxX) continue;
    let z = t.z[j * t.nx + i], by = z - roof(x);
    if (by > proud.by) proud = { by, x, z };
    if (z < floorZ) floorZ = z;
  }
  out.floorZ = floorZ;
  if (proud.by > 0.01) fail(out, job.proud(proud.x, proud.z, roof(proud.x)));

  // the raster: lines evenly across the area, both edges included, sampled at the grid's rows
  let stepover = stage === 'rough' ? SURFACE.roughStepover * bit.diameter : 2 * Math.sqrt(2 * r * SURFACE.scallop - SURFACE.scallop ** 2);
  let n = Math.max(1, Math.ceil((area.maxX - area.minX) / stepover));
  let lineXs = Array.from({ length: n + 1 }, (_, i) => area.minX + ((area.maxX - area.minX) * i) / n);
  let j0 = Math.max(0, Math.floor((area.minY - t.y0) / grid)), j1 = Math.min(t.ny - 1, Math.ceil((area.maxY - t.y0) / grid));
  let yMin = t.y0 + j0 * grid, yMax = t.y0 + j1 * grid;
  let levels: number[] = [];
  if (stage === 'rough' && bit.feeds && bit.feeds.stepDown > 0) {
    for (let z = job.top - bit.feeds.stepDown; ; z -= bit.feeds.stepDown) {
      levels.push(Math.max(job.roughFloor, z));
      if (z <= job.roughFloor) break;
    }
  }
  let linesAt = (level: number) => lineXs.filter(x => roof(x) > level);
  out.metres = (stage === 'rough' ? levels.reduce((sum, level) => sum + linesAt(level).length, 0) : lineXs.length) * (yMax - yMin) / 1000;
  out.passes = levels.length || 1;
  out.raster = { xs: lineXs, yMin, yMax, levels };
  out.notes.push(`${lineXs.length} lines along the length ${stepover.toFixed(2)} apart, ${SURFACE.skirt} past the outline; ${stage === 'rough' ? `${levels.length} terraces leaving ${SURFACE.leave}` : `one pass, a ${SURFACE.scallop} scallop`}`);
  if (!fine || out.failures.length) return out;
  if (stage === 'rough' && !bit.feeds) return fail(out, 'No feeds for this bit.');

  let tip = (x: number) => tipHeights(t, r, x, bit.shape === 'ball');
  if (stage === 'rough') {
    for (let level of levels) {
      let pts = serpentine(linesAt(level), j0, j1, t, x => {
        let z = tip(x);
        return j => Math.max(level, z[j] + SURFACE.leave);
      });
      if (pts.some(pt => pt.z <= level + 1e-9)) out.surfaces.push({ name: `Rough Z${level.toFixed(3)}`, pts });
    }
  } else {
    out.surfaces.push({ name: 'Finish', pts: serpentine(lineXs, j0, j1, t, x => {
      let z = tip(x);
      return j => z[j];
    }) });
  }
  return out;
}

// the purfling channel: the strip's width between the Outer Contour panel's two purfling lines,
// cut in the plate's blank once the finishing pass has been, its floor one flat depth under the
// plate's edge (the channel is gouged flush afterwards, so its depth is held against the edge,
// not the carved surface). A bit the channel's width takes it in one pass down the middle; a
// narrower one in passes set evenly between the channel's edges a bit radius in. Each pass is one
// closed loop, counterclockwise, gone round once per step down: the next round starts where the
// last closed, a dive in place. Nothing of the loop is offset for the bit, since the bit sits
// inside the channel; the corners come to the bee sting's point as drawn. The surface is only
// read for the plate's place in the blank, the same as the arching's
export function purflingToolpaths(p: ViolinFamilyParams, surface: PlateSurface, bit: Bit, g: PlateSettings, fine = false): Toolpaths {
  let out = plateToolpaths(p, surface, g, 'purfling channel', bit);
  let o = p.outerContour!;
  let width = o.purflingChannelDepth;
  if (bit.shape !== 'flat') fail(out, 'The purfling channel takes a flat bit.');
  if (bit.diameter > width + 0.05) fail(out, `The bit is wider than the channel: ${width} mm.`);
  if (!(g.purflingDepth > 0)) fail(out, 'The strip height has to be above 0.');
  if (!bit.feeds) fail(out, 'No feeds for this bit.');
  if (out.failures.length) return out;
  let rib = ribArcs(p, solveMainBouts(p)!, solveCorners(p)!, solveCenterBout(p)!);
  if (!rib) return fail(out, 'The rib outline has to solve first.');
  let thickness = p.arching![g.plate].thickness;
  let inset = p.body.overhang + p.body.rib;
  let r = bit.diameter / 2;
  // across the channel: from the inner edge a radius in to the outer edge a radius in
  let span = Math.max(0, width - bit.diameter);
  let across = span < 0.05 ? 1 : Math.ceil(span / (0.6 * bit.diameter)) + 1;
  let offsets = Array.from({ length: across }, (_, i) => r + (across > 1 ? (span * i) / (across - 1) : span / 2));
  let rounds = roundsTo(g.purflingDepth, bit.feeds!.stepDown);
  out.passes = rounds.length;
  out.floorZ = thickness - g.purflingDepth;
  out.caution = SURFACED_PLATE;
  out.notes.push(`Channel ${width} wide in ${across} pass${across === 1 ? '' : 'es'} across, ${rounds.length} round${rounds.length === 1 ? '' : 's'} down to ${g.purflingDepth} under the edge`);
  for (let [i, off] of offsets.entries()) {
    let d = purflingPath(p, rib, inset - o.purflingOffset + off);
    if (!d) return fail(out, 'The purfling line would not offset for this pass: the corners no longer meet.');
    let ring = samplePathToPolyline(d, fine ? 0.25 : 1);
    if (signedPolygonArea(ring) < 0) ring.reverse();
    let loop = [...ring, ring[0]];
    let pts: Pt3D[] = [];
    for (let depth of rounds) for (let pt of loop) pts.push(new Pt3D(pt.x, pt.y, thickness - depth));
    out.surfaces.push({ name: `Purfling pass ${i + 1}`, pts: fine ? simplifyPolyline3D(pts, SURFACE.chordTolerance) : pts });
  }
  return out;
}

// the top's f-holes, cut with the graduated plate face up in its cradle, resting on the lip: the
// eyes through the plate with a small flat bit, then the whole outline scribed with a V bit for
// the knife. The router never cuts the hole's edge: the passage round a wing's tip is narrower
// than any bit and the edge is the most seen line on the plate, so the eyes stop `allowance`
// short of the drawn circle and the scribe, whose point is as fine as its depth, marks the line
// itself, wing tips and nicks as drawn. Both follow the surface, Z along a loop being the
// outside at that point less the depth, so a small bit is never buried past its flutes at the
// high end of a hole that falls across the arch. The eyes are cleared in loops from the centre
// out, clockwise, a level at a time, to the typed thickness plus a margin, the inside being the
// maker's; below the eye is the cradle's hole, so overshoot is free, and an eye over the lip is
// refused. The height field is the arching's over the lip; the safe height clears the crown, not
// the slab. The plate sits where the cradle put it: centred by the outline the cradle was cut to
export const GRADUATED_PLATE = 'EXPECTS THE GRADUATED TOP, FACE UP IN ITS CRADLE.';

export function fholeToolpaths(p: ViolinFamilyParams, s: FholeContoursSolve, surface: PlateSurface, seat: PlateSurface, o: OuterContourSolve, bit: Bit, g: CradleSettings, fh: FholeSettings, fine = false, cradle: CradleSpec = CRADLE): Toolpaths {
  let top = g.stock.thickness, lipZ = top - cradle.wall;
  let edge = p.arching!.top.thickness;
  let crown = lipZ + edge + p.arching!.top.arch.height;
  let out = emptyToolpaths(crown, lipZ, [
    `Z0 = BED, slab top Z${top.toFixed(3)}; the top face up on the lip Z${lipZ.toFixed(3)}, its edge Z${(lipZ + edge).toFixed(3)}, its crown Z${crown.toFixed(3)}`,
    `XY0 = SLAB LOWER LEFT, slab ${g.stock.width} x ${g.stock.length}, cut to the ${g.plate}`,
    `Top plate f-holes, ${fh.stage}; plate ${fh.thickness} mm at the f-holes`,
  ]);
  out.caution = GRADUATED_PLATE;
  if (!(bit.diameter > 0)) fail(out, 'The bit diameter has to be above 0.');
  centreInSheet(out, boundsOf(seat.outline, cradle.clearance), g);
  let zAt = (pt: Pt) => lipZ + edge + (surfaceZAt(surface, pt.x, pt.y) ?? 0);
  let step = fine ? 0.1 : 0.5;
  let f = p.fHoles!;
  let eyes: [string, Circle][] = [['Upper eye', f.UEye], ['Lower eye', f.LEye]];
  let add = (name: string, pts: Pt3D[]) => {
    out.surfaces.push({ name, pts: simplifyPolyline3D(pts, SURFACE.chordTolerance) });
    out.floorZ = pts.reduce((z, pt) => Math.min(z, pt.z), out.floorZ);
  };
  if (fh.stage === 'eyes') {
    let r = bit.diameter / 2;
    if (bit.shape !== 'flat') fail(out, 'The eyes take a flat bit.');
    if (!bit.feeds) fail(out, 'No feeds for this bit.');
    if (!(fh.thickness > 0)) fail(out, 'The plate\'s thickness at the f-holes has to be above 0.');
    for (let [name, eye] of eyes) {
      if (eye.r - FHOLE.allowance - r < 0.05) fail(out, `The bit is too wide for the ${name.toLowerCase()}: ${(2 * (eye.r - FHOLE.allowance)).toFixed(1)} mm inside the knife allowance.`);
    }
    let outline = o[g.plate];
    let holeD = outline && insideOutline(outline, cradle.lip);
    if (!holeD) fail(out, 'The cradle\'s hole has to solve first.');
    else {
      let hole = samplePathToPolyline(holeD, 1), idx = buildPolylineIndex(hole);
      for (let [name, eye] of eyes) {
        if (!pointInPolygon(eye, hole) || distPointToPolylineIndexed(eye, idx) < eye.r) fail(out, `The ${name.toLowerCase()} is over the cradle's lip, not its hole.`);
      }
    }
    if (out.failures.length) return out;
    let rounds = roundsTo(fh.thickness + FHOLE.exitMargin, bit.feeds!.stepDown);
    out.passes = rounds.length;
    out.floorZ = Infinity;
    out.notes.push(`Eyes cleared ${FHOLE.allowance} inside the drawn circle, ${rounds.length} round${rounds.length === 1 ? '' : 's'} down to ${fh.thickness + FHOLE.exitMargin} under the surface, into the cradle's hole`);
    for (let [side, place] of [['treble', (pt: Pt) => pt], ['bass', flipPointAboutY]] as const) {
      for (let [name, eye] of eyes) {
        let c = place(eye);
        let reach = eye.r - FHOLE.allowance - r;
        let n = Math.max(1, Math.ceil(reach / (SURFACE.roughStepover * bit.diameter)));
        let pts: Pt3D[] = [];
        for (let depth of rounds) for (let i = 1; i <= n; i++) {
          let rho = (reach * i) / n;
          let m = Math.max(16, Math.ceil((TURN.full * rho) / step));
          for (let j = 0; j <= m; j++) {
            let a = -(TURN.full * j) / m;
            let pt = { x: c.x + rho * Math.cos(a), y: c.y + rho * Math.sin(a) };
            pts.push(new Pt3D(pt.x, pt.y, zAt(pt) - depth));
          }
        }
        add(`${name}, ${side}`, pts);
      }
    }
    return out;
  }
  if (bit.shape !== 'v') fail(out, 'The scribe takes a V bit.');
  if (!(fh.scribeDepth > 0)) fail(out, 'The scribe depth has to be above 0.');
  if (out.failures.length) return out;
  out.passes = 1;
  out.floorZ = Infinity;
  for (let [side, flip] of [['treble', false], ['bass', true]] as const) {
    let d = fholePath(p, s, flip);
    let ring = d ? flattenPath(d, step)[0] ?? [] : [];
    if (ring.length > 1 && dist(ring[0], ring[ring.length - 1]) < 1e-6) ring.pop();
    if (ring.length < 3) return fail(out, 'The f-hole outline has to solve whole first.');
    if (signedPolygonArea(ring) < 0) ring.reverse();
    add(`Scribe ${side}`, [...ring, ring[0]].map(pt => new Pt3D(pt.x, pt.y, zAt(pt) - fh.scribeDepth)));
  }
  let groove = bit.angle ? 2 * fh.scribeDepth * Math.tan((bit.angle / 2) * TURN.degree) : 0;
  out.notes.push(`Scribe ${fh.scribeDepth} under the surface, the groove ${groove.toFixed(2)} wide`);
  return out;
}

// the depths of the rounds down to `depth`, a step apart, the last at the depth itself
function roundsTo(depth: number, stepDown: number): number[] {
  let rounds: number[] = [];
  for (let z = stepDown; ; z += stepDown) {
    rounds.push(Math.min(z, depth));
    if (z >= depth) break;
  }
  return rounds;
}

// the plate's contour: the outline grown by the bit's radius, the button with it on the back,
// walked counterclockwise for a climb cut, in passes from the land the arching left (the skirt
// round the outline is at the edge's height) down through the bed's overcut, held by tabs at the
// widest of each bout and the waist of each C. Cut last: once it is through, only the tabs hold
// the plate. The blank's seam still stands above the land, so the safe height is kept off it
export function contourToolpaths(p: ViolinFamilyParams, surface: PlateSurface, o: OuterContourSolve, bit: Bit, g: PlateSettings, tabs = PLATE_TABS, machine = MACHINE): Toolpaths {
  let out = plateToolpaths(p, surface, g, 'contour', bit);
  if (bit.shape !== 'flat') fail(out, 'The contour takes a flat bit.');
  if (out.failures.length) return out;
  let outline = o[g.plate];
  if (!outline) return fail(out, 'The outline has to solve first.');
  let thickness = p.arching![g.plate].thickness;
  let d = offsetPath(outline, bit.diameter / 2);
  if (!d) return fail(out, 'The outline would not offset for the bit.');
  let loop = climbingLoop(d, 'outside');
  let stations = boutStations(p, loop);
  out.paths.push(withTabs('Outline', loop, stations, tabs.width, out.failures));
  out.cutTopZ = thickness;
  out.floorZ = -machine.overcut;
  out.tabTop = tabs.height;
  out.caution = SURFACED_PLATE;
  out.notes.push(`Contour a bit radius outside the outline, counterclockwise, from the land Z${thickness.toFixed(3)} through the bed by ${machine.overcut}; ${stations.length} tabs ${tabs.width} long and ${tabs.height} high at the bouts and the waists. Cut last: once through, only the tabs hold the plate`);
  return out;
}

// where the plate is held: the widest point of each upper and lower bout and the waist of each C,
// each as a fraction of the way round the loop from its top centre crossing. The corners are
// kept clear by a margin either side of their height
function boutStations(p: ViolinFamilyParams, loop: Pt[]): number[] {
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let { UCr, LCr } = p.corners!;
  let margin = 10;
  let pick = (keep: (pt: Pt) => boolean, score: (pt: Pt) => number): number | null => {
    let best = -1;
    loop.forEach((pt, i) => {
      if (keep(pt) && (best < 0 || score(pt) > score(loop[best]))) best = i;
    });
    return best < 0 ? null : cum[best] / total;
  };
  let upper = (pt: Pt) => pt.y > UCr.y + margin;
  let lower = (pt: Pt) => pt.y < LCr.y - margin;
  let waist = (pt: Pt) => pt.y > LCr.y + margin && pt.y < UCr.y - margin;
  return [
    pick(upper, pt => -pt.x), pick(upper, pt => pt.x),
    pick(waist, pt => (pt.x < 0 ? pt.x : -Infinity)), pick(waist, pt => (pt.x > 0 ? -pt.x : -Infinity)),
    pick(lower, pt => -pt.x), pick(lower, pt => pt.x),
  ].filter((f): f is number => f !== null);
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// the points' box, `pad` out on every side
function boundsOf(pts: Pt[], pad: number): Bounds {
  let xs = pts.map(pt => pt.x), ys = pts.map(pt => pt.y);
  return { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minY: Math.min(...ys) - pad, maxY: Math.max(...ys) + pad };
}

// a height field over the bed on a grid, a row at a time
interface Terrain {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  step: number;
  z: Float64Array;
}

function terrainGrid(area: Bounds, pad: number, step: number, rowZ: (y: number) => (x: number) => number): Terrain {
  let x0 = area.minX - pad, y0 = area.minY - pad;
  let nx = Math.ceil((area.maxX + pad - x0) / step) + 1, ny = Math.ceil((area.maxY + pad - y0) / step) + 1;
  let z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    let zAt = rowZ(y0 + j * step);
    for (let i = 0; i < nx; i++) z[j * nx + i] = zAt(x0 + i * step);
  }
  return { x0, y0, nx, ny, step, z };
}

// the tip's height down one line at x, at every row of the grid: the highest the bit's footprint
// finds, a flat bit's being the terrain under its whole face, a ball's the terrain lifted by how
// far the ball curves away from its tip there, and never under the terrain read between the
// columns at the tip itself. The footprint's cells are set out once per line, from the column
// nearest it
function tipHeights(t: Terrain, r: number, x: number, ball: boolean): Float64Array {
  let ci = Math.round((x - t.x0) / t.step);
  let fx = x - (t.x0 + ci * t.step);
  let i0 = Math.min(Math.max(Math.floor((x - t.x0) / t.step), 0), t.nx - 2), f = (x - (t.x0 + i0 * t.step)) / t.step;
  let m = Math.ceil(r / t.step) + 1;
  let cells: { di: number; dj: number; lift: number }[] = [];
  for (let dj = -m; dj <= m; dj++) for (let di = -m; di <= m; di++) {
    let dx = di * t.step - fx, dy = dj * t.step;
    let d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    cells.push({ di, dj, lift: ball ? Math.sqrt(r * r - d2) - r : 0 });
  }
  let out = new Float64Array(t.ny).fill(-Infinity);
  for (let j = 0; j < t.ny; j++) {
    let best = t.z[j * t.nx + i0] * (1 - f) + t.z[j * t.nx + i0 + 1] * f;
    for (let { di, dj, lift } of cells) {
      let i = ci + di, jj = j + dj;
      if (i < 0 || i >= t.nx || jj < 0 || jj >= t.ny) continue;
      let z = t.z[jj * t.nx + i] + lift;
      if (z > best) best = z;
    }
    out[j] = best;
  }
  return out;
}

// the lines joined end to end, the first up the length and the next back down it, each line
// thinned to what the file needs; the joins between lines are kept, so the run never lifts
function serpentine(lineXs: number[], j0: number, j1: number, t: Terrain, zAt: (x: number) => (j: number) => number): Pt3D[] {
  let out: Pt3D[] = [];
  lineXs.forEach((x, l) => {
    let z = zAt(x);
    let line: Pt3D[] = [];
    let up = l % 2 === 0;
    for (let k = j0; k <= j1; k++) {
      let j = up ? k : j1 - (k - j0);
      line.push(new Pt3D(x, t.y0 + j * t.step, z(j)));
    }
    out.push(...simplifyPolyline3D(line, SURFACE.chordTolerance));
  });
  return out;
}

// what any export's planner builds: closed loops for the cutter's centre, the climbing way round
// (counterclockwise outside, clockwise inside, for a router turning clockwise), each with the tabs
// the sheet holds it by; or runs for the cutter's tip over a surface; and where the part sits in
// the sheet and what Z the file works between
export interface Tab {
  // along the loop, from its first point
  from: number;
  to: number;
  pts: Pt[];
  centre: Pt;
}

export interface Toolpath {
  name: string;
  // closed: its first point repeated last
  loop: Pt[];
  tabs: Tab[];
}

export interface SurfacePath {
  name: string;
  // the tip's run, Z over the bed
  pts: Pt3D[];
}

export interface Raster {
  // the x of every line, and the y they run between
  xs: number[];
  yMin: number;
  yMax: number;
  // the roughing's terraces, top first; none for finishing
  levels: number[];
}

export interface Toolpaths {
  paths: Toolpath[];
  surfaces: SurfacePath[];
  // world to the file: where the part lies from XY0
  sheetOffset: Pt;
  // the stock's lower-left corner from XY0: the origin for a sheet zeroed at its own corner, the
  // fences' corner for a blank or slab pushed into them
  stockOrigin: Pt;
  stockTopZ: number;
  // where a profile job's passes start, when not the stock top; and how high its tabs stand
  cutTopZ?: number;
  tabTop?: number;
  // the file's own Z below which nothing moves
  floorZ: number;
  // header comments naming the zero and the stock, and what the file assumes has been cut
  // already, said again at the machine's pause
  notes: string[];
  caution?: string;
  // a surfacing job's lines, known before any height is, and its cutting length in metres
  // estimated from them, for the preview that has no runs yet
  raster?: Raster;
  metres?: number;
  // how many times the file goes down, where the planner counted
  passes?: number;
  failures: string[];
}

const SHEET_MARGIN = 5;

const ORIGIN: Pt = { x: 0, y: 0 };

function emptyToolpaths(stockTopZ: number, floorZ: number, notes: string[]): Toolpaths {
  return { paths: [], surfaces: [], sheetOffset: ORIGIN, stockOrigin: ORIGIN, stockTopZ, floorZ, notes, failures: [] };
}

function fail(out: Toolpaths, message: string): Toolpaths {
  out.failures.push(message);
  return out;
}

// the part centred in the stock by the extent of what it cuts, with a failure if it will not fit
function centreInSheet(out: Toolpaths, b: Bounds, g: StockSettings, origin: Pt = ORIGIN): void {
  out.stockOrigin = origin;
  out.sheetOffset = { x: origin.x + g.stock.width / 2 - (b.minX + b.maxX) / 2, y: origin.y + g.stock.length / 2 - (b.minY + b.maxY) / 2 };
  let needW = b.maxX - b.minX + 2 * SHEET_MARGIN;
  let needL = b.maxY - b.minY + 2 * SHEET_MARGIN;
  if (needW > g.stock.width || needL > g.stock.length) fail(out, `The sheet is too small: this part needs ${Math.ceil(needW)} × ${Math.ceil(needL)} mm.`);
}

// the part where the user put it in the stock (`offset` from the stock's corner), the stock where
// it sits from XY0, with a failure naming each side what it cuts runs off, the margin included
function placeInSheet(out: Toolpaths, b: Bounds, g: StockSettings, offset: Pt, origin: Pt): void {
  out.stockOrigin = origin;
  out.sheetOffset = { x: origin.x + offset.x, y: origin.y + offset.y };
  let short = [
    ['left', SHEET_MARGIN - (b.minX + offset.x)],
    ['right', b.maxX + offset.x - (g.stock.width - SHEET_MARGIN)],
    ['bottom', SHEET_MARGIN - (b.minY + offset.y)],
    ['top', b.maxY + offset.y - (g.stock.length - SHEET_MARGIN)],
  ].filter(([, by]) => (by as number) > 0);
  if (short.length) fail(out, `The carved area runs off the blank: ${short.map(([side, by]) => `${Math.ceil(by as number)} mm at the ${side}`).join(', ')}.`);
}

// a loop sampled from a path the climbing way round, closed and restarted at its top centre-line
// crossing; `detail` edits the sampled ring before any of that
function climbingLoop(d: string, side: 'inside' | 'outside', detail = (ring: Pt[]) => ring): Pt[] {
  let ring = detail(samplePathToPolyline(d, 1));
  if ((signedPolygonArea(ring) > 0) !== (side === 'outside')) ring.reverse();
  return fromTopCentre(ring);
}

// `count` stations evenly round the loop, the first `phase` stations in from its top centre
function evenStations(count: number, phase: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + phase) / count);
}

// the loop as a toolpath with a tab `width` long centred on each station, a fraction of the way
// round from the loop's top centre; the loop is restarted midway between the last station and
// the first, so no tab wraps its ends
function withTabs(name: string, loop: Pt[], stations: number[], width: number, failures: string[]): Toolpath {
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let tabs: Tab[] = [];
  let count = stations.length;
  if (count > 0 && total / count <= width) failures.push(`${name} is too short for ${count} tabs.`);
  else if (count > 0) {
    let f = [...stations].sort((a, b) => a - b);
    let start = ((((f[0] + f[count - 1] - 1) / 2) % 1) * total + total) % total;
    if (start > 1e-9) {
      loop = [...polylineSlice(loop, cum, start, total), ...polylineSlice(loop, cum, 0, start).slice(1)];
      cum = polylineCumulativeLengths(loop);
    }
    for (let fr of f) {
      let station = ((fr * total - start) % total + total) % total;
      let from = station - width / 2, to = station + width / 2;
      tabs.push({ from, to, pts: polylineSlice(loop, cum, from, to), centre: pointAtPolylineLength(loop, cum, station) });
    }
  }
  return { name, loop, tabs };
}

// the ring closed and restarted at its highest crossing of x = 0, the crossing itself a vertex
function fromTopCentre(ring: Pt[]): Pt[] {
  let n = ring.length;
  let best = -1;
  let top: Pt | null = null;
  for (let i = 0; i < n; i++) {
    let a = ring[i], b = ring[(i + 1) % n];
    if (a.x === b.x || a.x * b.x > 0) continue;
    let t = a.x / (a.x - b.x);
    let y = a.y + (b.y - a.y) * t;
    if (!top || y > top.y) {
      top = { x: 0, y };
      best = i;
    }
  }
  if (!top) return [...ring, ring[0]];
  return [top, ...ring.slice(best + 1), ...ring.slice(0, best + 1), top];
}

// the job for the writer: a profile job stepping down from the stock top to the floor, a surfacing
// job's runs as planned, either with the sheet offset applied so XY zero is the stock's lower left
export function gcodeJob(tp: Toolpaths, tool: Tool, feeds: Feeds, machine = MACHINE): GcodeJob {
  let plan = cutPlan(tp, feeds);
  let passes = tp.paths.length ? Array.from({ length: plan.passes }, (_, i) => Math.max(plan.floorZ, plan.topZ - (i + 1) * feeds.stepDown)) : [];
  let { x: dx, y: dy } = tp.sheetOffset;
  return {
    notes: jobNotes(tp, feeds, machine),
    caution: tp.caution,
    tool: { number: tool.number, name: tool.name },
    spindleRpm: machine.spindleRpm,
    safeZ: tp.stockTopZ + machine.safeZ,
    floorZ: plan.floorZ,
    passes,
    tabTop: tp.tabTop ?? machine.tabHeight,
    cutFeed: feeds.cutFeed,
    plungeFeed: feeds.plungeFeed,
    cuts: [
      ...tp.paths.map(path => ({
        name: path.name,
        loop: path.loop.map(p => ({ x: p.x + dx, y: p.y + dy })),
        tabs: path.tabs.map(t => ({ from: t.from, to: t.to })),
      })),
      ...tp.surfaces.map(s => ({ name: s.name, pts: s.pts.map(p => new Pt3D(p.x + dx, p.y + dy, p.z)) })),
    ],
  };
}
