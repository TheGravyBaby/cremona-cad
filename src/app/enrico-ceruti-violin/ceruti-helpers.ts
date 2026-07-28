import { info } from "../shared/message-emitter";

const defaultTTL = 30000

export function referenceInfo() {
    info(
        "A reference image lets you trace the outline of an existing instrument and scale it to real-world dimensions.\n\n" +
        "First, enter the finished height and width of the instrument in the primary dimension fields. " +
        "Then upload your image and click 'Reference' on the bottom bar to scale it to those dimensions.",
        "Additional Information", defaultTTL
    );
}

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
        "Additional Information", defaultTTL
    );
}

export function dimensionInfo() {
    info(
        "The outer dimensions of the finished instrument body — height (overall length) and lower bout width.\n\n" +
        "For historical instruments these are usually documented online. Many Cremonese instruments relate height and width as simple whole-number ratios.",
        "Additional Information", defaultTTL
    )
}

export function boutWidthInfo() {
    info(
        "These are outer measurements — they include rib thickness and overhang. The arc radii below instead define the inner mould outline.\n\n" +
        "If the instrument appears too tall relative to your reference image, adjust the height in the previous panel or rescale the image.",
        "Additional Information", defaultTTL
    )
}

export function violNeckInfo() {
    info(
        "Replaces the standard upper block geometry with a rounded neck profile common on double basses and gambas.\n\n" +
        "Still in development — expect rough edges.",
        "Additional Information", defaultTTL
    )
}

export function violCornerInfo() {
    info(
        "The gamba (bass) corner draws a single continuous arc from the bout to the corner tip, replacing the two-arc Cremonese corner. Common on viols and double basses.",
        "Additional Information", defaultTTL
    )
}

export function buttonInfo() {
    info(
        "The button is the small semicircular tab at the top of the upper bout on the back plate. It reinforces the neck joint.\n\n" +
        "It appears only on the back — not on the top plate.",
        "Additional Information", defaultTTL
    )
}

export function centerBoutWidthInfo() {
    info(
        "The width at the narrowest point of the instrument body. Like the bout widths, this is an outer measurement — it includes rib thickness and overhang.",
        "Additional Information", defaultTTL
    )
}

export function fitC0Info() {
    info(
        "The center-bout arc (C0) can be constrained to cleanly intersect both the upper and lower bout arcs — a layout derived from Kevin Kelly's four-circles violin theory.\n\n" +
        "Not all instruments follow this geometry. When disabled, C0's X and Y position can be set freely.",
        "Additional Information", defaultTTL
    )
}

export function cornerPositionInfo() {
    info(
        "The corner tip coordinates. The corner arcs are drawn to meet at this point.\n\n" +
        "Corners are always positioned within the inset boundary — the tip sits on the mould outline, not the finished plate edge.",
        "Additional Information", defaultTTL
    )
}

export function bitDiameterInfo() {
    info(
        "The diameter of the CNC router bit used to cut the mould. Strict 90° interior corners aren't achievable on a CNC; this value adds relief so corner blocks can seat properly.\n\n" +
        "Set to 0 if cutting by hand.",
        "Additional Information", defaultTTL
    )
}

export function channelDepthInfo() {
    info(
        "Width of the solid rim along the edge of the mould.\n\n" +
        "Larger values leave more material between the blocks; smaller values open the interior sooner.\n\n" +
        "Ignored when 'Use Simple Clamp Box' is on — that swaps this arc-following cutout for a plain rectangular slot.",
        "Additional Information", defaultTTL
    )
}

export function compoundArcInfo() {
    info(
        "A compound arc splits one corner arc into two, joined end-to-end. This allows more pronounced or S-curved corner shapes than a single arc permits.\n\n" +
        "Radius 2 is the secondary arc, typically smaller than the primary. The split angle sets the transition point between them.",
        "Compound Arc", defaultTTL
    )
}

export function purflingInfo() {
    info(
        "Purfling is a narrow inlaid strip set just inside the plate edge. The channel is routed into the plate surface before the strip is glued in.\n\n" +
        "Offset: distance from the outer plate edge to the near wall of the channel.\n\n" +
        "Width: The width of the channel — the span between the two purfling lines.",
        "Additional Information", defaultTTL
    )
}

export function flutingInfo() {
    info(
        "Both values are measured from the outer plate edge inward; the channel's actual width is Reach minus Offset.\n\n" +
        "Offset: distance from the outer edge to the platform's outer boundary.\n\n" +
        "Reach: distance from the outer edge to the platform's inner boundary, where the cross arch takes off.\n\n" +
        "C Bout: overrides Reach in the center bout only, for a narrower or wider channel there.",
        "Additional Information", defaultTTL
    )
}

