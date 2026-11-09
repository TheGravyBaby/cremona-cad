import { Pt } from '../../../../models/types';
import { Plate } from '../../violin-family-solves';

// the shop's side of Dev Export: what the user says of the stock, the machine's fixed numbers, the
// bits and their feeds, and the ⓘ's text, which is kept here, not in docs/, since the shop is not
// the instrument. The settings live in this browser's localStorage, never on the recipe

export type ExportId = 'mould' | 'plate' | 'purfling' | 'contour' | 'cradle' | 'fholes' | 'scroll';

export interface ExportKind {
  id: ExportId;
  label: string;
}

export const EXPORTS: readonly ExportKind[] = [
  { id: 'mould', label: 'Mould' }, { id: 'plate', label: 'Plate' }, { id: 'purfling', label: 'Purfling' }, { id: 'contour', label: 'Contour' }, { id: 'cradle', label: 'Cradle' }, { id: 'fholes', label: 'F-holes' }, { id: 'scroll', label: 'Scroll' },
];

// whose stock an export cuts: the purfling and the contour are cut in the plate's blank, in the
// plate's setup; the cradle in a slab of its own, and the f-holes in the plate held in that slab;
// the scroll in the neck blank
export type StockId = 'mould' | 'plate' | 'cradle' | 'scroll';
export const STOCK_OF: Record<ExportId, StockId> = { mould: 'mould', plate: 'plate', purfling: 'plate', contour: 'plate', cradle: 'cradle', fholes: 'cradle', scroll: 'scroll' };

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

// the neck blank's side profile, roughed from a maple billet lying cheek down: the billet's planed
// face, the fingerboard plane, against the stem of a T fence and its heel end on the crossbar,
// the head out to the stem's left. Rolled over onto the stem's right for the second file, the two
// kerfs meeting in the middle, so no bit has to reach through the cheeks
export type ScrollSide = 'left' | 'right';

// `stock` is the billet: `thickness` across the cheeks (the file's Z), `width` back from the face,
// `length` along the neck. The harness board stands from XY0 at its lower-left corner; the T
// fence on it has its stem's left face at `fence.x`, `thickness` thick, running `reach` up from
// the crossbar's face at `fence.y`: along the neck only, since the head may stand proud of the
// face. `faceInset` is the fingerboard plane in from the billet's face: 0 puts the face on the
// stem and leaves it uncut; a chin past the plane needs that much, planed off the face after;
// a bit's width and more lets the file cut the face too. `endMargin` is the heel's lowest point
// up from the billet's end on the crossbar
export interface ScrollSettings extends StockSettings {
  harness: { width: number; length: number };
  fence: { x: number; y: number; thickness: number; reach: number };
  side: ScrollSide;
  faceInset: number;
  endMargin: number;
}

// the bit slots, one per thing cut with a bit of its own, each the number of a row in TOOLS. The
// cradle borrows the roughing bit; the mould's bit is the Mould panel's param
export type StageKey = Stage | 'purfling' | 'contour' | FholeStage | 'scroll';
export const STAGE_SHAPE: Record<StageKey, ToolShape> = { rough: 'flat', finish: 'ball', purfling: 'flat', contour: 'flat', eyes: 'flat', scribe: 'v', scroll: 'flat' };

// one stock per setup: a mould comes out of a ply sheet, a plate and its purfling and contour out
// of a blank, a cradle out of a slab, a scroll out of the neck blank
export interface DevExportSettings {
  job: ExportId;
  tools: Record<StageKey, number>;
  mould: StockSettings;
  plate: PlateSettings;
  cradle: CradleSettings;
  fholes: FholeSettings;
  scroll: ScrollSettings;
}

export const DEFAULT_SETTINGS: DevExportSettings = {
  job: 'mould',
  tools: { rough: 2, finish: 3, purfling: 7, contour: 1, eyes: 6, scribe: 9, scroll: 2 },
  mould: { stock: { thickness: 19, width: 300, length: 400 }, wood: 'soft' },
  plate: { stock: { thickness: 22, edge: 10, width: 230, length: 420 }, fence: { x: 25, y: 25 }, seam: 115, wood: 'soft', plate: 'top', stage: 'rough', purflingDepth: 2 },
  cradle: { stock: { thickness: 25, width: 230, length: 420 }, wood: 'soft', plate: 'back', stage: 'pocket' },
  fholes: { stage: 'eyes', thickness: 2.8, scribeDepth: 0.3 },
  scroll: {
    stock: { thickness: 46, width: 65, length: 280 }, wood: 'hard', harness: { width: 300, length: 400 }, fence: { x: 150, y: 25, thickness: 19, reach: 170 },
    side: 'left', faceInset: 0, endMargin: 10,
  },
};

