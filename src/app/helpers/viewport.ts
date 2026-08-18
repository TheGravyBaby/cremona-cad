/* One definition of "too small to hold a docked bar", shared by the tool bar and the recipe panel
   so the two can't drift apart on what counts as small. */

/** A 360px recipe panel is most of a phone in landscape; below 500px tall the tool bar breaks into
 * three columns and takes about half the canvas. Either being short is enough — a screen that
 * can't carry one bar shouldn't open with the other either. */
const WIDTH_PX = 900;
const HEIGHT_PX = 500;

/** Whether both docked bars should start collapsed, so a small screen opens on the drawing rather
 * than on two bars over it. A phone fails this in both orientations; a desktop clears it. */
export function isSmallViewport(): boolean {
  return window.innerWidth < WIDTH_PX || window.innerHeight < HEIGHT_PX;
}
