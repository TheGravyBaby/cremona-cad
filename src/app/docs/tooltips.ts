import { Directive, HostBinding, Input } from '@angular/core';

// Every tooltip that explains something, keyed by where it hangs. A tooltip that only names a
// control ("Zoom in", "Add layer") stays a literal title= in its template.

export const TOOLTIPS = {
  // view
  'view.zoom': 'Zoom (px/mm). Click to set the view by number.',
  'view.centerX': "Horizontal position of the view's centre, as the X axis numbers it.",
  'view.centerY': "Vertical position of the view's centre, as the Y axis numbers it.",
  'view.scale': 'Screen pixels per millimetre of drawing, held about the centre.',

  // axis
  'axis.axes': "The two lines through the origin, numbered along the view's edges at the grid steps.",
  'axis.gridX': 'Vertical lines, one every step along X. Also spaces the X axis numbers.',
  'axis.gridY': 'Horizontal lines, one every step along Y. Also spaces the Y axis numbers.',

  // edit
  'edit.copy': 'As SVG text, at real size',
  'edit.paste': 'In place, onto the active layer',
  'edit.saveSelection': 'Save the selection as an SVG file, at real size',
  'edit.duplicate': 'A copy over the original, on the active layer; a recipe piece becomes an editable shape',
  'edit.group': 'Selects and moves as one thing; ungroup to reshape a member',

  // layers
  'layers.recipe': 'What the recipe draws. Unlocked, its pieces can be selected, read and duplicated — never edited.',
  'layers.moveSelection': 'Move the selection to this layer',
  'layers.importSvg': 'Import an SVG file onto the active layer, in place',
  'layers.saveLayer': 'Save the active layer as an SVG file, at real size',

  // images
  'images.unlock': 'Click to show it here and unlock it for editing; double-click to rename',
  'images.upload': 'Choose an image file to place on the canvas',
  'images.link': 'Place an image from a web address. Paste the link to the image file itself — the one behind "Copy image address" — not the page it sits on.',

  // settings
  'settings.recipePiece': 'Read-only: the recipe draws this from its parameters. Duplicate it (Ctrl+D) for an editable copy.',
  'settings.color': "Drawing color — edits the selected shape's color, or the color new shapes will use",
  'settings.sectionColor2': "Section's second alternating segment color",
  'settings.selectionCenter': 'Centre of the selection — type to move everything selected',
  'settings.lineLength': 'Sets the distance from X1/Y1, keeping the current angle',
  'settings.dimensionOffset': 'How far the dimension line sits off the points it measures — negative puts it on the other side',
  'settings.roundRadius': 'Radius of the round, in mm',
  'settings.curveSag': 'How far the curve stands off the line between its ends, in mm',
  'settings.cycloidFactor': 'How far out on the rolling circle the drawing point sits — 100 is a true cycloid, 0 a plain cosine hump',
  'settings.cycloidPercent': 'How much of the full arch spans the chord — below 100 trims the flat ends so it meets the chord at an angle, above 100 curls them under it',
  'settings.labelText': 'Label text — Enter adds a line, Escape reverts. Scrolls rather than growing; double-click the label on the canvas for a box that opens out.',
  'settings.fontSize': 'Font size in mm — measured on the drawing, so it holds its proportion through a zoom. Sets the size for new labels too.',
  'settings.textAngle': 'Degrees counterclockwise — or drag the round handle above a selected label',
  'settings.strokeWidth': 'Stroke width in screen pixels — constant at any zoom',
  'settings.opacity': 'Opacity from 0 (invisible) to 1 (fully opaque) — dial down for a highlighter-style mark',
  'settings.resetPen': 'Back to an ordinary opaque line — resets Color/Width/Opacity to the default pen',
  'settings.highlighter': 'Sets the pen to a wide, translucent yellow stroke — a shortcut for Color+Width+Opacity, not a separate tool',
  'settings.imageName': 'What this image is — e.g. Plan, Long arch, Cross arch',
  'settings.imageWidth': 'Width in mm — type a real measurement to scale the image to it. The height follows: a reference image is never stretched out of proportion.',
  'settings.imageHeight': 'Height in mm — type a real measurement to scale the image to it. The width follows: a reference image is never stretched out of proportion.',
  'settings.imageOpacity': 'Opacity from 0 (invisible) to 1 (fully opaque)',
  'settings.imageMirror': "Mirror the image left-right — for a scan that came out reversed, or to compare against its opposite half. Combine with Rot° to mirror on any axis. The image's position, size and rotation are unaffected.",
  'settings.imageCrop': "Hide part of the picture — trim a side profile down to the half you are tracing. What's left keeps its place and its scale.",
  'settings.imageLock': "Lock this image in place so it can't be selected or dragged on the canvas. Unlock it again from the Reference Images list in this bar.",
  'settings.sectionCount': 'Number of equal segments (e.g. 16 for sixteenths)',
  'settings.sectionWeights': 'Segment weights, comma-separated (e.g. 1,1,1 or 3,4,3) — Enter to apply',

  // toolbar
  'toolbar.export': 'Templates, plans and a copy of the recipe',

  // crossArching
  'crossArching.stlGrid': 'Sampling step for the mesh — finer takes longer and makes a larger file',
  'crossArching.knotX': 'Across the plate — 0 is the bass channel, 50 the joint, 100 the treble channel. A knot at 66 and one at 34 are the same place on opposite sides.',
  'crossArching.knotZ': 'Percent of the local arch height — the crown always sits at 100',
  'crossArching.mirrorKnot': 'Repeat this knot on the other side of the centerline',
  'crossArching.peakX': 'Where the crown sits across the plate — 50 is the joint, lower is bass side.',
  'crossArching.peakZ': 'The crown always sits at the local long-arch height',

  'reorderRow': 'Drag to put this row in order, or move it with the arrow keys',

  // longArching
  'longArching.mirrorPoint': 'Repeat this point at the opposite end of the plate',

  // fluting
  'fluting.landEdge': 'Where the flat land ends and the channel begins — shared by both plates, since it belongs to the outline and the purfling',
  'fluting.gougeCorners': 'Smooth the corners down to meet the channel, instead of leaving them flat',
  'fluting.sweep': 'Sweep radius of the gouge',
  'fluting.depth': 'Depth at the trough — held below the sweep radius',
  'fluting.cBout': 'A second, narrower gouge for the waist',
  'fluting.cBoutSweep': 'Same land edge, same depth — only the inner edge moves',

  // scroll
  'scroll.s2': 'The arc from the crown on down the back toward the pegbox',
  'scroll.s2End': 'Where the arc ends, as the angle round its own centre from the front: 180° the back. It starts where S1 ended',
  'scroll.backStraight': "The straight run on down the back of the scroll from S2's end, along its heading",
  'scroll.s3': "Where the back of the scroll turns into the back of the pegbox: an arc off the straight's end, curving the other way. Its end is the duck tail",
  'scroll.hang': "The duck tail: where the pegbox's back ends and the neck's back begins. How far it hangs below the nut's lower edge; S3 ends where it comes down to it. 0 lands it level with the nut; a cello's hangs about half the neck's width, so the round seen from behind tops out at the pegbox's foot",
  'scroll.nape': "Where the back of the pegbox meets the back of the neck: the arc into the neck's back, off a line run square to the neck from the duck tail, or off the duck tail itself as a circle",
  'scroll.napeCircle': "Fit the nape as one circle through the duck tail, tangent to the neck's back, with no straight. Tighter than the gap between them it rises off the duck tail before coming round; wider, it meets the duck tail at an angle. Takes the least neck, as a cello needs. Off, a line runs square from the duck tail and the nape fillets it into the neck's back",
  'scroll.height': "The head's height, from the nut up to the top of the crown",
  'scroll.width': "The head's depth, from the neck's front back to the furthest reach of the scroll",
  'scroll.flat': "The front of the pegbox rising straight up the neck's front from the top of the nut, before it turns back under the volute",
  'scroll.nutHeight': "The nut's length along the neck. The flat rises from its top",
  'scroll.f0': 'The arc turning the front of the pegbox back from the flat, in under the volute',
  'scroll.f0End': 'Where the arc ends, as the angle round its own centre from the front: the more it turns, the further back the straight after it leans',
  'scroll.frontStraight': "The straight run on from F0's end, along its heading, in under the volute",
  'scroll.f1': 'The small arc curving the front up off the straight to meet the scroll. It ends where it meets it',

  // scrollWidths
  'scrollWidths.throat': "The foot of the front's straight, where F1 turns in under the volute. The cheeks taper to it from the hips and carry the same slope on up F1",
  'scrollWidths.hip': "The pegbox's widest, sawn straight through the blank. The cheeks run out to it from the nut's edges and taper from it to the throat. Unused while Hip Y is 0",
  'scrollWidths.hipY': "Where the pegbox is widest, up from the nut's top. 0 is no hip: the cheeks taper straight from the nut's edges to the throat. A violin's sit a little higher, on top of the duck tail's round; a cello's lower, on the pegbox's foot, below 0, holding their width down to it. Never below the duck tail",
  'scrollWidths.nutWidth': "The nut's width. The pegbox's cheeks run out from its edges",
  'scrollWidths.wall': "The wood left round the hollow, each cheek at the pegbox's front edge and the floor over the back alike",
  'scrollWidths.crown': 'Over the top of the head. No wider than the poll',
  'scrollWidths.poll': "The poll, the back of the head: where the back reaches furthest back, its tangent running straight up the neck, on S2 or S1. The back's edges run out to it from the hip on a straight slope, and leave it on a curve through the widths below",
  'scrollWidths.backHip': "Where the back's slope turns. The back's edges run out to it from the foot and on to the poll, each on a straight slope; as wide as the foot, they run parallel up to it. Unused while Hip Y is 0",
  'scrollWidths.backHipY': "The back's hip, up from the nut's top. 0 is no hip, as on a violin: the back runs on one slope from the foot to the poll. Nor is there one at or below the top of the duck tail's round, and past the poll it is the poll",
  'scrollWidths.foot': "The back's width at the top of the duck tail's round, a radius up from the duck tail, where the back's edges begin. A violin's is the round's own; a cello's is wider, the round meeting it along level shoulders. Never narrower than the round",
  'scrollWidths.duckTail': "The round at the duck tail, seen from behind: the edge where the pegbox's flat back dives into the neck's half-round. Its diameter",
  'scrollWidths.compassSteps': "The compass walk, the older way to set out the back's widths: from the poll up to the second turn's bottom a compass steps the same distance each time, and the back's width is marked at each step. How many steps that is. The step is set to land the last on the second turn's bottom, and is shown beside",
  'scrollWidths.compassStep': 'What the compass is set to for the walk',
  'scrollWidths.lastTurn': 'The last turn is as wide as the eye from its top on in',

  // stringSetup
  'stringSetup.nutThickness': 'How far the nut stands off the neck, which is where the strings sit',

  // volute
  'volute.eyeX': "Eye centre's distance in front of the neck's front, so negative behind it. Set while Flush with Neck is on",
  'volute.eyeY': "Eye centre's height up the neck from the nut",
  'volute.pitch': "How much the spiral's radius grows each full turn, so the even spacing between its turns",
  'volute.seed': "The column of four squares the spiral's centres are struck round, top of it to bottom. The longer the seed, the wider each turn opens",
  'volute.flushWithNeck': "Slide the eye so the spiral's front is flush with the neck's front, Y still setting its height. Off, X is yours too",
  'volute.s0': "The arc carrying the spiral's front on up to the top of the scroll",
  'volute.s0End': "Where the arc ends, as the angle round its own centre from the front: 90° the top of the scroll, 180° the back. It starts where the spiral's front ends",
  'volute.s1': 'The arc from the top of the scroll on over to the back',
  'volute.s1End': 'Where the arc ends, as the angle round its own centre from the front: 180° the back. It starts where S0 ended',
} as const satisfies Record<string, string>;

export type TooltipId = keyof typeof TOOLTIPS;

@Directive({ selector: '[docTip]', standalone: true })
export class TooltipDirective {
  @Input({ required: true }) docTip!: TooltipId;

  @HostBinding('attr.title') get title(): string { return TOOLTIPS[this.docTip]; }
}
