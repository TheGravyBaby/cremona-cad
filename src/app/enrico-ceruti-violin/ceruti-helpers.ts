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
        "A compound arc splits one corner arc into two, joined end-to-end. This allows more pronounced corner than a single arc permits.\n\n" +
        "Radius 2 is the secondary arc, typically smaller than the primary. The split angle sets the transition point between them.",
        "Compound Arc", defaultTTL, true
    )
}

export function purflingInfo() {
    info(
        "Offset: distance from the outer plate edge to the near wall of the channel.\n\n" +
        "Width: The width of the channel — the span between the two purfling lines.",
        "Purfling", defaultTTL, true
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
        "The thickness of the plate at the outer edge.\n\n",
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
        "This is a view control only — it is not saved with the recipe.\n\n" + 
        "Note there can be some clipping around the corners, as some corners will intersect our cross section line at two points. This has no effect on the exported templates.",
        "Cross-Section Station", defaultTTL, true
    )
}







export function cornerCutoffInfo() {
    info(
        "Controls where the corner arc is trimmed, setting the final length of the corner tip. Shorter values produce blunter corners; longer values produce more pronounced points.\n\n" +
        "When in doubt, leave the corner a little long — the tip gets slightly rounded during final fitting.",
        "Corner Cutoff", defaultTTL, true
    )
}

export function gougeSectionInfo() {
    info(
        "Sweep corresponds to the sweep of a real gouge tool, which is used to carve the fluting channel. Depth refers to the fluting channel depth, so its width is reported rather than set.\n\n" +
        "Small sweep cuts deep and narrow, large sweep broad and shallow. Fluting gouges typically run 8–25 mm of sweep at 1–1.5 mm depth.\n\n",
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
        "Defines the offset for the flat of the edge. This is where the fluting channel will end, leaving a flat surface around the very edge of the instrument.\n\n" + "Values typically range from 1-3mm.",
        "Land Edge", defaultTTL, true
    )
}

export function cornerGougeInfo() {
    info(
        "Left on as a default. Typically, a fluting channel is gouged out around the corners, and later the corners are carved to smoothly meet the fluting channel. This option toggles that secondary carving, which can be useful for STL exports if you wish to do this step by hand.",
        "Gouge Corners", defaultTTL, true
    )
}

export function crossArchCurveTypeInfo() {
    info(
        "Factor (0–1): 0 is raised-cosine (gentler edge rise), 1 is a classic cycloid (steeper edge, flatter crest). Percent: how much of the  cycloid is stretched across the width.\n\n" +
        "Spline: control points you place yourself.\n\n" +
        "Switching replaces the shape rather than converting it; the two have no honest translation between them.",
        "Crown Curve", defaultTTL, true
    )
}

export function crossArchCycloidControlsInfo() {
    info(
        "Factor: 0 is a raised cosine, 1 the standard cycloid. Higher fills the shoulders and tightens the crown.\n\n" +
        "Percent: how much of the curve is used, trimmed evenly from both ends.\n\n",
        "Cycloid Crown", defaultTTL, true
    )
}

export function crossArchTemplateInfo() {
    info(
        "Position defines the position of your control point accross the body width, where 50% is dead center. Height works much the same. The long arch panel defines the peak height for this curve, so height is defined as a percentage of this peak.",
        "Cross-Arch Shape", defaultTTL, true
    )
}

export function crossArchPeakInfo() {
    info(
        "Where the peak of the curve fits along the body. Real plates rarely peak dead centre.\n\n" +
        "You can move the peak +/- from the center as needed, center is defined as 50%.",
        "Crown Position", defaultTTL, true
    )
}

export function crossArchStationInfo() {
    info(
        "This button fixes your arch shape to the selected station height. Multiple stations can be pinned, and the surface curve will (attempt ^_^) to smoothly join them.\n\n" +
        "Arching on historical instruments varies about the body, but two or three stations are usually plenty to define a sensible surface.",
        "Station Pinning", defaultTTL, true
    )
}

export function transitionInfo() {
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
export function transitionError(plate: 'top' | 'bottom', y: number) {
    const label = plate === 'top' ? 'Top' : 'Back';
    error(
        `The ${label.toLowerCase()} plate's crown cannot meet its channel at station ${y.toFixed(0)} mm.\n\n` +
        "This isn't a big deal, don't worry. All it means is that a curve cannot be drawn at this point which will be tangent to the fluting edge. Usually it will be pretty close, and can be smoothed out. If you wanted to resolve this, adjust the curve so it isn't so steep at the edge.",
        `${label} Plate Transition`
    )
}
