import { error, info } from "../shared/message-emitter";

const defaultTTL = 30000

export function insetInfo() {
    info(
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
        "Mould Inset", defaultTTL, true
    );
}

export function dimensionInfo() {
    info(
        "The outer dimensions of the finished instrument body — height (overall length) and lower bout width.\n\n" +
        "For historical instruments these are usually documented online. Many Cremonese instruments relate height and width as simple whole-number ratios.",
        "Body Dimensions", defaultTTL, true
    )
}

export function boutWidthInfo() {
    info(
        "These are outer measurements — they include rib thickness and overhang. The arc radii below instead define the inner mould outline.\n\n" +
        "If the instrument appears too tall relative to your reference image, adjust the height in the previous panel or rescale the image.",
        "Bout Width", defaultTTL, true
    )
}

export function violNeckInfo() {
    info(
        "Replaces the standard upper block geometry with a rounded neck profile common on double basses and gambas.\n\n" +
        "Still in development — expect rough edges.",
        "Viol Neck", defaultTTL, true
    )
}

export function violCornerInfo() {
    info(
        "The gamba (bass) corner draws a single continuous arc from the bout to the corner tip, replacing the two-arc Cremonese corner. Common on viols and double basses.",
        "Viol Corner", defaultTTL, true
    )
}

export function buttonInfo() {
    info(
        "The button is the small semicircular tab at the top of the upper bout on the back plate. It reinforces the neck joint.\n\n" +
        "It appears only on the back — not on the top plate.",
        "Button", defaultTTL, true
    )
}

export function centerBoutWidthInfo() {
    info(
        "The width at the narrowest point of the instrument body. Like the bout widths, this is an outer measurement — it includes rib thickness and overhang.",
        "Center Bout Width", defaultTTL, true
    )
}

export function fitC0Info() {
    info(
        "The center-bout arc (C0) can be constrained to cleanly intersect both the upper and lower bout arcs — a layout derived from Kevin Kelly's four-circles violin theory.\n\n" +
        "Not all instruments follow this geometry. When disabled, C0's X and Y position can be set freely.",
        "Fit C0", defaultTTL, true
    )
}

export function cornerPositionInfo() {
    info(
        "The corner tip coordinates. The corner arcs are drawn to meet at this point.\n\n" +
        "Corners are always positioned within the inset boundary — the tip sits on the mould outline, not the finished plate edge.",
        "Corner Position", defaultTTL, true
    )
}

export function bitDiameterInfo() {
    info(
        "The diameter of the CNC router bit used to cut the mould. Strict 90° interior corners aren't achievable on a CNC; this value adds relief so corner blocks can seat properly.\n\n" +
        "Set to 0 if cutting by hand.",
        "Bit Diameter", defaultTTL, true
    )
}

export function channelDepthInfo() {
    info(
        "Width of the solid rim along the edge of the mould.\n\n" +
        "Larger values leave more material between the blocks; smaller values open the interior sooner.\n\n" +
        "Ignored when 'Use Simple Clamp Box' is on — that swaps this arc-following cutout for a plain rectangular slot.",
        "Channel Depth", defaultTTL, true
    )
}

export function compoundArcInfo() {
    info(
        "A compound arc splits one corner arc into two, joined end-to-end. This allows more pronounced or S-curved corner shapes than a single arc permits.\n\n" +
        "Radius 2 is the secondary arc, typically smaller than the primary. The split angle sets the transition point between them.",
        "Compound Arc", defaultTTL, true
    )
}

export function purflingInfo() {
    info(
        "Purfling is a narrow inlaid strip set just inside the plate edge. The channel is routed into the plate surface before the strip is glued in.\n\n" +
        "Offset: distance from the outer plate edge to the near wall of the channel.\n\n" +
        "Width: The width of the channel — the span between the two purfling lines.",
        "Purfling", defaultTTL, true
    )
}

export function flatPlatformInfo() {
    info(
        "Leaves the fluting platform flat at the plate surface — the state you cut purfling on and join the arching to before the channel is gouged.\n\n" +
        "Turn off to see the finished carved channel.",
        "Flat Platform", defaultTTL, true
    )
}

