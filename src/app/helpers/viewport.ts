/* One definition of "too small to hold a docked bar", shared by the tool bar and the recipe panel
   so the two can't drift apart on what counts as small. */

/** A 360px recipe panel is most of a phone held in landscape. */
export const SMALL_VIEWPORT_WIDTH_PX = 900;

/** Below this the tool bar breaks into three columns and takes about half the canvas. */
export const SMALL_VIEWPORT_HEIGHT_PX = 500;

/** Whether both docked bars should start collapsed, so a small screen opens on the drawing rather
 * than on two bars over it. Either dimension being short is enough: width is what the panel costs
 * and height is what the tool bar costs, and a screen that can't carry one shouldn't open with the
 * other either. A phone fails this in both orientations; a desktop clears it. */
export function isSmallViewport(): boolean {
  return window.innerWidth < SMALL_VIEWPORT_WIDTH_PX
    || window.innerHeight < SMALL_VIEWPORT_HEIGHT_PX;
}
