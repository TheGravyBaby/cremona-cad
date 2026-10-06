import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './calculation/outline/ceruti-calcs';
import { defaultArchingParams } from './calculation/arching/ceruti-arching';
import { TEST_INSTRUMENTS } from './templates/test-fixtures';
import { DefaultParams, EnricoCerutiParams } from './ceruti-types';

// Test fixtures. Not imported by the app.
//
// Every spec used to open with its own copy of "deep-clone DefaultParams, run
// the four calcs" — which meant every assertion in the suite was about one
// violin at one size. The historical instruments come from templates/test-fixtures,
// frozen copies the specs own — never from the served templates, which are re-saved
// from the app whenever an instrument is retraced (see test-fixtures/index.ts).
//
// The deep clone is not incidental: the calcs mutate `p` in place, so a spec
// sharing a params object with another spec would see the first one's edits.

/**
 * Every numeric field where two recipes disagree by more than `tolMm`, as
 * readable `path: a -> b` lines.
 *
 * Recipes cannot be compared with `toEqual` or by stringifying: the C-bout and
 * corner arcs are placed by iterative solvers, so re-solving the same instrument
 * reproduces it closely rather than bit-exactly, and two of the bundled templates
 * were saved before some of that arithmetic settled.
 *
 * How close depends on the instrument. Simple corners settle to 1e-13; the
 * Kreisler, whose four corners are all compound, does not converge to machine
 * precision at all — it plateaus around 4e-7 mm and still moves 32 fields after
 * ten passes, with a 1.06e-6 excursion at the second pass, which is the one the
 * idempotency specs sample. So the tolerance is ten nanometres, not one: above
 * the solvers' demonstrated settling floor, and still five orders of magnitude
 * below anything a plate could express or a maker could measure. Tightening it
 * back to 1e-6 fails the Kreisler on solver residue rather than on geometry.
 */
export function geometryDiff(a: unknown, b: unknown, tolMm = 1e-5, path = ''): string[] {
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

/** The blank the picker starts from, as a fixture key: DefaultParams is code, not served data. */
const BLANK_KEY = 'ceruti-new';

/** Every frozen instrument, for `it.each` over the whole set. */
export function templateKeys(): string[] {
  return Object.keys(TEST_INSTRUMENTS);
}

/**
 * A frozen historical instrument, solved.
 *
 * Fixtures carry `arching` only where the instrument shipped the side profile it was read off,
 * and this leaves whatever the fixture had. Pass `withArching` to seed the ones that have none —
 * those values are the generic defaults and say nothing about the real instrument.
 */
export function templateViolin(key: string, withArching = false): EnricoCerutiParams {
  const source = key === BLANK_KEY ? DefaultParams : TEST_INSTRUMENTS[key];
  if (!source) throw new Error(`No such fixture: ${key}. Have: ${templateKeys().join(', ')}`);
  const p = layoutFrom(JSON.parse(JSON.stringify(source)));
  if (withArching && !p.arching) p.arching = defaultArchingParams(p.height);
  return p;
}

/**
 * A recipe pasted out of a running session, solved — the exact instrument
 * someone was looking at when something went wrong.
 *
 * The point is fidelity. Reproducing a report by taking the nearest template and
 * toggling options toward it gives an instrument that resembles the one in the
 * screenshot, and a bug that turns on a saved `purflingOffset` or an option
 * combination nobody would think to set will not survive the approximation.
 * Paste the recipe into a scratch spec, hand it here, and the failing case is
 * the real one.
 *
 * Takes either a recipe file (`{ params: ... }`, which is what both the download
 * and the `/` button produce) or a bare params object, and a string or an
 * already-parsed object. `layoutFrom` re-solves it, which is also what restores
 * the arc prototypes JSON.parse drops — see the `models/types.ts` header.
 */
export function violinFromRecipe(source: string | object): EnricoCerutiParams {
  const parsed = typeof source === 'string' ? JSON.parse(source) : JSON.parse(JSON.stringify(source));
  const params: EnricoCerutiParams = parsed?.params ?? parsed;
  if (!params?.bouts || !params?.options) {
    throw new Error('Not a Ceruti recipe: expected a `params` object carrying `bouts` and `options`.');
  }
  return layoutFrom(params);
}
