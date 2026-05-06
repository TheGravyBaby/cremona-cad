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
