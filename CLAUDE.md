# Cremona CAD

Angular app for drafting violin-family instruments from parameters (bout widths, corner
placements, cutoff angles) rather than traced coordinates. Parameters carry through to purfling,
fluting, arching and the mould; designs export as SVG/PDF/DXF for templates and STL for CNC.

This is the only CLAUDE.md. Most source files open with a header comment stating their own
boundary: read it before adding to a file.

## Commands

```bash
ng serve        # dev server, localhost:4200
ng test         # vitest, full suite (~20s). Run before considering work done.
ng build
```

While iterating, run only the area you touched (see `package.json` for the globs):
`test:outline` (2D panels, neck and scroll, templates), `test:arching` (fluting, long and cross
arching), `test:export`, `test:violin-family` (the whole recipe), `test:draft-canvas`,
`test:helpers`, `test:shell`, `test:fast` (all but arching and export). A new spec file outside
these globs only runs under the full `ng test`. `violin-family-stress.spec.ts` is work in progress,
excluded in `angular.json`; only `test:stress` runs it.

## Layout

| Path | What lives there |
|---|---|
| `src/app/recipes/violin-family/` | The one instrument model. `violin-family-recipe.ts` is a shell owning panel order, seeding, the commit and the view toggles. |
| `…/violin-family-types.ts` | Every data shape, in three families: `params` (the file), `*Solve` (derived, never saved), `ratios` (stamped on the file, never read). Read its header. |
| `…/panels/<stage>-panel/` | One folder per drafting stage. The `.ts` holds, top to bottom, the component, its `render*` layers and its `solve*`; a later stage reads an earlier one by calling its solver. Body side profile lives in `long-arching-panel`, the scroll views in `scroll-widths-panel`. |
| `…/templates/corpus/` | Served instruments, one JSON each, with `source` and image `credit`. `violin-family-templates.spec.ts` is the only spec that reads them. |
| `src/app/recipes/hello-world/` | A four-circle toy recipe, about 150 lines: the starting point for trying out a new recipe. Recipes are picked in `app.ts`; each extends `recipe-base/`. |
| `src/app/draft-canvas/` | SVG canvas, camera, snapping, pointer routing. `tools/` holds the toolbox. |
| `src/app/helpers/` | Instrument-agnostic math, rendering, exporters, `validators.ts` (`solveSection`), `workingStorage.ts`. |
| `src/app/models/types.ts` | `Pt`/`Circle`/`Arc`/`Rectangle`. Read its header. |
| `src/app/recipe-base/` | Panel flow, undo/redo, file load/save, toolbox sync. |
| `src/app/theme/` | All colour and stroke. `palettes.ts` holds every constant; `theme.service.ts` the code. No file outside this folder holds a hex. |
| `src/app/docs/` | Every word the app says to the user: `field-help.ts` (ⓘ), `tooltips.ts` (`docTip="id"`), `conditions.ts`, and the info booth (`info-booth/`). Every booth page, release notes included, is one Markdown file in `pages/` (listed in `pages/index.ts`, written to `pages/wiki/style.md`), rendered by `reader/`. There is no `CHANGELOG.md`; a release is `pages/history/vX.md`. |
| `src/app/settings/` | The user's preferences: `SettingsService` (one typed object, signals, `localStorage`) and the top bar's settings menu. A new setting is a key on `AppSettings`, a line in `readSettings`, a row in the menu. |

## Where logic belongs

Sort by what the code knows, not what feature it serves:

- **A panel file**: math that knows it's a violin, for that stage. `solve<Stage>(p)` reads params
  and returns a `<Stage>Solve` (arcs, points, `failures`), never writing to params. `render*` sits
  beside it; `static seed(p)` writes the stage's first params. View-only geometry still goes here
  if it's violin geometry.
- **`helpers/math/`**: math that doesn't. The test is whether the name and signature would make
  sense to someone drafting a guitar. Files are ordered by distance from compass-and-straightedge,
  and each imports only from those before it: `simpleGeometry` (closed-form) → `draftMath`
  (casework solvers, fillets, arc fits, runs) → `vibeMath` (splines, catenary, spatial index,
  projection) → `pathMath` (one SVG `d` string at a time) → `pathVibes` (booleans, offsets, joining).
