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

/** Sizes the app to the viewport that is genuinely on show, published as `--app-viewport-height`.
 *
 * `100dvh` is meant to be this and mostly is, but Chrome for iOS floats a back/forward toolbar over
 * the bottom of the page without taking it out of dvh, so the app runs a toolbar taller than the
 * screen shows and its own bottom bar hides underneath. The visual viewport is the one measurement
 * no browser fudges. app.css falls back to dvh, so nothing depends on this having run.
 *
 * Returns a teardown.
 */
export function trackViewportHeight(): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};

  const apply = () => {
    // Pinch-zoom and the on-screen keyboard shrink the visual viewport without taking anything off
    // the page. Following either would pull the layout out from under the finger or the caret — and
    // every height change redraws the whole SVG — so both hold the last measurement instead.
    if (vv.scale > 1.01) return;
    const focused = document.activeElement?.tagName;
    if (focused === 'INPUT' || focused === 'TEXTAREA' || focused === 'SELECT') return;
    document.documentElement.style.setProperty('--app-viewport-height', `${Math.round(vv.height)}px`);
  };

  // a rotation settles a frame or two after the event fires, so measure late rather than at the turn
  const onRotate = () => setTimeout(apply, 300);

  apply();
  vv.addEventListener('resize', apply);
  window.addEventListener('orientationchange', onRotate);

  return () => {
    vv.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', onRotate);
  };
}
