import { Arc, Circle, Pt, Rectangle } from '../models/types';
import { defaultViolin, geometryDiff, layoutFrom, templateKeys, templateViolin } from './ceruti-fixtures';
import { EnricoCerutiParams } from './ceruti-types';

/**
 * The save-and-reopen boundary.
 *
 * `models/types.ts` opens by warning that `Pt`/`Circle`/`Arc`/`Rectangle` lose
 * their prototypes to `JSON.parse`, and that what hides this is the calc pass
 * reassigning nearly every arc through a real constructor. Two rules follow from
 * that, and breaking either fails *only* after a save and reopen — which is why
 * neither had a test until now, and why the failure would land on a user's
 * recipe rather than in CI.
 *
 * These tests make the header's rules executable.
 */

/** Round-trips a recipe through the file format, exactly as saving and reopening does. */
function throughAFile(p: EnricoCerutiParams): EnricoCerutiParams {
  return JSON.parse(JSON.stringify(p));
}

/** Every `[path, value]` in the tree that carries the four numbers an Arc is made of. */
function arcShapedFields(root: unknown, path = ''): Array<[string, any]> {
  if (!root || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap((v, i) => arcShapedFields(v, `${path}[${i}]`));
  const v = root as any;
  const isArcShaped = ['x', 'y', 'r', 'start', 'end'].every(k => typeof v[k] === 'number');
  if (isArcShaped) return [[path, v]];
  return Object.keys(v).flatMap(k => arcShapedFields(v[k], `${path}.${k}`));
}

describe('a recipe through the file format', () => {
  it('comes back numerically identical', () => {
    const p = defaultViolin();
    expect(geometryDiff(p, throughAFile(p), 0)).toEqual([]);
  });

  it('gives every arc its prototype back once the calc pass has run', () => {
    // This is the mechanism the header describes. If it stopped holding, the
    // ~13 degree inputs across the corner and bout panels would read `undefined`
    // on a reopened recipe — a blank field where a number was, on a drawing that
    // still looks right.
    //
    // The four compound-corner arcs are only reconstructed when their own
    // `*DoubleArc` option is on (ceruti-calcs.ts seeds them with `??=`, which a
    // reloaded plain object does not trigger), so this asks for the case where
    // every one of them is in play. The option-off case is the test below.
    const reloaded = throughAFile(defaultViolin());
    reloaded.options.U31DoubleArc = true;
    reloaded.options.C21DoubleArc = true;
    reloaded.options.C11DoubleArc = true;
    reloaded.options.L31DoubleArc = true;

    const beforeRecalc = arcShapedFields(reloaded.bouts, 'bouts');
    expect(beforeRecalc.length).toBeGreaterThan(8);
    expect(beforeRecalc.every(([, arc]) => arc instanceof Arc)).toBe(false);

    layoutFrom(reloaded);

    const stillPlain = arcShapedFields(reloaded.bouts, 'bouts')
      .concat(arcShapedFields(reloaded.outerCorners, 'outerCorners'))
      .filter(([, arc]) => !(arc instanceof Arc))
      .map(([at]) => at);
    expect(stillPlain).toEqual([]);
  });

  it('leaves a compound corner plain while its own option is off', () => {
    // Characterization, not an endorsement. `U31`/`L31`/`C11`/`C21` keep the
    // prototype-less form they were parsed into for as long as their option is
    // off, and each panel hides that arc's Split Angle input behind the *same*
    // flag — so the one binding that would read `undefined` is never on screen
    // while the arc is plain. Two independent conditions that happen to agree.
    //
    // The gap they leave: ticking the box on a reopened recipe reveals the field
    // immediately, but the arc is not reconstructed until the debounced calc
    // runs, so Split Angle reads blank for that moment and then fills in.
    // Changing either the gating or the `??=` seeding without the other turns
    // that into a field that stays blank — this test is what would catch it.
    const reloaded = throughAFile(defaultViolin());
    for (const flag of ['U31DoubleArc', 'C21DoubleArc', 'C11DoubleArc', 'L31DoubleArc'] as const) {
      expect(reloaded.options[flag], `${flag} should be off in the default recipe`).toBe(false);
    }
    layoutFrom(reloaded);

    const stillPlain = arcShapedFields(reloaded.bouts, 'bouts')
      .filter(([, arc]) => !(arc instanceof Arc))
      .map(([at]) => at);
    expect(stillPlain.sort()).toEqual(['bouts.C11', 'bouts.C21', 'bouts.L31', 'bouts.U31']);
  });

  it('resolves degreeDiff on a reopened recipe, which is what that mechanism is for', () => {
    const reloaded = throughAFile(defaultViolin());
    expect(reloaded.bouts.U1!.degreeDiff).toBeUndefined();

    layoutFrom(reloaded);
    expect(typeof reloaded.bouts.U1!.degreeDiff).toBe('number');
    expect(Number.isFinite(reloaded.bouts.U1!.degreeDiff)).toBe(true);
  });

  it('leaves the corner tips as plain objects — the calc pass never reconstructs them', () => {
    // `bouts.UCr`/`LCr` are the documented exception: they are written as `Pt`s
    // but nothing reassigns them after a load. Pinned rather than fixed, because
    // it is only safe while `Pt` stays method-free — which the next test
    // enforces. If you ever need a method on Pt, reconstructing these is the
    // work that has to happen first.
    const reloaded = throughAFile(defaultViolin());
    layoutFrom(reloaded);

    expect(reloaded.bouts.UCr).toBeTruthy();
    expect(reloaded.bouts.UCr instanceof Pt).toBe(false);
    expect(reloaded.bouts.LCr instanceof Pt).toBe(false);
  });
});

describe('the geometry classes that ride in a recipe', () => {
  // The rule from the types.ts header, made executable: a prototype member is
  // only safe on a class the calc pass reassigns every instance of. `Arc` earns
  // its `degreeDiff` that way. Nothing reconstructs a `Pt` (see the corner tips
  // above) or a `Rectangle` (`blocks`, `button`), so a member added to either
  // would resolve in a fresh session and be gone after a reopen.
  it.each([
    ['Pt', Pt],
    ['Rectangle', Rectangle],
    ['Circle', Circle],
  ])('%s carries no prototype members, because nothing restores them on load', (_name, cls) => {
    const members = Object.getOwnPropertyNames(cls.prototype).filter(k => k !== 'constructor');
    expect(members).toEqual([]);
  });

  it('Arc is the exception, and only because the calc pass reassigns every one', () => {
    const members = Object.getOwnPropertyNames(Arc.prototype).filter(k => k !== 'constructor');
    expect(members).toEqual(['degreeDiff']);
  });
});

describe.each(templateKeys())('template %s through the file format', key => {
  it('survives a save and reopen unchanged', () => {
    const p = templateViolin(key);
    expect(geometryDiff(p, throughAFile(p), 0)).toEqual([]);
  });

  it('re-solves identically whether loaded fresh or reopened', () => {
    const fresh = templateViolin(key);
    const reopened = throughAFile(templateViolin(key));
    layoutFrom(reopened);
    expect(geometryDiff(fresh, reopened)).toEqual([]);
  });
});
