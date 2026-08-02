import { Bounds } from './camera';

/**
 * Measures what is actually drawn on the canvas, so the camera can frame it.
 *
 * Recipes render imperatively — they hand the canvas `(g, ui) => void` closures and never expose
 * their geometry as data — so the rendered SVG is the only place the union of recipe output,
 * toolbox shapes and reference images exists. Hence `getBBox()` rather than a model-side
 * calculation: this measures the picture, not the parameters that produced it.
 *
 * Nothing here knows about violins or cameras. Callers decide which groups count (draft-canvas
 * deliberately leaves out the grid, which spans the viewport, and the selection/preview
 * decoration, which is sized in screen pixels).
 */

/** A group's own bbox, or null if it is empty or cannot be measured. */
function groupBox(group: SVGGElement | null | undefined): DOMRect | null {
  if (!group) return null;
  try {
    const box = group.getBBox();
    // An empty group reports 0×0 at the origin — that isn't geometry, and unioning it would drag
    // every fit back towards (0,0).
    if (box.width === 0 && box.height === 0) return null;
    return box;
  } catch {
    // getBBox throws on elements that were never laid out, and jsdom doesn't implement it at all.
    return null;
  }
}

/**
 * Union of the bounding boxes of `groups`, or null when none of them holds anything.
 *
 * A group's bbox is expressed in its own user space and already accounts for its children's
 * transforms, so passing sibling groups from the same parent yields boxes in one common space.
 * Inside draft-canvas's `gRoot` that space is world mm with Y up — the `scale(1,-1)` flip lives on
 * gRoot itself — which is the convention Camera.fitToBounds expects.
 */
export function unionRenderedBounds(groups: Array<SVGGElement | null | undefined>): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const group of groups) {
    const box = groupBox(group);
    if (!box) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  if (!isFinite(minX) || !isFinite(minY)) return null;
  return { pt1: { x: minX, y: minY }, pt2: { x: maxX, y: maxY } };
}
