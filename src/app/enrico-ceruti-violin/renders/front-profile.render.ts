import { renderPath } from '../../helpers/renderFuncs';
import { translatePath } from '../../helpers/math/pathMath';
import { CerutiColors, EnricoCerutiParams, PathEntry } from '../ceruti-types';
import { FrontProfileSolve, getPath, getPathOrNull, hasOuterTrace, topPlatePaths } from '../ceruti-calcs';
import { plateLayoutOffset } from '../ceruti-arch-geometry';
import { renderFrontStroke, scrollFrontInPlan } from './scroll.render';
import { defineFrontProfilePath, defineInnerPath } from '../ceruti-paths';
import { SolveFailure } from '../../helpers/validators';
import { STROKE_WEIGHT } from './render-constants';

// the rib outline as far as it's been drafted, in the trace grey, less the sections `failures` names.
// The profile for the panels that draft the outline, where the purfling and anything past it would
// be later work getting in the way of the shape being set.
export function renderFrontInnerProfile(p: EnricoCerutiParams, colors: CerutiColors, failures: SolveFailure[] = []): Array<(g: any, ui: any) => void> {
  const inner = defineInnerPath(p, failures.flatMap(f => f.unsolved));
  return inner ? [renderPath(inner, colors.innerTrace)] : [];
}

// the whole instrument as far as it's been solved, from the front, all in the trace grey: the inner
// profile until the outer trace is reached with every section before it solved. After, the top
// plate from the path cache `ensureFrontProfilePaths` fills, the neck laid over it once that solve
// reached it, with the scroll's front view on its end once that's drawn. `fHoles: false` leaves the
// holes to a panel that draws them itself.
export function renderFrontProfile(
  p: EnricoCerutiParams, paths: PathEntry[], colors: CerutiColors, solve: FrontProfileSolve = { failures: [], neck: false, scroll: false },
  opts: { fHoles?: boolean } = {},
): Array<(g: any, ui: any) => void> {
  if (!getPathOrNull(paths, 'top') || !hasOuterTrace(p) || solve.failures.length) return renderFrontInnerProfile(p, colors, solve.failures);

  let body = topPlatePaths(p, paths);
  if (opts.fHoles === false) body = { ...body, fHoles: [] };
  const front = solve.neck ? defineFrontProfilePath(p, body) : null;
  if (front) body = front.body;

  const layers = [renderPath(body.outline, colors.outerTrace)];
  for (const d of body.purfling) layers.push(renderPath(d, colors.innerTrace, STROKE_WEIGHT.guide));
  for (const d of body.fHoles) layers.push(renderPath(d, colors.outerTrace));
  if (front) layers.push(renderPath(front.neck, colors.outerTrace), renderPath(front.nut, colors.outerTrace));
  if (front && solve.scroll) for (const stroke of scrollFrontInPlan(p)) layers.push(renderFrontStroke(stroke, colors.outerTrace));
  return layers;
}

// both plates in plan from the path cache, for the panels that work on the plates themselves: the top
// centred on x = 0 with its f-holes once placed, the back `plateLayoutOffset` to its left, each with
// the purfling. `weight` is the outlines'; the purfling and holes are context at guide weight.
export function renderPlatePair(p: EnricoCerutiParams, paths: PathEntry[], colors: CerutiColors, weight: number): Array<(g: any, ui: any) => void> {
  const top = topPlatePaths(p, paths);
  const dx = plateLayoutOffset(p, 'bottom');
  const back = (d: string) => translatePath(d, dx, 0);
  return [
    renderPath(top.outline, colors.outerTrace, weight),
    ...top.purfling.map(d => renderPath(d, colors.innerTrace, STROKE_WEIGHT.guide)),
    ...top.fHoles.map(d => renderPath(d, colors.innerTrace, STROKE_WEIGHT.guide)),
    renderPath(back(getPath(paths, 'back')), colors.outerTrace, weight),
    ...top.purfling.map(d => renderPath(back(d), colors.innerTrace, STROKE_WEIGHT.guide)),
  ];
}