// the slot the open job cuts with; none for the mould, whose bit is the recipe's
export function stageOf(s: DevExportSettings): StageKey | null {
  let job = s.job;
  return job === 'mould' ? null : job === 'plate' ? s.plate.stage : job === 'cradle' ? 'rough' : job === 'fholes' ? s.fholes.stage : job;
}

// what never changes between jobs, so it is never asked. Zero is where the BitZero sits, on the
// lower-left corner of whatever plywood lies on the table: a loose sheet or slab is zeroed on its
// own top, so its file's Z0 is the stock top; a harness is zeroed on its board, the bed the blank
// lies on, so its file's Z0 is the bed. The part is centred in a loose sheet. The router's dial
// sets its speed, but Carbide Motion still expects an M3 with an S word. mm and mm/min
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

// how the neck blank is cut: each side goes `overlap` past the middle so the kerfs meet; tabs
// stand `tabHeight` off each side's floor, leaving twice that less the overlaps in the middle;
// the throat is bridged where the pocket narrows to the bit plus `bridge` either side, left for
// the gouge; and the bit keeps `fenceClearance` off the fence. mm
export const SCROLL = { overlap: 0.5, tabHeight: 2.5, tabWidth: 12, bridge: 1.5, fenceClearance: 1 } as const;

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
export const PREVIEW_GRID = 4;

