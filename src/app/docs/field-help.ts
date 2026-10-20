import { info } from '../shared/message-emitter';

// The write-up behind each ⓘ. Bound in a panel as (click)="help('id')"; an entry with no
// ⓘ yet is still kept here so the text has one home. A text beginning "TODO:" is a placeholder
// waiting to be written; the note after it says what the entry is for.

export const FIELD_HELP = {
  inset: {
    title: "Mould Inset",
    text:
      "When drawing your initial path, you are determining the 'inner' contour of the instrument. In real making, the ribs are bent around a mould, and and the top and bottom plates sit over the rib line." + 
      "Final outer edge = mould edge + rib thickness + overhang.\n\n" +
      "Standard rib thicknesses:\n" +
      "- Violin: 1.0 mm\n" +
      "- Viola: 1.1 mm\n" +
      "- Cello: 1.3–1.6 mm\n" +
      "- Bass: 2.5–3.0 mm\n\n" +
      "Overhang is typically 2–5 mm.\n\n" +
      "If you are tracing from a reference image,  the purfling's inner edge can sometimes be a guide for the mould outline as some makers align it with the ribs.",
  },
  dimension: {
    title: "Body Dimensions",
    text:
      "The 'outer' dimensions of the finished instrument — height (overall length) and lower bout width.\n\n" +
      "For historical instruments these are usually documented online.",
  },
  boutWidth: {
    title: "Bout Width",
    text:
      "These are outer measurements — they include rib thickness and overhang. Outer measurements are used to conform with most published values. The arc values are used to draw the inner edge of the instrument.",
  },
  violNeck: {
    title: "Viol Neck",
    text:
      "Replaces the standard upper block geometry with a rounded neck profile common on viols, gambas, and double basses.",
  },
  violNeckJoin: {
    title: "Neck Join Radius",
    text:
      "Historical instruments have various degrees of rounding at their necks. These controls alter the degree of rounding.",
  },
  violCorner: {
    title: "Viol Corner",
    text:
      "The viol corner draws a single continuous arc from the bout to the corner tip, replacing the two-arc Cremonese corner. Common on viols and double basses.",
  },
  centerBoutWidth: {
    title: "Center Bout Width",
    text:
      "The width at the narrowest point of the instrument body. Like the bout widths, this is an outer measurement — it includes rib thickness and overhang.",
  },
  fitC0: {
    title: "Fit C0",
    text:
      "The center-bout arc (C0) can be constrained to cleanly intersect both the upper and lower bout arcs — a method drawn from Kevin Kelly's four-circles violin theory.\n\n" +
      "Not all instruments follow this geometry. By default, C0's X and Y position can be set freely.",
  },
  cornerPosition: {
    title: "Corner Position",
    text:
      "The XY coordinates for the corner tips. The corner arcs are drawn to meet at this point.\n\n" +
      "The default position is a good starting point, or helpful to reset if your values get out of bounds.",
  },
  compoundArc: {
    title: "Compound Arc",
    text:
      "A compound arc splits a single arc into two. This allows more pronounced corner than a single arc permits.\n\n" +
      "The secondary arc is typically smaller than the primary. The sweep is how far the second arc turns, in degrees.\n\n" +
      "Some Cremonese instruments feature a flat section as the bout approaches the arc, this can be approximated by using a compound arc with a very large primary arc radius.",
  },
  cornerCutoff: {
    title: "Corner Cutoff",
    text:
      "Controls where the corner arc is trimmed, setting the final shape of the corner.",
  },
  button: {
    title: "Button",
    text:
      "The button is the small semicircular tab at the top of the upper bout on the back plate. It reinforces the neck joint, and the heel of the neck is finished flush to it.\n\n" +
      "Violin: 20–22mm wide, 10–14mm high. It appears only on the back — not on the top plate.",
  },
  bitDiameter: {
    title: "Bit Diameter",
    text:
      "The diameter of the CNC router bit used to cut the mould. Strict 90° interior corners aren't achievable on a CNC; this value adds relief so corner blocks can seat properly.\n\n" +
      "Set to 0 if cutting by hand.",
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
      "These values define the rib height at the upper and lower bounds of the instrument. Cremonose violins featured a slight taper. Once the back was fastened to the ribs, the top edge would be planed down at a slight angle such that the top was thinner than the bottom.\n\n" +
      "In this model, the back will always be square to the rib line, while the top angles slightly.\n" +
      "Typical values, at the lower end:\n\n" +
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
    title: "Long Arch Curve",
    text:
      "A catenary curve can be drawn by tracing a hanging rope or chain. There are many theories which suggest the long arch of a violin is an inverted catenary.\n\n" +
      "A spline curves simulates the bending of a wooden spline through varios control points. This allows for a more complex curve and was a known curve drawing technique for Cremonese makers.",
  },
  crossSectionStation: {
    title: "Cross-Section Station",
    text:
      "By sliding the station height bar you can adjust which section of the cross arch you view on the canvas.\n\n" +
      "It is possible that Cremonese makers used different cross arch curves at different heights along the instrument. In order to simulate this, you may use the 'Set Station at' to set unique curves at different heights along the body. CremonaCad will do its best to smoothly join these defined sections.",
  },
  gougeCBout: {
    title: "C-Bout Channel",
    text:
      "Usually the fluting channel narrows along the center bout.",
  },
  cornerGouge: {
    title: "Gouge Corners",
    text:
      "Left on as a default. When carving the fluting channel, usually the corners are bypassed on the first pass. The area around the corners is later smoothly joined to the fluting channel.\n\n" + 
      "CremonaCad supports STL exports of the top and back plates. If this toggle is on, a smooth join (as smooth as possible :P) will be made between the corner edge and the fluting channel. This can be useful for CNC making.",
  },
  notches: {
    title: "Notch Toggle",
    text: 
    "Some notches are big, some notches are small; some are wide, some are tall. \n\nIf these notches do not suite thee, toggle them off, to cut them yourself you are free."
  },
  crossArchCurveType: {
    title: "Cross Arching",
    text:
      "The cross arch model supports catenaries and splines much like the long arch, but also allows for cycloid curves. A cycloid is a curve drawn by tracking a point within a circle as it rotates along a plane. Cycloid factor indicates how far along the radius the draw point is selected. Percentage will scale a 'window' of the cycloid over the cross sectional distance." ,
  },
  volute: {
    title: "Volute Style",
    text: "There are many ways to draw spirals, and many methods that would have been known in Rennaisance Italy. Included are several historical methods for drawing volutes, as well as a custom method that allows for unique arcs per turn. "
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
  bridgeHeight: {
    title: "Bridge Height",
    text:
      "The bridge's height from its feet to the string notches, on the centerline. " +
      "The feet stand on the arch at the bridge line, so the strings stand arch plus bridge above the edge.\n\n" +
      "Violin bridges finish around 33 mm. Raise it and the strings sit higher over the fingerboard's end.",
  },
} as const satisfies Record<string, { title: string; text: string }>;

export type FieldHelpId = keyof typeof FIELD_HELP;

const TTL = 30000;

export function showFieldHelp(id: FieldHelpId): void {
  const h = FIELD_HELP[id];
  info(h.text, h.title, TTL, true);
}
