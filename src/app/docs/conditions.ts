import { error, info, warn } from '../shared/message-emitter';

// Every condition the app reports to the maker in more than a sentence, with its severity and
// its chip title. The solvers' own one-line failures stay beside the math that finds them,
// since each is built from the arcs it names.

export function violNeckJoinExceeded(mm: number): void {
  error(
    `The neck reaches ${mm.toFixed(1)}mm further than the upper bout can recieve, ` +
    `so U0 doubles back to meet U1, this should look pretty weird.\n\n` +
    `You have some options. Narrow the neck, shorten V0's radius, or lower V0s end angle. Play with it, I'm sure you'll figure it out.` +
    `Widening the upper bout or shrinking U1 also buys room.`,
    'Viol Neck Join',
  );
}

export function ribTaperExceeded(maxMm: number): void {
  error(
    `The ribs can taper by at most ${maxMm.toFixed(1)}mm over a body this long. ` +
    `Past that the rib line runs longer than the instrument itself, and there is no garland that shape.`,
    'Invalid Rib Taper',
  );
}

export function purflingOffsetTooSmall(): void {
  error('The offset is too small, and the corner circles no longer intersect. Try reducing the purfling offset.', 'Purfling Error');
}

export function flutingWidthsCannotJoin(): void {
  error('Cannot join fluting on main body and c-bout, as the difference in fluting width is too large', 'Fluting Error');
}

// a popup rather than a line in the panel, because it is a property of the geometry rather than
// a state of the controls: the surface at that station carries a visible crease. Titled per
// plate so both can be reported at once
export function crownCannotMeetChannel(plate: 'top' | 'bottom', y: number): void {
  const label = plate === 'top' ? 'Top' : 'Back';
  error(
    `The ${label.toLowerCase()} plate's crown cannot meet its channel at station ${y.toFixed(0)} mm.\n\n` +
    "This isn't a big deal, don't worry. All it means is that a curve cannot be drawn at this point which will be tangent to the fluting edge. Usually it will be pretty close, and can be smoothed out. If you wanted to resolve this, adjust the curve so it isn't so steep at the edge.",
    `${label} Plate Transition`,
  );
}

export function imageLinkFailed(): void {
  warn(
    'Nothing loaded from that address. It has to be a direct link to an image file — the one '
    + 'behind "Copy image address", not the page it sits on.',
    'Image link failed',
  );
}

export function imageResized(from: { width: number; height: number } | null, to: { width: number; height: number }): void {
  info(
    (from
      ? `Reference image scaled from ${from.width} × ${from.height} to ${to.width} × ${to.height} px. `
      : 'Reference image recompressed. ') +
    'Full-resolution images fill the browser\'s working store and bloat the saved file; ' +
    'scale the placed image to real dimensions as usual.',
    'Image resized',
  );
}

export function layerLocked(action: string): void {
  warn('The active layer is locked — unlock it or switch layers first.', action);
}

export function backgroundSuppressionUnavailable(): void {
  warn(
    "This image's source doesn't allow the browser to read its pixels, so its background can't "
    + 'be faded. The image still displays normally.',
    'Background suppression unavailable',
  );
}

export function svgImportEmpty(fileName: string): void {
  warn(`Nothing in ${fileName} could be read as a shape.`, 'Import SVG');
}

export function storageFull(): void {
  error(
    'Your browser\'s storage is full, so this design is no longer being kept while the tab ' +
    'is open. Save it to keep it. Large reference images are the usual cause.',
    'Storage full', true,
  );
}

export function clipboardUnavailable(label: string): void {
  error(`Could not reach the clipboard. ${label} is in the console instead.`, 'Debug');
}

const unexpectedErrorMessages = [
  'Stradivari never had this problem.',
  'A circle walked into a bar and nothing intersected.',
  "These are not the curves you're looking for.",
  "It's gonna be okay.",
  'Back to the drafting board.',
  'Perhaps we should just use paper.',
  "Surely you can't expect the math to be perfect every time.",
];
let unexpectedErrorIndex = 0;

export function unexpectedError(): void {
  error(unexpectedErrorMessages[unexpectedErrorIndex % unexpectedErrorMessages.length], 'An Error Occurred :[');
  unexpectedErrorIndex++;
}