export function archContoursInfo() {
    info(
        "View the finished surface as a contour map or a wireframe mesh — drag the view box to rotate either.\n\n" +
        "Both are approximations near the edge and can look fuzzy there. Neither affects the STL, which uses the clean edge.",
        "Arch Contours", defaultTTL, true
    )
}

export function ribHeightInfo() {
    info(
        "The height of the ribs — the side walls of the instrument body.\n" +
        "Typical values:\n" +
        "- Violin: 29–32 mm\n" +
        "- Viola: 38–44 mm\n" +
        "- Cello: 115–130 mm\n" +
        "- Bass: 175–215 mm",
        "Rib Height", defaultTTL, true
    )
}

export function archHeightInfo() {
    info(
        "The maximum height of the arch above the outer plate edge.\n\n" +
        "Typical values:\n" +
        "- Violin top: 14–17 mm  |  back: 13–16 mm\n" +
        "- Viola top: 18–22 mm  |  back: 17–21 mm\n" +
        "- Cello top: 24–28 mm  |  back: 22–26 mm\n\n" +
        "The back is usually 1–2 mm lower than the top.",
        "Arch Height", defaultTTL, true
    )
}

export function plateThicknessInfo() {
    info(
        "The thickness of the plate at the outer edge.\n\n" +
        "Typical edge thicknesses:\n" +
        "- Violin top: 2.3–2.8 mm  |  back: 2.8–3.5 mm\n" +
        "- Viola: slightly heavier than violin\n" +
        "- Cello top: 4.0–5.0 mm  |  back: 5.0–6.0 mm",
        "Plate Thickness", defaultTTL, true
    )
}

export function trochoidFactorInfo() {
    info(
        "Shape within the trochoid family, all peaking at the same height.\n\n" +
        "- d = 0: raised cosine — gradual, symmetric rise from the edge.\n" +
        "- d = 1: standard cycloid — steeper from the edge, flatter near the peak.\n" +
        "- Between blends the two.",
        "Trochoid Factor", defaultTTL, true
    )
}

export function curveTypeInfo() {
    info(
        "Catenary — an inverted hanging chain. Smooth and symmetric; a good starting point.\n\n" +
        "Spline — a cubic through your control points. It never rises above the heights you set, so two equal points give a flat run between them.",
        "Arch Curve Type", defaultTTL, true
    )
}

export function splinePointInfo() {
    info(
        "Position (0–100): along the plate length, 0 = upper edge, 100 = lower edge. Both edges are z = 0.\n\n" +
        "Height (mm): above the plate outer edge, same unit as Arch Height.\n\n" +
        "Peak: the first row, always at the Arch Height but movable along the plate. Off 50 gives an end-to-end asymmetric arch.\n\n" +
        "Mirror: off shapes one end independently.",
        "Spline Control Point", defaultTTL, true
    )
}

export function crossSectionStationInfo() {
    info(
        "Selects which cross section of the body you are viewing — the position along the body length (Y), " +
        "measured in mm from the bottom of the instrument.\n\n" +
        "This is a view control only — it is not saved with the recipe.",
        "Cross-Section Station", defaultTTL, true
    )
}

export function crossArchCycloidControlsInfo() {
    info(
        "Factor (0–1): 0 is raised-cosine (gentler edge rise), 1 classic cycloid (steeper edge, flatter crest).\n\n" +
        "Percent: how much of the full cycloid is stretched across the width. Lower trims the flat ends and steepens the edge takeoff.",
        "Cross-Arch Cycloid Controls", defaultTTL, true
    )
}

export function asymmetricCrossArchInfo() {
    info(
        "By default the cross arch is the same shape on both sides of the centerline. Turning this on lets the left (x<0) and right (x>0) halves take independent Cycloid Factor / Percentage values instead.\n\n" +
        "Both halves always meet the center at the same peak height with a level tangent regardless of how differently they're shaped, so there is never a seam at the centerline — only the takeoff shape on each side changes.",
        "Asymmetric Cross Arch", defaultTTL, true
    )
}

