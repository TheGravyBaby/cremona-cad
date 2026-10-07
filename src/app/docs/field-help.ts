import { info } from '../shared/message-emitter';

// The write-up behind each ⓘ. Bound in a panel as (click)="help('id')"; an entry with no
// ⓘ yet is still kept here so the text has one home. A text beginning "TODO:" is a placeholder
// waiting to be written; the note after it says what the entry is for.

export const FIELD_HELP = {
  inset: {
    title: "Mould Inset",
    text:
      "The mould sits inset from the outer edge of the instrument by rib thickness + overhang:\n\n" +
      "Final outer edge = mould edge + rib thickness + overhang.\n\n" +
      "Standard rib thicknesses:\n" +
      "- Violin: 1.0 mm\n" +
      "- Viola: 1.1 mm\n" +
      "- Cello: 1.3–1.6 mm\n" +
      "- Bass: 2.5–3.0 mm\n\n" +
      "Overhang is typically 2–5 mm.\n\n" +
      "Tracing from a reference image: the purfling's inner edge is a reliable guide for the mould outline — " +
      "it commonly aligns with the ribs' inner edge.",
  },
  dimension: {
    title: "Body Dimensions",
    text:
      "The outer dimensions of the finished instrument body — height (overall length) and lower bout width.\n\n" +
      "For historical instruments these are usually documented online. Many Cremonese instruments relate height and width as simple whole-number ratios.",
  },
  boutWidth: {
    title: "Bout Width",
    text:
      "These are outer measurements — they include rib thickness and overhang. The arc radii below instead define the inner mould outline.\n\n" +
      "If the instrument appears too tall relative to your reference image, adjust the height in the previous panel or rescale the image.",
  },
  violNeck: {
    title: "Viol Neck",
    text:
      "Replaces the standard upper block geometry with a rounded neck profile common on double basses and gambas.\n\n" +
      "Still in development — expect rough edges.",
  },
  violNeckJoin: {
    title: "Neck Join Radius",
    text:
      "The join radius applies a rounding between the viol neck and the flat top of the instrument.\n\n" +
      "Zero leaves it sharp at the rib line. A small radius (1–2 mm) is typical for a bass or gamba.",
  },
  violCorner: {
    title: "Viol Corner",
    text:
      "The gamba (bass) corner draws a single continuous arc from the bout to the corner tip, replacing the two-arc Cremonese corner. Common on viols and double basses.",
  },
  button: {
    title: "Button",
    text:
      "The button is the small semicircular tab at the top of the upper bout on the back plate. It reinforces the neck joint, and the heel is finished flush to it.\n\n" +
      "Width is the cap's diameter. Height is how far the tip stands beyond the plate's end on the centerline — the same number the neck panel shows as the heel foot's reach. " +
      "A height under half the width has no straight walls: the cap alone breaks the edge, as a segment.\n\n" +
      "Violin: 20–22 wide, 13–14 high. It appears only on the back — not on the top plate.",
  },
  centerBoutWidth: {
    title: "Center Bout Width",
    text:
      "The width at the narrowest point of the instrument body. Like the bout widths, this is an outer measurement — it includes rib thickness and overhang.",
  },
  fitC0: {
    title: "Fit C0",
    text:
      "The center-bout arc (C0) can be constrained to cleanly intersect both the upper and lower bout arcs — a layout derived from Kevin Kelly's four-circles violin theory.\n\n" +
      "Not all instruments follow this geometry. When disabled, C0's X and Y position can be set freely.",
  },
  cornerPosition: {
    title: "Corner Position",
    text:
      "The XY coordinates for the corner tips. The corner arcs are drawn to meet at this point.\n\n" +
      "The default position is a good starting point, or helpful to reset if your values get out of bounds.",
  },
  bitDiameter: {
    title: "Bit Diameter",
    text:
      "The diameter of the CNC router bit used to cut the mould. Strict 90° interior corners aren't achievable on a CNC; this value adds relief so corner blocks can seat properly.\n\n" +
      "Set to 0 if cutting by hand.",
  },
  compoundArc: {
    title: "Compound Arc",
    text:
      "A compound arc splits one corner arc into two, joined end-to-end. This allows more pronounced corner than a single arc permits.\n\n" +
      "Radius 2 is the secondary arc, typically smaller than the primary. The split angle sets the transition point between them.",
  },
  purfling: {
    title: "Purfling",
    text:
      "Offset: distance from the outer plate edge to the near wall of the channel.\n\n" +
      "Width: The width of the channel — the span between the two purfling lines.",
  },
  archContours: {
    title: "Arch Contours",
    text:
      "View the finished surface as a contour map or a wireframe mesh — drag the view box to rotate either.\n\n" +
      "Both are approximations near the edge and can look fuzzy there. Neither affects the STL, which uses the clean edge.",
  },
  ribHeight: {
    title: "Rib Height",
    text:
      "The height of the ribs — the side walls of the instrument body.\n\n" +
      "Classical ribs taper: they are planed down toward the upper block once the back is glued on, " +
      "so the back stays square to the body and the top plate glues onto a slight angle. " +
      "Measure each end across the rib, square to its own top edge.\n\n" +
      "Typical values, at the lower end:\n" +
      "- Violin: 29–32 mm\n" +
      "- Viola: 38–44 mm\n" +
      "- Cello: 115–130 mm\n" +
      "- Bass: 175–215 mm\n\n" +
      "The upper end usually runs 1.5–2 mm shorter on a violin, and proportionally more on the larger instruments. " +
      "Equal values give an untapered rib.",
  },
  archHeight: {
    title: "Arch Height",
    text:
      "The maximum height of the arch above the outer plate edge.\n\n" +
      "Typical values:\n" +
      "- Violin top: 14–17 mm  |  back: 13–16 mm\n" +
      "- Viola top: 18–22 mm  |  back: 17–21 mm\n" +
      "- Cello top: 24–28 mm  |  back: 22–26 mm\n\n" +
      "The back is usually 1–2 mm lower than the top.",
  },
  plateThickness: {
    title: "Plate Thickness",
    text:
      "The thickness of the plate at the outer edge.",
  },
  curveType: {
    title: "Arch Curve Type",
    text:
      "Catenary — an inverted hanging chain. Smooth and symmetric; a good starting point.\n\n" +
      "Spline — a cubic through your control points. It never rises above the heights you set, so two equal points give a flat run between them.",
  },
  splinePoint: {
    title: "Spline Control Point",
    text:
      "Position (0–100): along the plate length, 0 = upper edge, 100 = lower edge. Both edges are z = 0.\n\n" +
      "Height (mm): above the plate outer edge, same unit as Arch Height.\n\n" +
      "Peak: always at the Arch Height, movable along the plate. Off 50 gives an end-to-end asymmetric arch.\n\n" +
      "Mirror: repeats the point at the same distance from the other edge. Off by default — the two ends of a plate are rarely the same arch.\n\n" +
      "Order: drag a row by its grip, or arrow-key it. The peak moves with the rest. Order is for reading — the arch is the same either way.",
  },
  crossSectionStation: {
    title: "Cross-Section Station",
    text:
      "Selects which cross section of the body you are viewing — the position along the body length (Y), " +
      "measured in mm from the bottom of the instrument.\n\n" +
      "This is a view control only — it is not saved with the recipe.\n\n" +
      "Note there can be some clipping around the corners, as some corners will intersect our cross section line at two points. This has no effect on the exported templates.",
  },
  cornerCutoff: {
    title: "Corner Cutoff",
    text:
      "Controls where the corner arc is trimmed, setting the final length of the corner tip. Shorter values produce blunter corners; longer values produce more pronounced points.\n\n" +
      "When in doubt, leave the corner a little long — the tip gets slightly rounded during final fitting.",
  },
  gougeSection: {
    title: "Gouge Section",
    text:
      "Sweep corresponds to the sweep of a real gouge tool, which is used to carve the fluting channel. Depth refers to the fluting channel depth, so its width is reported rather than set.\n\n" +
      "Small sweep cuts deep and narrow, large sweep broad and shallow. Fluting gouges typically run 8–25 mm of sweep at 1–1.5 mm depth.\n\n",
  },
  gougeCBout: {
    title: "C-Bout Gouge",
    text:
      "An optional second, narrower gouge for the waist. Same land edge, same depth — only the tool changes, so the inner edge pulls back where a tighter gouge cannot reach.\n\n" +
      "The junctions either side of the waist are joined by biarcs, so the line stays closed and smooth at the new radius.",
  },
  gougeCenterline: {
    title: "Land Edge",
    text:
      "Defines the offset for the flat of the edge. This is where the fluting channel will end, leaving a flat surface around the very edge of the instrument.\n\n" + "Values typically range from 1-3mm.",
  },
  cornerGouge: {
    title: "Gouge Corners",
    text:
      "Left on as a default. Typically, a fluting channel is gouged out around the corners, and later the corners are carved to smoothly meet the fluting channel. This option toggles that secondary carving, which can be useful for STL exports if you wish to do this step by hand.",
  },
  crossArchCurveType: {
    title: "Crown Curve",
    text:
      "Factor (0–1): 0 is raised-cosine (gentler edge rise), 1 is a classic cycloid (steeper edge, flatter crest). Percent: how much of the  cycloid is stretched across the width.\n\n" +
      "Spline: control points you place yourself.\n\n" +
      "Catenary: an inverted hanging chain. No fields — the crown height comes from the long arch and the width from what's available at each station, so it's solved rather than authored, and it carries no stations of its own.\n\n" +
      "Switching replaces the shape rather than converting it; these have no honest translation between them.",
  },
  crossArchCycloidControls: {
    title: "Cycloid Crown",
    text:
      "Factor: 0% is a raised cosine, 100% the standard cycloid. Higher fills the shoulders and tightens the crown.\n\n" +
      "Percent: how much of the curve is used, trimmed evenly from both ends. Past 100% the ends curl under the takeoff and back up, so the arch can dip below the channel and meet its outer flank.\n\n",
  },
  crossArchTemplate: {
    title: "Cross-Arch Shape",
    text:
      "Position defines the position of your control point accross the body width, where 50% is dead center. Height works much the same. The long arch panel defines the peak height for this curve, so height is defined as a percentage of this peak.\n\n" +
      "Order: drag a row by its grip, or arrow-key it. The peak moves with the rest. Order is for reading — the section is the same either way.",
  },
  crossArchPeak: {
    title: "Crown Position",
    text:
      "Where the peak of the curve fits along the body. Real plates rarely peak dead center.\n\n" +
      "You can move the peak +/- from the center as needed, center is defined as 50%.",
  },
  crossArchStation: {
    title: "Station Pinning",
    text:
      "This button fixes your arch shape to the selected station height. Multiple stations can be pinned, and the surface curve will (attempt ^_^) to smoothly join them.\n\n" +
      "Arching on historical instruments varies about the body, but two or three stations are usually plenty to define a sensible surface.",
  },
  transition: {
    title: "Transition Zone",
    text:
      "Where the arch stops being the template and becomes the run into the channel. Solved for, not set — tangency is one equation, and the contact point is its one unknown.\n\n" +
      "If no solution exists, the arch and channel genuinely cannot meet there. Lower the arch, move the channel outward, or widen the gouge.",
  },
  bridgeHeight: {
    title: "Bridge Height",
    text:
      "The bridge's height from its feet to the string notches, on the centerline. " +
      "The feet stand on the arch at the bridge line, so the strings stand arch plus bridge above the edge.\n\n" +
      "Violin bridges finish around 33 mm. Raise it and the strings sit higher over the fingerboard's end.",
  },
  mortiseDepth: {
    title: "Mortise Depth",
    text:
      "The mortise is the pocket cut through the ribs into the upper block that the neck's foot sits in. " +
      "Its depth is measured from the rib's outer face.\n\n" +
      "Violin: 6–7 mm. With the button, it sets how long the heel's foot is.",
  },
  overstand: {
    title: "Overstand",
    text:
      "The overstand (appui) is how far the fingerboard's underside stands above the top plate's edge at the neck root, " +
      "measured square to the plate.\n\n" +
      "Violin: 6–7 mm. It fixes where the neck leaves the body; the angle fixes where it points.",
  },
  neckThickness: {
    title: "Neck Thickness",
    text:
      "The neck wood alone, from the plane the fingerboard glues to down to the back — taken as uniform along " +
      "its length, root to nut, rather than tapering.\n\n" +
      "Violin: about 13 mm, which with the fingerboard gives the bench's 19–21 mm.",
  },
  heelRadius: {
    title: "Heel Radius",
    text:
      "The heel is the cove sweeping from the neck's back down to the button, drawn as one arc tangent to the back.\n\n" +
      "The foot below it is cut square to the neck, not level with the body, so it rises off the button at the neck angle. " +
      "A tight radius meets the foot and a flat carries on to the button's tip; a wide one reaches the tip on its own.",
  },
  neckLength: {
    title: "Neck Length",
    text: "TODO: the neck's own length, mortise floor to the nut along the fingerboard plane. It places the nut; the string length is read off it.",
  },
  neckAngle: {
    title: "Neck Projection",
    text: "TODO: the tilt of the fingerboard plane off the body's axis, entered in degrees. Makers set it by projection at the bridge line (about 27 mm on a violin); there is no projection readout.",
  },
  neckWidths: {
    title: "Neck Widths",
    text: "TODO: Top Width at the nut and Root Width at the body, the neck's taper seen from in front.",
  },
  fingerboard: {
    title: "Fingerboard",
    text: "TODO: Length (stock sizes by instrument, seeded from body height), Thickness at the edges, and Radius of the cylinder the crown is cut from.",
  },
  bodyStop: {
    title: "Body Stop",
    text: "TODO: top plate's upper edge down to the bridge line, where the f-hole notches are cut. Violin 195 mm.",
  },
  stringLength: {
    title: "String Length",
    text: "TODO: the readout, nut to bridge, straight-line and approximate. Follows from the neck's length; should land near 325–328 mm on a violin, the classical 2:3 against the body stop.",
  },
  voluteSpiral: {
    title: "Volute",
    text: "TODO: the spiral about the eye: style, eye radius and position, pitch and seed.",
  },
  voluteCrown: {
    title: "Crown",
    text: "TODO: S0 and S1, the arcs over the top of the head from the spiral to the back.",
  },
  scrollBack: {
    title: "Scroll Back",
    text: "TODO: S2, the straight, S3, the hang, the nape and the nape-as-circle toggle; the head's height and width readouts.",
  },
  scrollFront: {
    title: "Scroll Front",
    text: "TODO: the flat up from the nut, the nut's height, F0, the straight and F1 in under the volute.",
  },
  scrollWidthsFront: {
    title: "Front Widths",
    text: "TODO: the pegbox sawn through the blank: nut width, hips and hip height, throat, wall.",
  },
  scrollWidthsBack: {
    title: "Back Widths",
    text: "TODO: the path from the duck tail's round over the crown and in to the eye: duck tail, foot, back hip, poll, crown; the compass step.",
  },
  scrollWidthsTurns: {
    title: "Turn Widths",
    text: "TODO: the width at the bottom of turn 1, the top and bottom of turn 2, and the eye.",
  },
} as const satisfies Record<string, { title: string; text: string }>;

export type FieldHelpId = keyof typeof FIELD_HELP;

const TTL = 30000;

export function showFieldHelp(id: FieldHelpId): void {
  const h = FIELD_HELP[id];
  info(h.text, h.title, TTL, true);
}