export function flatPlatformInfo() {
    info(
        "Leaves the fluting platform flat at the plate surface — the state you cut purfling on and join the arching to before the channel is gouged.\n\n" +
        "Turn off to see the finished carved channel.",
        "Flat Platform", defaultTTL
    )
}

export function archContoursInfo() {
    info(
        "Once the long and cross arches are set, the surface can be viewed as a contour map or a wireframe mesh — drag the view box to rotate either.\n\n" +
        "The wireframe's edge is interpolated between frame lines rather than the true edge contour, and the contour map can look 'fuzzy' near the edges. Neither affects the final STL, which uses the clean edge defined earlier.",
        "Additional Info", defaultTTL
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
        "Additional Info", defaultTTL
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
        "Additional Info", defaultTTL
    )
}

export function plateThicknessInfo() {
    info(
        "The thickness of the plate at the outer edge.\n\n" +
        "Typical edge thicknesses:\n" +
        "- Violin top: 2.3–2.8 mm  |  back: 2.8–3.5 mm\n" +
        "- Viola: slightly heavier than violin\n" +
        "- Cello top: 4.0–5.0 mm  |  back: 5.0–6.0 mm",
        "Plate Thickness", defaultTTL
    )
}

export function trochoidFactorInfo() {
    info(
        "Controls the shape within the trochoid (roulette) family of curves, all of which peak at the same height.\n\n" +
        "- d = 0: raised cosine — gradual, symmetric rise from the edge.\n" +
        "- d = 1: standard cycloid — steeper rise from the edge, noticeably flatter near the peak.\n" +
        "- Values between blend the two characters.\n\n" +
        "Geometrically, the cycloid is traced by a point at radius d·r on a circle of radius r rolling along the baseline. " +
        "The module guide (when enabled) shows the generating circle at the arch midpoint.",
        "Trochoid Factor", defaultTTL
    )
}

export function curveTypeInfo() {
    info(
        "Two arch profiles are available:\n\n" +
        "Catenary — the curve formed by a hanging chain, inverted. Naturally smooth and symmetric; a good starting point.\n\n" +
        "Spline — a cubic spline through user-placed control points. The curve holds to the heights you set and never rises above them, so two points at the same height give a flat run between them. Many cremonese instruments used a spline based curve.",
        "Arch Curve Type", defaultTTL
    )
}

export function splinePointInfo() {
    info(
        "Each control point pins the arch at a specific height and position along the plate length.\n\n" +
        "Position (0–100): how far along the half-span from the plate edge to the arch peak. " +
        "0 = plate edge (always z = 0), 100 = center peak (always z = arch height). " +
        "Interior points are in between.\n\n" +
        "Height (mm): arch height at this position, measured above the plate outer edge — same unit as the Arch Height field.\n\n" +
        "The curve is symmetric: each point mirrors to the opposite half of the plate automatically.",
        "Spline Control Point", defaultTTL
    )
}

export function crossSectionStationInfo() {
    info(
        "Selects which cross section of the body you are viewing — the position along the body length (Y), " +
        "measured in mm from the bottom of the instrument.\n\n" +
        "This is a view control only — it is not saved with the recipe.",
        "Additional Info", defaultTTL
    )
}

export function crossArchCycloidControlsInfo() {
    info(
        "These two controls shape how the cross-arch rises from the edge while keeping the center peak anchored to the long arch.\n\n" +
        "Cycloid Factor (0–1): chooses the trochoid-family curve character. 0 is raised-cosine-like (gentler edge rise), 1 is classic cycloid (steeper edge rise, flatter near the crest).\n\n" +
        "Cycloid Percentage (%): chooses how much of the full cycloid is stretched across the plate width. Lower values trim flatter cusp ends and map a steeper central portion onto the same span, increasing edge takeoff angle.",
        "Cross-Arch Cycloid Controls", defaultTTL
    )
}

export function crossArchEdgeDepthInfo() {
    info(
        "Lowers the point where the long and cross arches take off from the plate edge, measured in mm below the plate outer surface.\n\n" +
        "This is primarily used to control the degree of curvature along the fluting.\n\n" +
        "Values of 0.5–2 mm are typical.",
        "Additional Info", defaultTTL
    )
}

export function cornerCutoffInfo() {
    info(
        "Controls where the corner arc is trimmed, setting the final length of the corner tip. Shorter values produce blunter corners; longer values produce more pronounced points.\n\n" +
        "When in doubt, leave the corner a little long — the tip gets slightly rounded during final fitting and varnishing.",
        "Additional Information", defaultTTL
    )
}