export function crossStationInfo() {
    info(
        "A station pins a different cross-arch shape at one body position; the arch ramps smoothly from the plate's own Factor/Percent through each station and back.\n\n" +
        "To add: dial in the shape, move the section height to where it applies, press Set Station. To change: move the section onto it, or click its row.\n\n" +
        "Corner sections tend to run flatter, the lower bout fuller. Two or three stations are usually plenty.",
        "Cross-Arch Stations", defaultTTL, true
    )
}

export function crossArchCurveTypeInfo() {
    info(
        "Two cross-arch profiles are available:\n\n" +
        "Cycloid — a trochoid curve controlled by a Factor and Percent, always symmetric unless you turn on the separate Asymmetric toggle.\n\n" +
        "Spline — a cubic spline through user-placed control points, with a movable Peak position and per-point Mirror flags instead of a separate asymmetric toggle. The peak's height is always the long arch's height at that body position — only its position across the width, and the shape of the rise to it, are yours to set.",
        "Cross-Arch Curve Type", defaultTTL, true
    )
}

export function crossArchSplinePointInfo() {
    info(
        "Position (0–100): across the width, 0 = left takeoff edge, 100 = right. Both edges are 0%.\n\n" +
        "Height (0–100%): a fraction of the local peak height, not mm — the peak comes from the long arch and changes station to station.\n\n" +
        "Peak: the first row, always 100%, movable across the width.\n\n" +
        "Mirror: off shapes one side independently.",
        "Cross-Arch Spline Control Point", defaultTTL, true
    )
}

export function crossArchEdgeDepthInfo() {
    info(
        "Lowers the point where the long and cross arches take off from the plate edge, measured in mm below the plate outer surface.\n\n" +
        "This is primarily used to control the degree of curvature along the fluting.\n\n" +
        "Values of 0.5–2 mm are typical.",
        "Edge Depth", defaultTTL, true
    )
}

export function cornerCutoffInfo() {
    info(
        "Controls where the corner arc is trimmed, setting the final length of the corner tip. Shorter values produce blunter corners; longer values produce more pronounced points.\n\n" +
        "When in doubt, leave the corner a little long — the tip gets slightly rounded during final fitting and varnishing.",
        "Corner Cutoff", defaultTTL, true
    )
}

export function gougeSectionInfo() {
    info(
        "The tool itself. Sweep and depth fix the channel's section completely, so its width is reported rather than set.\n\n" +
        "Small sweep cuts deep and narrow, large sweep broad and shallow. Fluting gouges typically run 8–25 mm of sweep at 1–1.5 mm depth.\n\n" +
        "Unlike the classic model, the sweep does not drift as it travels — one tool, run the whole way round.",
        "Gouge Section", defaultTTL, true
    )
}

export function gougeCBoutInfo() {
    info(
        "An optional second, narrower gouge for the waist. Same land edge, same depth — only the tool changes, so the inner edge pulls back where a tighter gouge cannot reach.\n\n" +
        "The junctions either side of the waist are joined by biarcs, so the line stays closed and smooth at the new radius.",
        "C-Bout Gouge", defaultTTL, true
    )
}

export function gougeCenterlineInfo() {
    info(
        "Where the flat land ends and the channel begins, measured inward from the plate edge.\n\n" +
        "The channel has no position of its own — it starts at this line and grows inward by whatever the gouge cuts. Both plates share it, since it belongs to the purfling rather than to either tool.\n\n" +
        "The arching templates stop short of it, at the bottom of the trough — highest point of the arch to lowest, and nothing past it.",
        "Land Edge", defaultTTL, true
    )
}

export function cornerGougeInfo() {
    info(
        "The channel runs past the corners rather than steering into them, leaving a wedge of flat wood between it and the land edge. This gouges that wedge out as a second pass.\n\n" +
        "Same tool, same depth, anchored to the land edge instead. Along the flanks the two lines coincide, so it finds nothing to cut and changes nothing; it only bites at the corners. Where the gap is wider than the gouge it takes as many passes as it needs, never going below the depth you set.\n\n" +
        "Turn off to leave the corners as bare flat land.",
        "Gouge Corners", defaultTTL, true
    )
}

