# Cremona CAD

Angular app for drafting violin-family instruments from parameters (bout widths, corner
placements, cutoff angles) rather than traced coordinates. Parameters carry through to purfling,
fluting, arching and the mould; designs export as SVG/PDF/DXF for templates and STL for CNC.

## Commands

```bash
ng serve        # dev server, localhost:4200
ng test         # vitest, ~40s wall, 466 tests — full suite, run before considering work done
ng build
```

### Scoped test runs

The full suite is slow enough (most of it spent in the arching/STL math) that it's worth running
only the area you touched while iterating, then the full `ng test` once before finishing. Each
scoped script is `ng test --watch=false` with an `--include`/`--exclude` glob; see them in
`package.json` if you need a variant. Timings are wall-clock, single run:

| Script | Covers | Time |
|---|---|---|
| `npm run test:outline` | `ceruti-calcs*`, `ceruti-paths`, `ceruti-serialization` — the 2D outline pipeline | ~6s |
| `npm run test:arching` | `ceruti-arching*`, `ceruti-arch-geometry`, `ceruti-surface` — the 3D arching pipeline, the specialist math | ~35-45s |
| `npm run test:panels` | `enrico-ceruti-violin/panels/**` — panel wiring + SVG/DXF/STL export | ~15s |
| `npm run test:draft-canvas` | `draft-canvas/**` — canvas, camera, snapping, tools | ~3s |
| `npm run test:helpers` | `helpers/**` — instrument-agnostic math, renderers, exporters | ~4s |
| `npm run test:shell` | `app.spec.ts`, `shared/**`, `top-bar/**` | ~4s |
| `npm run test:fast` | everything except `test:arching` and `test:panels` | ~6s |

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
| `examples/` | **Not built, not tested.** Outside `tsconfig.app.json` and `tsconfig.spec.json`. |

`examples/beard-violin` and `examples/kelly-violin` are earlier recipe implementations kept for
reference. `examples/beard-violin.spec.ts` does not run. Don't fix, refactor or lint anything
under `examples/` unless asked for it by name.

## Where logic belongs

Sort by what the code knows, not by what feature it serves:

- **`ceruti-calcs.ts` and friends** — math that knows it's a violin. Takes `EnricoCerutiParams`,
  encodes instrument proportions.
- **`helpers/draftMath.ts`** — math that doesn't. Intersections, clamping, angle normalization,
  spline/catenary solvers. If it doesn't need to know it's a violin, it goes here rather than
  becoming a private method on a component.
- **`helpers/renderFuncs.ts`, `renders/*.render.ts`** — SVG emission, plus geometry that exists
  only to serve one view (e.g. `arch-3d-wireframe.render.ts` holds both `computeWireframeGeometry`
  and its renderer, since that geometry has no life outside the render).
- **Component `change*()` methods** — thin: debounce/validate, call a `calculate*`/`define*`,
  then `draftChange.emit([...renderX(...)])`. What legitimately stays on the component is
  Angular-lifecycle state: drag handlers, and caches keyed by a params hash
  (`archContourCache`, `wireframeCache`, `surfaceModelCache`).

This split is meant to generalize to future instrument modules — `draftMath.ts` and
`renderFuncs.ts` already sit outside any single model's folder.

## Two traps that cross the whole codebase

**Arc sweep conventions differ by type, and converting is lossy.** `models/types.ts` `Arc` stores
boundary angles and every renderer draws the *minor* arc between them — swapping `start`/`end`
draws the same curve, and the major arc needs an out-of-band flag. `tools/toolbox-shape.ts`
`ArcShape` stores the same four numbers but sweeps strictly counterclockwise, so ordering picks
minor vs major and the value stands alone. Don't write a blind converter between them.

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
split a file because it got big — `draftMath.ts` is deliberately long and centralized, and the
arching files are large because the math is genuinely complex, not because they're awaiting a
split.

Splitting is right where the boundary is one a reader already thinks in: one panel per folder,
and the four stages of the ceruti pipeline. Not where it only reduces file size.

**Keep it modifiable by hand.** The arching layer was built largely with agents because the math
is specialist; most other panels were written by hand. The standing risk is that this codebase
drifts past the point where a person can open it and change something. So: when a change can be
made as a local edit or as a new layer of indirection, take the local edit. Raise sweeping
structural changes before making them, not after.

**Comments** are lowercase and brief, sitting inline above the section they describe rather than
massed into a doc-brief at the top. The long headers that do exist (`models/types.ts`,
`draft-tool.ts`) earn their length by documenting a trap; don't add more of those by default, and
don't pad the short ones.

## Conventions

- Units are **millimetres** in world space throughout. Angles are radians in geometry, degrees in
  UI fields.
- Field names in saved recipes are effectively frozen (`Pt1`/`Pt2`, `start`/`end`). Renaming one
  needs a loader migration — see `normalizeArchPlate` in `ceruti-arching.ts` for the pattern.
- Prose for UI help text: say what the concept *is* in luthier terms, then what the field
  controls. Terse. No filler transitions, no elaboration past the information.
- `ceruti-templates.ts` is append-only pasted recipe JSON. Add instruments; don't restructure it.
- Working state (the open recipe, the open panel, drawn shapes) goes through
  `helpers/workingStorage.ts`, never `localStorage`/`sessionStorage` directly. It reports quota
  failures once and carries old sessionStorage over. The exception is `App`'s `themeMode`, which
  is a browser preference rather than the user's work.
