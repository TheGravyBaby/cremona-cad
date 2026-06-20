import { info } from "../shared/message-emitter";

const defaultTTL = 30000

export function referenceInfo() {
    info(
        "Uploading a reference image can be helpful when you want to trace the outline of an existing instrument. \n\n" +
        "It is recommended that first you find the height and width of your reference instrument in mm and enter that into primary dimension fields below. \n\n" +
        "Then, upload your reference image and click the 'Reference' button on the bottom bar. This will allow you to scale the reference to your desired dimensions.",
        "Additional Information", defaultTTL
    );
}

export function insetInfo() {
    info(
        "Standard rib thicknesses for instrumments are : \n" +
        "- Violins: 1.0 mm\n" +
        "- Violas: 1.1 mm\n" +
        "- Cellos: 1.3 - 1.6 mm\n" +
        "- Basses: 2.5 - 3.0 mm\n\n" +
        "The overhang is more of a personal preference, but typically falls in the range of 2-5mm.\n\n-- \n\n" + 
        "When creating the mould of a violin, we do so at some inset value from the final dimensions of our face.\n\n" +
        "The final dimensions will be the sum of the mould outline, the rib thickness and the overhang.\n\n" +
        "If you are tracing a mould from an initial reference, it is recommended you use the purfling as a guide. " +
        "There is no hard rule, but often the inner edge of the purfling corresponds to the inner edge of the ribs. " +
        "This would this be a sensible target for the mould outline, but always use your best judgement :]",

        "Additional Information", defaultTTL
    );
}

export function dimensionInfo() {
    info(
        "The outer dimensions of the finished instrument. For historical instruments, these are usually available online.\n\n" +
        "The lower bout width is always the widest point. Many historical instruments height and width related to one another as simple whole number ratios.",
        "Additional Information", defaultTTL
    )
}

export function boutWidthInfo() {
    info(
        "The 'total width' of the bout should include the rib thickness + overhang. This is the OUTER width.\n\n" +
        "Remember, we are first forming the inner trace which is used for the mould outline. The final dimensions of the instrument will be the sum of the mould outline, the rib thickness and the overhang.\n\n" + 
        "Note: If the top of your instrument is too high for your reference image, you may need to either rescale the image, or adjust the height in the previous panel.",
        "Additional Information", defaultTTL
    )
}

export function violNeckInfo() {
    info(
        "The viol neck option replaces the standard upper block geometry with a rounded neck profile commonly used on double basses.\n\n Still a work in progress, there may be bugs.",
        "Additional Information", defaultTTL
    )
}

export function violCornerInfo() {
    info(
        "Also known as a bass corner or gamba corner - this button will draw a single arc from the bout to the corner.x",
        "Additional Information", defaultTTL
    )
}

export function buttonInfo() {
    info(
        "The button is the small semicircular projection at the top of the upper bout on the back of the instrument.\n\n" +
        "It reinforces the neck joint and is only present on the back plate — it does not appear on the top.",
        "Additional Information", defaultTTL
    )
}

export function centerBoutWidthInfo() {
    info(
        "The 'total width' of the bout should include the rib thickness + overhang. This is the OUTER width.",
        "Additional Information", defaultTTL
    )
}

export function fitC0Info() {
    info(
        "This button ensures the center bout C0 will always be positioned such that it cleanly intersects the upper and lower bout arcs.\n\n" +
        "This is based on Kevin Kellys 'four circles' violin theory. Not all instruments follow this pattern and so it is togglable.\n\n" +
        "If disabled, C0 X and Y position can be adjusted. ",
        "Additional Information", defaultTTL
    )
}

export function cornerPositionInfo() {
    info(
        "The X and Y coordinates define the location of the corner. The corner arcs will be drawn to meet this point. Corners always come to a point within the inset measurements. \n\n",
        "Additional Information", defaultTTL
    )
}

export function bitDiameterInfo() {
    info(
        "The diameter of the router bit used to cut the mould. This will affect how the corners of the blocks are cut. Hard 90 degree corners don't work well on CNC machines, this will ensure the blocks can be fit properly..\n\n" +
        "If not cutting the mould from CNC, set this value to 0.",
        "Additional Information", defaultTTL
    )
}

export function channelDepthInfo() {
    info(
        "The distance between the outer edge of the mould and the empty space on the inside.",
        "Additional Information", defaultTTL
    )
}

export function compoundArcInfo() {
    info(
        "A compound arc splits a single corner arc into two arcs joined end-to-end. This allows for more exaggerated corner shapes. \n\n" +
        "You can select the radius for the second arc, which is usually smaller than its parent. The split angle controls the transition point between the arcs.",
        "Compound Arc", defaultTTL
    )
}

export function purflingInfo() {
    info(
        "The purfling is an inlaid decorative strip that runs parallel to the edge of the instrument, set slightly inward from the outer edge.\n\n" +
        "Offset: the distance from the outer edge to the inner wall of the purfling channel.\n\n" +
        "Depth: the width of the channel itself — the distance between the two purfling lines.",
        "Purfling", defaultTTL
    )
}

export function flutingInfo() {
    info(
        "The fluting is a shallow carved channel in the top and back plates that runs just inside the purfling, following the contour of the instrument edge. It creates a gentle scalloped transition between the edge and the arching of the plate.\n\n" +
        "This shaded region represents the platform for the fluting — the flat reference surface that a CNC machine levels before arching begins. Carving the fluting channel itself comes later.\n\n" +
        "Width: the distance from the inner purfling wall inward to the edge of the platform.",
        "Fluting", defaultTTL
    )
}

export function cornerCutoffInfo() {
    info(
        "The cutoff angle controls how far the corner arc extends before being trimmed — this determines the final size of the corner..\n\n" +
        "The exact value is largely a matter of taste. When in doubt, err on the side of leaving the corner a bit longer, as the end will be rounded over slightly during final construction.",
        "Additional Information", defaultTTL
    )
}