export function gougedCrossCurveTypeInfo() {
    info(
        "Cycloid: a trochoid set by two numbers — the same family the classic cross arching offers.\n\n" +
        "Spline: control points you place yourself, and the only way to make the two sides differ.\n\n" +
        "Switching replaces the shape rather than converting it; the two have no honest translation between them.",
        "Crown Curve", defaultTTL, true
    )
}

export function gougedCrossCycloidControlsInfo() {
    info(
        "Factor: 0 is a raised cosine, 1 the standard cycloid. Higher fills the shoulders and tightens the crown.\n\n" +
        "Percent: how much of the curve is used, trimmed evenly from both ends.\n\n" +
        "Because the channel is already cut, how steeply the crown runs out decides where along the channel flank the two meet — gentle run-outs contact near the trough, steep ones high up. Which way Percent moves that depends on the Factor, so watch the section.",
        "Cycloid Crown", defaultTTL, true
    )
}

export function gougedCrossTemplateInfo() {
    info(
        "Position: across the whole plate — 0 the bass channel, 50 the joint, 100 the treble channel. A knot at 66 and one at 34 sit the same distance out on opposite sides. Height: percent of the local arch height, so the crown is always 100.\n\n" +
        "Percentages rather than mm, because what carries between stations is a shape — a fixed-width crown swells to fill a narrower station.\n\n" +
        "Where the arch ends is solved, not set: the run-out meets the channel tangentially and the contact slides to wherever that works out.\n\n" +
        "Mirror: off shapes the two sides independently.",
        "Cross-Arch Shape", defaultTTL, true
    )
}

export function gougedCrossPeakInfo() {
    info(
        "Where the crown sits across the plate. 50 is the joint; lower moves it to the bass side. Real plates rarely peak dead centre.\n\n" +
        "It does not tilt the arch or drag the control points along — those are measured from the joint, so a point can end up on the far side of the crown from where it was entered.\n\n" +
        "Toward each cap the ridge eases back onto the joint on its own, since there is no crown out there to carry it.",
        "Crown Position", defaultTTL, true
    )
}

export function gougedCrossStationInfo() {
    info(
        "A station pins a different crown shape at one body position; the crown ramps smoothly from the plate's base shape through each station and back.\n\n" +
        "To add: dial in the shape, move the section to where it applies, press Set Station. To change: move the section onto it, or click its row.\n\n" +
        "What ramps is the sampled shape, not the numbers, so the fields cannot show a blend between two stations — they show the nearest, and editing opens a new station where you are. Two or three are usually plenty.",
        "Crown Stations", defaultTTL, true
    )
}

export function gougedTransitionInfo() {
    info(
        "Where the arch stops being the template and becomes the run into the channel. Solved for, not set — tangency is one equation, and the contact point is its one unknown.\n\n" +
        "If no solution exists, the arch and channel genuinely cannot meet there. Lower the arch, move the channel outward, or widen the gouge.",
        "Transition Zone", defaultTTL, true
    )
}

/**
 * Raised when a cross-arch station's crown cannot run tangentially into its
 * channel.
 *
 * A popup rather than a line in the panel, because it is a property of the
 * geometry rather than a state of the controls — the surface at that station
 * carries a visible crease, and a maker reading the section deserves telling
 * rather than being left to notice. Titled per plate so both can be reported at
 * once; the panel decides when to raise it.
 */
export function gougedTransitionError(plate: 'top' | 'bottom', y: number) {
    const label = plate === 'top' ? 'Top' : 'Back';
    error(
        `The ${label.toLowerCase()} plate's crown cannot meet its channel at station ${y.toFixed(0)} mm.\n\n` +
        "The crown arrives steeper than the gouge's flank ever gets, so there is nowhere along that flank the two can run tangent. Tangency is one equation with one unknown — the contact point — and here it has no solution. The section is drawn with a visible crease rather than a fudged meeting, which is the honest picture of an arch that cannot reach its channel.\n\n" +
        "Real makers resolve this by quietly cheating the arch. Lower the arch height, widen the gouge, or soften the crown's run-out.",
        `${label} Plate Transition`
    )
}
