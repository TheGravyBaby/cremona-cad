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
        "The mould is the form around which ribs are bent and shaped. It sits inset from the finished plate edge by the combined thickness of the rib and the overhang.\n\n" +
        "Final outer edge = mould edge + rib thickness + overhang.\n\n" +
        "Standard rib thicknesses:\n" +
        "- Violin: 1.0 mm\n" +
        "- Viola: 1.1 mm\n" +
        "- Cello: 1.3–1.6 mm\n" +
        "- Bass: 2.5–3.0 mm\n\n" +
        "Overhang is typically 2–5 mm.\n\n" +
        "If tracing from a reference image, the inner edge of the purfling is a reliable guide for the mould outline — " +
        "it commonly aligns with the inner edge of the ribs.",
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
        "The widths of the upper and lower bouts are outer measurements — they include rib thickness and overhang.\n\n" +
        "The arc segments define the inner mould outline; the finished plate will extend beyond by rib thickness + overhang.\n\n" +
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
        "The wall thickness of the mould — the distance from the outer mould edge to the open interior cavity. Deeper channels make a stiffer mould; shallower ones use less material.",
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
        "Depth: width of the channel — the span between the two purfling lines.",
        "Purfling", defaultTTL
    )
}

export function flutingInfo() {
    info(
        "The fluting is a shallow cove carved between the purfling and the rising arch of the plate. It creates the characteristic scalloped transition at the edge.\n\n" +
        "This shaded region shows the flat platform — the reference surface from which the fluting is carved downward.\n\n" +
        "Width: distance from the inner purfling wall inward to the platform edge.",
        "Fluting", defaultTTL
    )
}

export function cornerCutoffInfo() {
    info(
        "Controls where the corner arc is trimmed, setting the final length of the corner tip. Shorter values produce blunter corners; longer values produce more pronounced points.\n\n" +
        "When in doubt, leave the corner a little long — the tip gets slightly rounded during final fitting and varnishing.",
        "Additional Information", defaultTTL
    )
}
