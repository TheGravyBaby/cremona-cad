import { renderPath, renderStroke } from '../../helpers/renderFuncs';
import { STROKE_WEIGHT } from '../../theme/palettes';
import { translatePath } from '../../helpers/math/pathMath';
import { EnricoCerutiParams, PathEntry } from '../ceruti-types';
import { FrontProfileSolve, getPath, getPathOrNull, hasOuterTrace, NeckProfileSolve, topPlatePaths } from '../calculation/outline/ceruti-calcs';
import { plateLayoutOffset } from '../calculation/arching/ceruti-arch-geometry';
import { defineBackNeckPath, defineFrontProfilePath, defineInnerPath, PlatePlan } from '../calculation/outline/ceruti-paths';
import { SolveFailure } from '../../helpers/validators';
import { scrollBackInPlan, scrollFrontInPlan } from '../calculation/neck/ceruti-scroll-views';
import { PanelPalette } from '../../theme/theme.service';

type Layer = (g: any, ui: any) => void;

// the rib outline as far as it's been drafted, in the trace grey, less the sections `failures` names.
// The profile for the panels that draft the outline, where the purfling and anything past it would
// be later work getting in the way of the shape being set.
export function renderFrontInnerProfile(p: EnricoCerutiParams, pal: PanelPalette, failures: SolveFailure[] = []): Layer[] {
  const inner = defineInnerPath(p, failures.flatMap(f => f.unsolved));
  return inner ? [renderPath(inner, pal.neutral.css)] : [];
}

// the top plate from its plan, the neck laid over it once the solve reached it and the scroll's front
// on the neck's end once that's drawn, both in the trace grey. `weight` is the outline's; the
// purfling is context at guide weight, the f-holes drawn as the caller says
function renderTopPlate(p: EnricoCerutiParams, plan: PlatePlan, pal: PanelPalette, weight: number, holes: { ink: string; weight: number }, solve: NeckProfileSolve): Layer[] {
  const front = solve.neck ? defineFrontProfilePath(p, plan) : null;
  const body = front ? front.body : plan;
  const layers = [renderPath(body.outline, pal.neutral.css, weight)];
  for (const d of body.purfling) layers.push(renderPath(d, pal.neutral.css, STROKE_WEIGHT.guide));
  for (const d of body.fHoles) layers.push(renderPath(d, holes.ink, holes.weight));
  if (front) layers.push(renderPath(front.neck, pal.neutral.css), renderPath(front.nut, pal.neutral.css));
  if (front && solve.scroll) for (const stroke of scrollFrontInPlan(p)) layers.push(renderStroke(stroke, pal.neutral.css));
  return layers;
}

// the whole instrument as far as it's been solved, from the front: the inner profile until the
// outer trace is reached with every section before it solved, and after that the top plate from the
// path cache `ensureFrontProfilePaths` fills. `fHoles: false` leaves the holes to a panel that draws
// them itself, `purfling: false` leaves the purfling off.
export function renderFrontProfile(
  p: EnricoCerutiParams, paths: PathEntry[], pal: PanelPalette, solve: FrontProfileSolve = { failures: [], neck: false, scroll: false },
  opts: { fHoles?: boolean; purfling?: boolean } = {},
): Layer[] {
  if (!getPathOrNull(paths, 'top') || !hasOuterTrace(p) || solve.failures.length) return renderFrontInnerProfile(p, pal, solve.failures);
  let plan = topPlatePaths(p, paths);
  if (opts.fHoles === false) plan = { ...plan, fHoles: [] };
  if (opts.purfling === false) plan = { ...plan, purfling: [] };
  return renderTopPlate(p, plan, pal, STROKE_WEIGHT.trace, { ink: pal.neutral.css, weight: STROKE_WEIGHT.trace }, solve);
}

// both plates in plan from the path cache, for the panels that work on the plates themselves: the top
// centred on x = 0, the back `plateLayoutOffset` to its left, each with the purfling. Given a solve
// that reached the neck, each carries it: the front profile's on the top, and from behind the neck's
// two sides out of the plate's edge with the scroll's back on their end. The plate panels don't ask
// for it yet (2026-10-06, proven and parked). `weight` is the outlines'; the rest is context at
// guide weight.
export function renderPlatePair(p: EnricoCerutiParams, paths: PathEntry[], pal: PanelPalette, weight: number, solve: NeckProfileSolve = { neck: false, scroll: false }): Layer[] {
  const dx = plateLayoutOffset(p, 'bottom');
  const back = (d: string) => translatePath(d, dx, 0);
  const top = topPlatePaths(p, paths);
  const backOutline = getPath(paths, 'back');
  const layers = [
    ...renderTopPlate(p, top, pal, weight, { ink: pal.neutral.css, weight: STROKE_WEIGHT.guide }, solve),
    renderPath(back(backOutline), pal.neutral.css, weight),
    ...top.purfling.map(d => renderPath(back(d), pal.neutral.css, STROKE_WEIGHT.guide)),
  ];
  if (solve.neck) {
    const neck = defineBackNeckPath(p, backOutline);
    if (neck) layers.push(renderPath(back(neck), pal.neutral.css));
    if (solve.scroll) for (const stroke of scrollBackInPlan(p, dx)) layers.push(renderStroke(stroke, pal.neutral.css));
  }
  return layers;
}
