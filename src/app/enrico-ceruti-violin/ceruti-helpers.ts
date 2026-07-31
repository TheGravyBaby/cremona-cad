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

export function flutingInfo() {
    info(
        "Both values are measured from the outer plate edge inward; the channel's actual width is Reach minus Offset.\n\n" +
        "Offset: distance from the outer edge to the platform's outer boundary.\n\n" +
        "Reach: distance from the outer edge to the platform's inner boundary, where the cross arch takes off.\n\n" +
        "C Bout: overrides Reach in the center bout only, for a narrower or wider channel there.",
        "Fluting", defaultTTL, true
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
        "Once the long and cross arches are set, the surface can be viewed as a contour map or a wireframe mesh — drag the view box to rotate either.\n\n" +
        "The wireframe's edge is interpolated between frame lines rather than the true edge contour, and the contour map can look 'fuzzy' near the edges. Neither affects the final STL, which uses the clean edge defined earlier.",
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
        "Controls the shape within the trochoid (roulette) family of curves, all of which peak at the same height.\n\n" +
        "- d = 0: raised cosine — gradual, symmetric rise from the edge.\n" +
        "- d = 1: standard cycloid — steeper rise from the edge, noticeably flatter near the peak.\n" +
        "- Values between blend the two characters.\n\n" +
        "Geometrically, the cycloid is traced by a point at radius d·r on a circle of radius r rolling along the baseline. " +
        "The module guide (when enabled) shows the generating circle at the arch midpoint.",
        "Trochoid Factor", defaultTTL, true
    )
}

export function curveTypeInfo() {
    info(
        "Two arch profiles are available:\n\n" +
        "Catenary — the curve formed by a hanging chain, inverted. Naturally smooth and symmetric; a good starting point.\n\n" +
        "Spline — a cubic spline through user-placed control points. The curve holds to the heights you set and never rises above them, so two points at the same height give a flat run between them. Many cremonese instruments used a spline based curve.",
        "Arch Curve Type", defaultTTL, true
    )
}

export function splinePointInfo() {
    info(
        "Each control point pins the arch at a specific height and position along the plate length.\n\n" +
        "Position (0–100): how far along the full plate length, 0 = upper edge, 100 = lower edge. " +
        "Both edges are always z = 0.\n\n" +
        "Height (mm): arch height at this position, measured above the plate outer edge — same unit as the Arch Height field.\n\n" +
        "Peak: the first row is the arch peak — it always sits at the Arch Height, but you can move it along the plate. " +
        "Off 50 gives an arch that is asymmetric end to end.\n\n" +
        "Mirror: on (the default) the point repeats at the same distance from the other end of the plate, " +
        "mirrored about the plate's mid-length. Turn it off to shape one end independently.",
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
        "These two controls shape how the cross-arch rises from the edge while keeping the center peak anchored to the long arch.\n\n" +
        "Cycloid Factor (0–1): chooses the trochoid-family curve character. 0 is raised-cosine-like (gentler edge rise), 1 is classic cycloid (steeper edge rise, flatter near the crest).\n\n" +
        "Cycloid Percentage (%): chooses how much of the full cycloid is stretched across the plate width. Lower values trim flatter cusp ends and map a steeper central portion onto the same span, increasing edge takeoff angle.",
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
        "By default one cross-arch shape is used the whole length of the plate. A station pins a different shape at one body position — the arch then ramps smoothly from the plate's own Factor/Percent at the ends, through each station, and back.\n\n" +
        "To add one: dial in the shape you want with the plate's Factor/Percent fields, move the section height to where it should apply, then press Set Station.\n\n" +
        "To change one: move the section height onto it (or click its row in the table). The plate's Factor/Percent fields then edit that station instead of the plate ends, and say so above them.\n\n" +
        "Historic arching is rarely uniform — corner sections tend to run flatter, the lower bout fuller. Two or three stations are usually plenty.",
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
        "Each control point pins the cross arch at a specific height and position across the plate width.\n\n" +
        "Position (0–100): how far across the full width, 0 = left fluting takeoff edge, 100 = right takeoff edge. Both edges are always 0%.\n\n" +
        "Height (0–100%): a FRACTION of the peak height at this body position — not mm. The peak height itself comes from the long arch and changes station to station, so points are stored as a percentage of it, the same way a cycloid's Factor/Percent are ratios rather than mm.\n\n" +
        "Peak: the first row is the arch peak — it always sits at 100% (the full local height), but you can move it across the width. Off 50 gives a cross arch that crowns closer to one edge than the other.\n\n" +
        "Mirror: on (the default) the point repeats at the same distance from the other edge, mirrored about the centerline. Turn it off to shape one side independently.",
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
        "The gouge that cuts the fluting channel — sweep radius and depth. Together they fix the channel's cross-section completely, and its width follows from them rather than being set separately.\n\n" +
        "This is the difference between this panel and the classic Cross Arching one. There the channel is worked out FROM the arch, so its shape drifts as you travel around the plate — widest and shallowest at the corners, where the two boundary lines it is measured between disagree most. Here the gouge is the given, exactly as it is at the bench: one tool, one sweep, run the whole way round.\n\n" +
        "Sweep radius is how curved the tool is: small values cut a deep narrow trough, large values a broad shallow one. Typical fluting gouges land somewhere between 8 and 25 mm of sweep at 1–1.5 mm depth.\n\n" +
        "C-Bout is an optional second, usually narrower gouge for the waist. It changes only the tool: the channel still starts at the same land edge and still cuts to the same depth, so what moves is the INNER edge — a tighter gouge simply does not reach as far in. The arcs either side of the waist no longer meet the C-bout arc head-on, but each junction is joined by a biarc solved from its neighbours' tangents, so the line stays closed and smooth at the new radius.\n\n" +
        "This is the honest way to vary the channel through the waist. Sliding the channel inward instead would drag its outer edge away from the purfling it is cut against, which is not something a maker can do.",
        "Gouge Section", defaultTTL, true
    )
}

