import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { defaultArchingParams, normalizeArchingParams } from './ceruti-arching';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { DefaultParams, EnricoCerutiParams, EnricoCerutiTemplate } from './ceruti-types';

// Test fixtures. Not imported by the app.
//
// Every spec used to open with its own copy of "deep-clone DefaultParams, run
// the four calcs" — which meant every assertion in the suite was about one
// violin at one size, and the seven historical instruments in
// ceruti-templates.ts were untestable despite shipping solved outline geometry.
//
// The deep clone is not incidental: the calcs mutate `p` in place, so a spec
// sharing a params object with another spec would see the first one's edits.

/**
 * Every numeric field where two recipes disagree by more than `tolMm`, as
 * readable `path: a -> b` lines.
 *
 * Recipes cannot be compared with `toEqual` or by stringifying: the C-bout and
 * corner arcs are placed by iterative solvers, so re-solving the same
 * instrument reproduces it to about 1e-8 rather than bit-exactly, and two of the
 * bundled templates were saved before some of that arithmetic settled. The
 * default tolerance is a nanometre — six orders of magnitude below anything a
 * plate could express — so it tolerates that residue while still failing on any
 * change a maker could measure.
 */
export function geometryDiff(a: unknown, b: unknown, tolMm = 1e-6, path = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) > tolMm ? [`${path}: ${a} -> ${b}`] : [];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap(k => geometryDiff((a as any)[k], (b as any)[k], tolMm, `${path}.${k}`));
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
}

/** Runs the 2D outline pipeline. Mutates and returns the same object, as the calcs do. */
export function layoutFrom(p: EnricoCerutiParams): EnricoCerutiParams {
  calculateMainBouts(p);
  calculateCorners(p);
  calculateCenterBout(p);
  calculateOuterArcs(p);
  return p;
}

/** A fully solved default violin, no arching. What most outline specs want. */
export function defaultViolin(): EnricoCerutiParams {
  return layoutFrom(JSON.parse(JSON.stringify(DefaultParams)));
}

/** The same, with arching seeded from the body height — the precondition for anything in ceruti-surface.ts. */
export function archedViolin(): EnricoCerutiParams {
  const p = defaultViolin();
  p.arching = defaultArchingParams(p.height);
  return p;
}

/** Every bundled instrument, as `[key, factory]` — for `it.each` over the whole set. */
export function templateKeys(): string[] {
  return CERUTI_TEMPLATES.map(t => t.key);
}

/**
 * A bundled historical instrument, solved.
 *
 * Templates ship `bouts`/`outerCorners`/`blocks` but deliberately no `arching`
 * block (see this folder's CLAUDE.md — the published arching data does not
 * exist and must not be invented), so this runs `normalizeArchingParams` for
 * the migration path and leaves `arching` undefined. Pass `withArching` only
 * where a test needs *some* arch to exercise the surface code; the values are
 * the generic defaults and say nothing about the real instrument.
 */
export function templateViolin(key: string, withArching = false): EnricoCerutiParams {
  const template = CERUTI_TEMPLATES.find(t => t.key === key);
  if (!template) throw new Error(`No such template: ${key}. Have: ${templateKeys().join(', ')}`);
  const copy: EnricoCerutiTemplate = JSON.parse(JSON.stringify(template));
  normalizeArchingParams(copy.params);
  const p = layoutFrom(copy.params);
  if (withArching && !p.arching) p.arching = defaultArchingParams(p.height);
  return p;
}
