# Cremona CAD

Angular app for drafting violin-family instruments from parameters (bout widths, corner
placements, cutoff angles) rather than traced coordinates. Parameters carry through to purfling,
fluting, arching and the mould; designs export as SVG/PDF/DXF for templates and STL for CNC.

## Commands

```bash
ng serve        # dev server, localhost:4200
ng test         # vitest, ~20s wall, ~970 tests — full suite, run before considering work done
ng build
```

### Scoped test runs

It's worth running only the area you touched while iterating, then the full `ng test` once
before finishing. Each scoped script is `ng test --watch=false` with an `--include`/`--exclude`
glob; see them in `package.json` if you need a variant. Timings are wall-clock, single run, and
about 6s of each is the build before any test starts:

| Script | Covers | Time |
|---|---|---|
| `npm run test:outline` | `calculation/outline/**`, `calculation/neck/**`, `ceruti-serialization`, `templates/*` — the 2D outline pipeline, plus the neck set and the scroll | ~10s |
| `npm run test:arching` | `calculation/arching/**` — the 3D arching pipeline, the specialist math | ~13s |
| `npm run test:panels` | `enrico-ceruti-violin/panels/**` — panel wiring + SVG/DXF/STL export | ~13s |
| `npm run test:draft-canvas` | `draft-canvas/**` — canvas, camera, snapping, tools | ~10s |
| `npm run test:helpers` | `helpers/**` — instrument-agnostic math, renderers, exporters | ~8s |
| `npm run test:shell` | `app.spec.ts`, `docs/**`, `shared/**`, `top-bar/**`, `hello-world-recipe/**`, `recipe-base/**` | ~11s |
| `npm run test:fast` | everything except `test:arching` and `test:panels` | ~13s |

These mirror the Layout table below plus the 2D/3D pipeline split documented in
`enrico-ceruti-violin/CLAUDE.md`. If you add a spec file, check it lands in the group you'd
expect — a stray file outside these globs only runs under the full `ng test`.

## Layout

| Path | What lives there |
|---|---|
| `src/app/enrico-ceruti-violin/` | The one real instrument model. Has its own CLAUDE.md. |
| `src/app/draft-canvas/` | SVG canvas, camera, snapping, pointer routing. |
| `src/app/draft-canvas/tools/` | Pluggable drafting tools + shape store. Has its own CLAUDE.md. |
| `src/app/helpers/` | Instrument-agnostic math, rendering, exporters. Has its own CLAUDE.md. |
| `src/app/models/types.ts` | `Pt`/`Circle`/`Arc`/`Rectangle` — recipe-side geometry. Read its header. |
| `src/app/recipe-base/` | `RecipeComponentBase` — panel flow, undo/redo, file load/save, toolbox sync. |
| `src/app/shared/` | Message/toast service. |
| `src/app/docs/` | Every word the app says to the user, in one place. `field-help.ts` is the ⓘ write-ups (`help('id')` in a panel); `tooltips.ts` the explanatory tooltips, bound as `docTip="id"`, a tooltip that only names a control stays a literal `title=`; `conditions.ts` the toasts that run to a paragraph; `export-descriptions.ts` the export rows; `guide/` the Documentation tab. The change log is `CHANGELOG.md` at the root, rendered in the about modal. See `docs/documentation-plan.md`. |
| `src/app/docs/wiki/` | The wiki: Markdown articles under `articles/` (folders allowed), imported as text, parsed into a registry the wiki component renders and `wiki.spec.ts` lints. One article per concept; `[[slug]]` links between them; figures under `public/wiki/`. Dev builds only, for now. |
| `examples/` | **Not built, not tested.** Outside `tsconfig.app.json` and `tsconfig.spec.json`. |

`examples/beard-violin` and `examples/kelly-violin` are earlier recipe implementations kept for
reference. `examples/beard-violin.spec.ts` does not run. Don't fix, refactor or lint anything
under `examples/` unless asked for it by name.

## Where logic belongs

Sort by what the code knows, not by what feature it serves:

- **`calculation/` (`ceruti-calcs.ts` and friends)** — math that knows it's a violin. Takes `EnricoCerutiParams`,
  encodes instrument proportions.
- **`helpers/math/` (`simpleGeometry.ts`, `draftMath.ts`, `vibeMath.ts`)** — math that doesn't.
  Intersections, clamping, angle normalization, spline/catenary solvers, split by how far the
  math is from something you could do with a compass and straightedge — see `helpers/CLAUDE.md`.
  If it doesn't need to know it's a violin, it goes in one of these rather than becoming a private
  method on a component.
- **`helpers/renderFuncs.ts`** — instrument-agnostic SVG emission: the `STROKE_WEIGHT` tiers,
  primitives, guide marks, `renderStroke`, `renderTranslated`.