export function gougeCenterlineInfo() {
    info(
        "Where the flat land ends and the channel begins, measured inward from the plate edge. This is the same measurement as the Outer Path panel's Outer Fluting Depth — it is repeated here because the channel is anchored to it.\n\n" +
        "The channel has no position of its own. It starts at this edge and grows inward by whatever the gouge cuts, so the inner edge shown below is a RESULT, not a setting. In the classic model both edges are set by hand and the channel is whatever fits between them; here you cut to a line with a tool, and the far side falls where it falls.\n\n" +
        "Both plates share this edge. It belongs to the outline and the purfling, not to either gouge, so a top and a back with different gouges still start their channels in the same place.\n\n" +
        "The channel bypasses the corners rather than following them — a maker does not steer the gouge into a corner point, they run past and gouge the leftover wood out afterwards. The land edge DOES follow the corners, because the purfling does. That disagreement is the corner-join area this panel shades, and it is the only place the two part company.\n\n" +
        "To narrow the channel through the waist, set a C-bout sweep on the plate below rather than moving the line: same edge, same depth, smaller tool.",
        "Land Edge", defaultTTL, true
    )
}

export function classicChannelDiagnosticInfo() {
    info(
        "Plots what the CLASSIC arching model's channel actually does, as a ribbon beside the fluting line — bulging where the value is high, flat where it is steady.\n\n" +
        "In that model the channel is derived: a circle is fitted through both platform boundaries, tangent to the arch. Its width and its sweep radius are therefore outputs, and they drift as you travel around the plate.\n\n" +
        "This is the evidence for whether the gouged model is worth the trouble. A real gouge cannot change sweep as it travels, so every millimetre of swing shown here is geometry the classic model asks for that no maker could actually cut. If the ribbon is nearly flat, the two models will look much the same; if it swings hard at the corners and C-bouts, they will not.",
        "Classic Channel Diagnostic", defaultTTL, true
    )
}

export function gougedCrossCurveTypeInfo() {
    info(
        "How the crown across the plate is described. Both feed the same solve — only the way you author the shape changes.\n\n" +
        "Cycloid: a trochoid, set by two numbers. The same curve family the classic cross arching offers, so switching a plate between the two models compares the CHANNELS rather than changing the crown at the same time.\n\n" +
        "Spline: control points you place yourself, in percentages of the local half-width and arch height. More work, and the only way to make the two sides differ.\n\n" +
        "Switching replaces the shape rather than converting it. Two numbers and a list of points describe a curve in ways that have no honest translation between them, so carrying one across would be inventing values you never chose.",
        "Crown Curve", defaultTTL, true
    )
}

export function gougedCrossCycloidControlsInfo() {
    info(
        "Cycloid factor: 0 is a raised cosine, 1 the standard cycloid. Higher fills the shoulders and tightens the crown.\n\n" +
        "Percent: how much of the curve is used, trimmed evenly from both ends.\n\n" +
        "It does more work here than it does classically. In the classic model the channel is BUILT to meet whatever slope the arch arrives with. Here the channel is already cut, and its flank has a definite slope everywhere except at the very bottom — so how steeply the crown runs out decides WHERE ALONG THAT FLANK the two can meet. A gentle run-out has to find a gentle part of the channel, which is near its trough; a steep one meets it high up, close to the edge.\n\n" +
        "Which way the percent moves that depends on the cycloid factor, because the two ends of the curve are not the same thing at both extremes. Below about 0.8 the ends are flat, so opening the window flattens the run-out and draws the contact inward. At 1 the ends are cusps — the steepest part of the whole curve — and opening it does the opposite. Watch the section rather than reasoning it out.\n\n" +
        "It stops short of 100 because the very end of a flat-ended curve can only meet the channel at the bottom of the trough, where the tangency has nowhere left to slide.",
        "Cycloid Crown", defaultTTL, true
    )
}

