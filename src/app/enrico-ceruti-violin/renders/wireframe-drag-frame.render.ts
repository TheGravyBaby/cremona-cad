/**
 * Invisible-interior, dashed-border hit frame drawn around the active plate's
 * wireframe. Drawn in world coordinates alongside the wireframe itself, so it
 * pans and zooms with the camera for free — no screen-pixel math needed here.
 *
 * The frame owns only drag *start*: on `pointerdown` it calls back into the
 * caller, which attaches window-level move/up listeners. That split matters
 * because every rotation tick rebuilds this element along with the rest of the
 * canvas, so anything tied to its lifetime — like pointer capture — would be
 * lost mid-drag. Window listeners survive; this element only has to answer "did
 * the drag start inside the wireframe's bounds".
 */
import { CerutiColors } from '../ceruti-types';

export function renderWireframeDragFrame(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  colors: CerutiColors,
  dragging: boolean,
  onPointerDown: (event: PointerEvent) => void,
): (g: any, ui: any) => void {
  return (g: any, ui: any): void => {
    const pad = 4; // mm
    g.append('rect')
      .attr('x', bounds.minX - pad)
      .attr('y', bounds.minY - pad)
      .attr('width', (bounds.maxX - bounds.minX) + pad * 2)
      .attr('height', (bounds.maxY - bounds.minY) + pad * 2)
      .attr('fill', 'transparent')
      .attr('stroke', colors.mouldTrace)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 3')
      .attr('vector-effect', 'non-scaling-stroke')
      .style('pointer-events', 'all')
      .style('cursor', dragging ? 'grabbing' : 'grab')
      .on('pointerdown', onPointerDown);
  };
}
