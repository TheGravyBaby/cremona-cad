import { info } from "../shared/message-emitter";

let defaultTTL = 30000

export function referenceInfo() {
    info(
        "Uploading a reference image can be helpful when you want to trace the outline of an existing instrument. \n\n" +
        "It is recommended that first you find the height and width of your reference instrument in mm and enter that into primary dimension fields below. \n\n" +
        "Then, upload your reference image and click the 'Align Reference' button on the bottom bar. This will allow you to scale the reference to your desired dimensions.",
        "Additional Information", defaultTTL
    );
}

export function insetInfo() {
    info(
        "When creating the mould of a violin, we do so at some inset value from the final dimensions of our face.\n\n" +
        "The final dimensions will be the sum of the mould outline, the rib thickness and the overhang.\n\n" +
        "If you are tracing a mould from an initial reference, it is recommended you use the purfling as a guide. " +
        "There is no hard rule, but often the inner edge of the purfling corresponds to the inner edge of the ribs. " +
        "This would this be a sensible target for the mould outline, but always use your best judgement :]\n\n" +
        "Standard rib thicknesses for instrumments are : \n" +
        "- Violins: 1.0 mm\n" +
        "- Violas: 1.1 mm\n" +
        "- Cellos: 1.3 - 1.6 mm\n" +
        "- Basses: 2.5 - 3.0 mm\n\n" +
        "The overhang is more of a personal preference, but typically falls in the range of 2-5mm.",

        "Additional Information", defaultTTL * 2
    );
}

export function dimensionInfo() {
    info(
        "These measurements dictate the outer dimenions of the final instrument.\n\n" +
        "Most instruments in the cremonese tradition relied on simple whole number ratios for these measurements.",
        "Additional Information", defaultTTL
    )

}

export function boutWidthInfo() {
    info(
        "The total OUTER width of the bout, including the rib thickness + overhang.\n\n" +
        "Remember, we are first forming the inner trace which used for the mould outline. The final dimensions of the instrument will be the sum of the mould outline, the rib thickness and the overhang.\n\n" + 
        "Note that bout measurements can often be found for historical instruments online. ",
        "Additional Information", defaultTTL
    )
}

export function violNeckInfo() {
    info(
        "The viol neck option replaces the standard upper block geometry with a rounded neck profile commonly used on double basses.\n\n" +
        "When enabled, the upper end of the mould curves inward symmetrically, defined by a radius (V0) and a neck width.",
        "Additional Information", defaultTTL
    )
}

export function violCornerInfo() {
    info(
        "Also known as a bass corner, the viol corner draws a single arc from the bout to the corner.\n\n" +
        "When enabled, the U3/L3 corner arc is bypassed and the bout arcs flow directly into the corner position.",
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
        "The total OUTER width of the center bout, including the rib thickness + overhang.\n\n" +
        "Remember, we are tracing the inner edge for the mould — the final instrument width will be larger once the ribs and overhang are added.\n\n" +
        "Note that bout measurements can often be found for historical instruments online. ",
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
        "The X and Y coordinates define the location of the corner. The corner arcs will be drawn to meet this corner point. \n\n",
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

export function cornerCutoffInfo() {
    info(
        "The cutoff angle controls how far the corner arc extends before being trimmed — this determines the final size of the corner..\n\n" +
        "The exact value is largely a matter of taste. When in doubt, err on the side of leaving the corner a bit longer, as the end will be rounded over slightly during final construction.",
        "Additional Information", defaultTTL
    )
}