- **`helpers/renderFuncs.ts`**: instrument-agnostic SVG emission. A panel's own renders live in its panel file.
- **The component**: thin. `edited()` emits `edit` and calls `draw()`; `draw()` solves, composes
  layers, emits `drawn`; `report()` raises the failures once the edit settles. Only highlight keys
  and view state (drag handlers, cursor) stay on the component.

**Params hold what the user sets, and only that.** One optional sub-object per stage, absent until
its panel seeds it. Solvers return `SolveFailure[]` on the solve via `solveSection` and never write
back. Don't add derived points or readouts to a params interface: derive them with an exported
function beside the solver and call it from the solve, the render and the highlight. A radius or
angle the user authors is a number on params; the arc built from it is on the solve.

## Traps

- **Arc sweep conventions differ.** `models/types.ts` `Arc` always renders the minor arc;
  `ArcShape` (toolbox) sweeps counterclockwise from `startAngle` to `endAngle`. Scroll arcs are
  plain `Arc`s but read counterclockwise and can pass a half turn (pass `longArc`). Never write a
  blind converter.
- **Recipe geometry loses its prototypes on load.** `JSON.parse` returns plain objects, hidden by
  the solvers building fresh arcs every draw. Don't add getters/methods to the
  `models/types.ts` classes. `DraftShape` is a method-free plain-object union for the same reason;
  don't reuse `models/types.ts` classes in the toolbox. Either break only shows after save-and-reopen.
- **Every field on `ReferenceImage` must also exist on `ImageShape`.** The canvas rewrites
  `referenceImages` on every change, so a missing field is silently erased.
  `reference-image-schema.ts` is the only translator between the two.
- **Section colour must be bound on every `<input>`**, not the `<section>`: `.ui-group` has
  `border: none`, so tinting it shows nothing.

## Adding a panel

Six edits. Missing one usually fails quietly (a panel that never unlocks):

1. `violin-family-types.ts` → `VIOLIN_FAMILY_PANEL_IDS`, the stage's `<Stage>Params` on
   `ViolinFamilyParams` and its `<Stage>Solve`. Ids are file-format vocabulary (images scope to them).
2. `panels/<name>-panel/`: `.ts` + `.html` only, shared stylesheets. `implements ViolinFamilyPanel`,
   declare `static readonly renderToggles` and `static seed(p)`, outputs `drawn` and `edit`. Copy
   `corners-panel/`.
3. `violin-family-recipe.ts` → `panelOrder` (bench order, `toggles`, `seed`).
4. `violin-family-recipe.ts` → `canOpenPanel()` case reading the solver the stage depends on.
5. `violin-family-recipe.ts` → component `imports`.
6. `violin-family.html` → `@if (openPanel === '<id>')` block with `#panelRef`, `(drawn)` and `(edit)`.

`ngOnInit` → `draw()`; every field `(input)="edited()"`; failures go out through `report()` when
the edit settles, not on every keystroke. `export-panel` takes `drawn` only; don't copy it.

## Adding a tool

Write `createXTool(...)` returning a `DraftTool` and add it to `toolRows` or `modifyRows` in
`tools/tool-registry.ts`. Nothing else. Reuse `TwoPointTool`/`ThreePointTool`/`ChainTool`.
Layer/image visibility is one `scope` field (`panel-scope.ts`), with no separate hidden flag.
`getEditableShapes()` is the single editability gate. A group is just a shared `groupId`. Missing
`layerId` means `DEFAULT_LAYER_ID`.

## Settled decisions: don't re-litigate

- **Never fabricate arching values for a named instrument.** A corpus template carries `arching`
  only alongside a reference image scoped to `longArching` it was read from;
  `violin-family-templates.spec.ts` enforces it.
- **One arching model.** `gouged` as a model qualifier is a leftover; *gouge* as the tool name is fine.
  Panel order follows the bench: channel → long arch → crown.