- **A panel's own render functions** live in its panel file, exported when a neighbour draws them
  too (`renderMainBouts`, `renderVolute`). `renders/` holds only what several panels draw and that
  knows it's a violin: the front profile, the body section, the palette.
  Geometry that only serves a view is still geometry — violin geometry goes in `calculation/`
  (`computeWireframeGeometry`, the scroll's back and front views), generic in `helpers/math/`.
- **Component `change*()` methods** — thin: debounce/validate, call a `calculate*`/`define*`,
  then `draftChange.emit([...renderX(...)])`. What legitimately stays on the component is
  Angular-lifecycle state: drag handlers, and caches keyed by a params hash (the cross-arching
  panel's per-plate surface, contour and wireframe cache).

This split is meant to generalize to future instrument modules — `helpers/math/` and
`renderFuncs.ts` already sit outside any single model's folder.

## Two traps that cross the whole codebase

**Arc sweep conventions differ by type, and converting is lossy.** `models/types.ts` `Arc` always
renders the minor arc regardless of `start`/`end` order, while `tools/toolbox-shape.ts` `ArcShape`
sweeps counterclockwise from `startAngle` to `endAngle`, so order alone picks minor vs major —
don't write a blind converter between them.

**Recipe geometry loses its prototypes on load.** `Pt`/`Circle`/`Arc`/`Rectangle` are
JSON-serialized into recipe files; `JSON.parse` returns prototype-less objects. What hides this is
the calc pass in `ceruti-calcs.ts` reassigning nearly every arc through real constructors. So:
don't add a getter or method to those classes unless the calc pass reassigns every field holding
one, and don't reuse them across a serialization boundary with no calc pass. Breaking either
fails only after save-and-reopen. Full explanation in the `models/types.ts` header.

## Code taste

**Locality of behavior beats abstraction.** Code that reads clean as a dependency graph can still
be worse for a human, who has to travel across many functions to understand one tool. Prefer
keeping related behavior together. Don't extract a helper because a block got long, and don't
split a file because it got big — the arching files are large because the math is genuinely
complex, not because they're awaiting a split.

Splitting is right where the boundary is one a reader already thinks in: one panel per folder,
and the four stages of the ceruti pipeline. Not where it only reduces file size.

**Keep it modifiable by hand.** The arching layer was built largely with agents because the math
is specialist; most other panels were written by hand. The standing risk is that this codebase
drifts past the point where a person can open it and change something. So: when a change can be
made as a local edit or as a new layer of indirection, take the local edit. Raise sweeping
structural changes before making them, not after.

**Comments default to zero.** Write one only when it carries a WHY the code can't: a hidden
constraint, a workaround, a decision that looks wrong until you know the reason. If a comment
just restates the line under it, or what a well-named function/variable/test already says, it
doesn't clear that bar — delete it rather than shrink it. Comments are lowercase and brief,
sitting inline above the section they describe. The long headers that do exist (`models/types.ts`,
`draft-tool.ts`) earn their length by documenting a trap; don't add more of those by default, and
don't pad the short ones.

Banned outright, no exceptions — all pulled from a real cleanup pass on `fholes` (2026-09) where
every one of these showed up across dozens of files:
- Banner/divider comments (`===== Section =====`, `----- Section -----`). Blank lines and
  function boundaries already do this job.
- JSDoc/docstring blocks on functions, classes, or `describe`/`it` blocks by default. A docstring
  longer than the code it sits on means the code needed no comment, not that the comment earned
  its length.
- Restating the next line (`// pop the secondary arc, as above` over a call that pops the
  secondary arc). Read it without the comment — if nothing is lost, the comment was never load-
  bearing.
- The same explanation pasted into more than one file, or repeated more than once in one file.
  Needing it twice means it belongs on a shared definition, not copy-pasted.
- Commented-out code. Delete it — git history is where dead code lives.
- A comment left stale after the code it describes changed. Update it or delete it; a comment
  that contradicts the code below it is worse than no comment.

Self-check before calling comment work done: for each one, could you delete it and have a reader
end up in the same place? If yes, it goes. A future reader hitting a real, unmarked trap will
complain loudly; nobody complains about a comment that wasn't there.

## Conventions

- Units are **millimetres** in world space throughout. Angles are radians in geometry, degrees in
  UI fields.
- The app is pre-production, so saved recipes carry no loader migrations: when a field's shape
  changes, rewrite the templates under `src/**/templates` and let older files fall away.
- Prose for UI help text: say what the concept *is* in luthier terms, then what the field
  controls. Terse. No filler transitions, no elaboration past the information.
- `ceruti-templates.ts` is append-only pasted recipe JSON. Add instruments; don't restructure it.
- Working state (the open recipe, the open panel, drawn shapes) goes through
  `helpers/workingStorage.ts`, never `localStorage`/`sessionStorage` directly. It is
  **sessionStorage, so a tab is a workspace** — two windows hold two designs, and neither
  survives its tab closing. Saving to disk is the durable copy. It reports quota failures once.
  The exception is `App`'s `themeMode`,
  which is a browser preference rather than the user's work.