export const MACHINE_HELP = {
  title: 'Dev Export: the fixed plan',
  text:
    'Everything the panel does not ask you for is a constant, fixed so that no visit to the shop can drift it. The first mould was cut with exactly these numbers.\n\n' +
    'ZERO\n' +
    'XYZ0 is where the BitZero sits, on the lower-left corner of the plywood on the table. A mould sheet and a cradle slab are zeroed on their own top corner, so Z0 is the top of the stock and the cut goes down to minus its thickness. ' +
    'A harness is zeroed on its board\'s corner, so Z0 is the bed the blank lies on. The part is centred in a loose sheet, so there is no margin to set; the sheet only has to be the part, plus one bit width, plus 5 mm a side.\n\n' +
    'OVERCUT\n' +
    `${MACHINE.overcut} mm. The last pass goes this far below the stock typed. Zeroed on the top, the floor is the typed thickness down: measure the sheet, since ply is only nominal. A sheet thinner than typed cuts that much deeper into the spoilboard, and one thicker leaves a skin under the part.\n\n` +
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
    'Cut in the plate\'s blank after its finishing pass, so it reads the blank and plate typed under Plate. The channel is the strip\'s width between the two purfling lines the Plate Contour panel draws, its floor one flat depth under the plate\'s edge, the strip\'s height: the channel is gouged flush afterwards, so its depth is held against the edge rather than the carved surface. A bit the channel\'s width takes it in one pass; a narrower one in passes across it; a bit wider than the channel is refused. Each pass goes round once per step down, diving to the next round where it closes. The corners come to the bee sting\'s point in plan and are finished with the knife.\n\n' +
    'CONTOUR\n' +
    'Cut last in the plate\'s blank, after the purfling, since the waste round the plate is what holds it down. The bit runs a radius outside the plate\'s outline, the button included on the back, counterclockwise for a climb cut, in passes from the land the arching left down through the bed\'s overcut, lifting over the tabs on the passes below them. The safe height still clears the blank\'s seam, which stands well above the land.\n\n' +
    'CRADLE\n' +
    `A slab of MDF or ply, flat and square, the plate held in it for its inside either way up: a pocket of the plate\'s outline ${CRADLE.wall} mm deep and ${CRADLE.clearance} mm clear of it, so the outline registers against the pocket\'s side; a lip ${CRADLE.lip} mm wide left standing inside the pocket for the plate\'s land to rest on, wider than the land because face down the fluting channel sits above it, and the plan refuses a lip the arch would reach; and a hole through the slab inside the lip, so face down the crown hangs free, at least ${CRADLE.crownClearance} mm off the bed. ` +
    `Two files with the plate\'s roughing bit: the pocket, loops clearing the ring from the wall to the lip\'s inner edge, and the hole, cut through in passes and held by ${CRADLE.tabs} tabs until it drops. Cut to the back\'s outline the cradle takes the top too. The slab needs no harness: clamp it to the table and zero it on its lower-left corner with the probe, so Z0 is its top; the plate is centred in it. The dome is unsupported: pad under it for the graduation.\n\n` +
    'F-HOLES\n' +
    'Cut with the graduated top face up in its cradle, resting on the lip, so they read the slab typed under Cradle and the plate is where the cradle put it. The router never cuts the f-hole\'s edge: the passage round a wing\'s tip is narrower than any bit, and the edge is the most looked-at line on the plate. ' +
    `Two files. The eyes, cleared through the plate with a small flat bit in loops from the centre out, clockwise, stopping ${FHOLE.allowance} mm inside the drawn circle for the knife, down to the thickness you type plus ${FHOLE.exitMargin} mm, since the recipe has no map of the inside; below the eye is the cradle\'s hole, and an eye over its lip is refused. ` +
    'Then the outline, both holes as drawn with wing tips and nicks, scribed with a V bit a few tenths under the surface: its point is as fine as its depth, and the groove\'s centre is the drawn line whatever the depth, so the knife has a line to follow and the eyes drilled and sawn by hand are already done. ' +
    'Either way Z follows the surface along the loop, the outside at that point less the depth, so a small bit is never buried past its flutes at the high end of a hole that falls across the arch, and the safe height clears the crown, not the slab.\n\n' +
    'SCROLL\n' +
    'The neck blank\'s side profile, the one true outline a scroll has, roughed from the maple billet lying cheek down in the harness against a T fence: the planed face, which is the fingerboard plane, on the stem\'s left side and the heel end on the crossbar. The bit cannot reach through the cheeks, so the profile is cut from both faces, each file going half way and a little over; for the second the billet is rolled over onto the stem\'s other side, the same face on the stem, the same end on the crossbar, and the file is the first mirrored across the stem. The harness has to leave room for the head on both sides. ' +
    `Tabs stand ${SCROLL.tabHeight} mm off each file\'s floor on the straight stretches of the neck\'s back, the pegbox\'s back and the top of the head, so what is left in the middle is a saw cut. ` +
    `The throat, where the pegbox front dives under the first turn, is narrower than any bit that could reach it: the file bridges it where the pocket narrows to the bit plus ${SCROLL.bridge} mm a side and leaves it for the gouge, the maker\'s cut. ` +
    'The stem runs along the neck only, ending under the head, since a volute\'s front may stand proud of the fingerboard plane. With the face inset at 0 the face sits on the stem and is never cut: the kerf runs from near the heel\'s front corner round to the top of the flat above the nut, and the two slivers left at the stem are sawn. A chin past the plane needs the face inset by at least that much: the chin is then cut flush with the billet\'s face beyond the stem, and the face is planed down to the plane after, the pass made anyway when the fingerboard is fitted. A face inset of a bit\'s width and more cuts the whole outline, face included.\n\n' +
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
const SIDES: readonly ScrollSide[] = ['left', 'right'];
const STOCKS: readonly StockId[] = ['mould', 'plate', 'cradle', 'scroll'];

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
  let sc = stored.scroll;
  if (SIDES.includes(sc?.side)) out.scroll.side = sc.side;
  if (positive(sc?.faceInset) || sc?.faceInset === 0) out.scroll.faceInset = sc.faceInset;
  if (positive(sc?.endMargin)) out.scroll.endMargin = sc.endMargin;
  for (let key of ['width', 'length'] as const) if (positive(sc?.harness?.[key])) out.scroll.harness[key] = sc.harness[key];
  for (let key of ['x', 'y', 'thickness', 'reach'] as const) {
    let n = sc?.fence?.[key];
    if (positive(n) || (n === 0 && (key === 'x' || key === 'y'))) out.scroll.fence[key] = n;
  }
  return out;
}

export function writeSettings(settings: DevExportSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // a blocked store keeps the settings for this visit
  }
}