- **The rib taper is placement, not carving.** Plates are carved against their own gluing plane;
  only the section views apply the tilt, as a rigid rotation.
- **`innerFlutingDepth` stays.** Removing it reshapes every arch.
- **The heel is a cove** (a convex arc can't reach the button tip). The foot is cut square to the neck.
- **The neck tapers**: `upperThickness` at the nut, `lowerThickness` at the heel, square to the
  fingerboard plane through the button tip.
- **The scroll continues the neck's plane from `nut`**, not `nutString`; the nut stands proud.
- **The neck's `length` places the nut**; `stringLength` is read off, never entered.
- **Fingerboard, nut, bridge are reference geometry** on `p.stringSetup`, seeded only by the
  string setup panel; they never shape the neck. `nutHeight`/`nutWidth` shape the scroll and live on `p.neck`.
- **ⓘ help icons are added by hand.** Don't add an `ⓘ` button or `FIELD_HELP` entry with a new field.
- **Back and front views of the scroll are drawn as a draughtsman would**, not projected or masked.

## Scroll vocabulary

Defined nowhere else yet. **Hang**: how far the duck tail drops below the nut's lower edge; S3's
end angle is solved from it. **Duck tail**: the round where the pegbox's flat back dives into the
neck (`widths.duckTail` is its diameter). **Nape**: the arc joining the duck tail to the neck's
back. **Hips**: the pegbox's widest point beside the nut (`hipHeight`, up from the nut's top; 0 =
none). **Throat**: the front's width at the foot of its straight. **Poll**: the back of the head,
its furthest reach. **Foot**: the back's width at the round's top. The front goes by height (sawn
straight); the back goes by distance along the path (carved off the volute). S0–S3 are the back's
arcs, F0–F1 the front's.

## Code taste

- **Locality beats abstraction.** Don't extract a helper because a block got long or split a
  file because it got big. Split only on boundaries a reader already thinks in (a panel, a
  pipeline stage). Prefer a local edit to a new layer of indirection; raise sweeping structural
  changes before making them.
- **The arching panels (fluting, long arching, cross arching) were agent-built.** Explain changes
  there in bench terms and lean on the specs, which encode the acceptance criteria.
- **Comments default to zero.** Only a WHY the code can't carry: a hidden constraint, a workaround.
  Lowercase, brief, inline. Banned: banner/divider comments, JSDoc by default, restating the next
  line, duplicated explanations, commented-out code, stale comments.

## Conventions

- Millimetres in world space. Radians in geometry, degrees in UI fields.
- **Colour**: a panel names a palette (`ThemeService.getPalette('orchid')`) and reads by position,
  `pal.ink(i)`, never by part name. Parts the panel edits take their own ink; everything else is
  `pal.neutral`. A distinct part gets a distinct ink; `faint(n)` only separates siblings of one
  part. No desaturated "off" twins. Only R/length fields take the arc colour, not angle fields.
  Never write tests asserting colours.
- **No loader migrations** (pre-production). When a field's shape changes, rewrite the templates
  and let old files fall away.
- Working state goes through `helpers/workingStorage.ts` (sessionStorage, a tab is a workspace),
  never `localStorage` directly. Exception: `SettingsService`, whose preferences outlive a tab.
- UI help prose: what the concept is in luthier terms, then what the field controls. Terse.

## Tests

- **No spec reads a served template** (`templates/corpus/`). A panel spec builds its params from
  `DEFAULT_VIOLIN_FAMILY_PARAMS` and the panels' `seed()`s, in bench order. Only
  `violin-family-templates.spec.ts` validates the served set.
- Assert invariants (closure, symmetry, tangency), not counts or coordinates. No tests that only
  check a DOM node appeared or pin a number from `DEFAULT_VIOLIN_FAMILY_PARAMS` or `SEED_RATIOS`.
- A spec touching no DOM API opens with `// @vitest-environment node`.
- The 20s timeout on the dense sweep in `cross-arching-panel.spec.ts` stays. A coarser sweep
  misses what it exists to catch.