export function gougedCrossTemplateInfo() {
    info(
        "The crown shape across the plate, both axes as percentages.\n\n" +
        "Position runs from 0 at the joint to ±100 where the crown runs into the channel; negative is the bass side. It is measured across the plate, not out from the crown, so moving the Peak leaves your points where you put them. Height is a percent of the local arch height, so the crown is always 100.\n\n" +
        "Percentages rather than millimetres, because what carries from station to station is a SHAPE. Fixed distances make the crown a rigid object of one size, and the plate it sits on is not one size — carried onto a narrower station a fixed-width crown swells to fill it, and the section reads wrong even though every number is what you typed.\n\n" +
        "You do not set where the arch ends. The last stretch — the run out into the channel — is solved so the arch meets it tangentially, and the contact slides along the channel's inner flank to wherever that works out. This is why the channel keeps a crisp, constant outer edge while the recurve shoulder inside it varies, which is what one sees on real instruments.\n\n" +
        "Mirror: on repeats the knot on the other side. Turn it off to shape the bass and treble sides independently.",
        "Cross-Arch Shape", defaultTTL, true
    )
}

export function gougedCrossPeakInfo() {
    info(
        "Where the crown sits across the plate. 50 puts it on the joint; lower moves it to the bass side.\n\n" +
        "Real plates rarely peak dead centre, and a CT section traced onto a crown pinned to the joint has to absorb that error somewhere else in the shape — usually as knots that no longer describe the arch they came from.\n\n" +
        "Moving it does not tilt the arch. The crown stays a genuine smooth high point at the long arch's height, because it is still an interior knot of the section curve; what changes is that the two sides now have different widths to cover.\n\n" +
        "Nor does it drag the control points along. Their positions are measured from the joint, so a point stays at the distance across the plate you put it at while you dial the ridge into place around it. A point can therefore end up on the far side of the crown from the side it was entered on, which is simply what the section says.\n\n" +
        "Toward each cap the ridge eases back onto the joint on its own. Where the long arch has not yet climbed clear of the channel there is no crown, and a ridge is a feature of a crown — placing one out there would only trace a fold across a part of the plate that is nearly all channel. So this is the position the ridge reaches once there is arch to carry it, which is everywhere but the last stretch into each cap.\n\n" +
        "Held to 30–70. The crown only has to stay clear of the channel to be valid, but much past this one shoulder becomes a cliff and the other most of the plate.",
        "Crown Position", defaultTTL, true
    )
}

export function gougedCrossStationInfo() {
    info(
        "By default one crown shape is used the whole length of the plate. A station pins a different shape at one body position — the crown then ramps smoothly from the plate's base shape at the ends, through each station, and back.\n\n" +
        "To add one: dial in the shape you want, move the section station to where it should apply, then press Set Station. The fields preview it there as you work, and the preview is discarded if you move off without committing.\n\n" +
        "To change one: move the section onto it, or click its row in the table. The fields then edit that station rather than the plate ends, and say so above them.\n\n" +
        "What ramps between stations is the crown's sampled shape, not the numbers that describe it, so two stations can carry entirely different point counts and still ramp. The consequence is that the fields cannot show you a shape at a position between stations — there is no trochoid factor or point list that describes a blend of two. They show the nearest station's shape instead, and any edit opens a new station where you are rather than reaching back to it.\n\n" +
        "The run-out into the channel is solved separately at every station regardless, so a shape carried across a narrowing plate still meets its channel tangentially — the contact point simply lands somewhere else. Historic arching is rarely uniform; two or three stations are usually plenty.",
        "Crown Stations", defaultTTL, true
    )
}

export function gougedTransitionInfo() {
    info(
        "Where the arch stops being the template and becomes the run into the channel. This is reported, not set.\n\n" +
        "Given the crown template and the channel, tangency is one equation, so exactly one unknown is needed to satisfy it — the contact point. Solving for it is what keeps this model from asking you for more numbers than the classic one, despite describing a more physical process.\n\n" +
        "If a station reports that no solution exists, the arch and the channel genuinely cannot meet there: the arch is too high, or the channel too close, for any tangent run between them. Real makers resolve this by quietly cheating the arch. Lower the arch height, move the channel outward, or widen the gouge.",
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
