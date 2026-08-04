# enrico-ceruti-violin

The one real instrument model. `CerutiViolin` (`ceruti-violin.ts`) is a shell: it owns the panel
order, the color palette, view-toggle rows, and the geometry caches. Everything else is delegated.

Each file below opens with a header comment stating its own boundary. Read that header before
adding to a file — they are current and more specific than this page.

| File | Concern |
|---|---|
| `ceruti-calcs.ts` | Outline solvers — where the bout/corner/center-bout arcs actually sit. Plus mould & block fabrication geometry. |
| `ceruti-paths.ts` | Turns solved arcs into SVG path strings: inner/outer trace, insets, purfling, fluting. |
| `ceruti-arching.ts` | Long-arch height profile, station normalization, `bodyLandmarks`, the `*AtY` half-width queries. The layer that decides *where* a section is taken and how tall the arch stands there. |
| `ceruti-arch-geometry.ts` | The gouge's circular section, the crown, and the tangency joining them. Answers "what shape is the section here". |
| `ceruti-surface.ts` | The evaluable height field z(x,y) over the plan view. Cross-arch templates, STL. |
| `ceruti-types.ts` | `EnricoCerutiParams` and the whole serialized shape. `CerutiColors`, view flags. |
| `ceruti-templates.ts` | Bundled historical instruments (Strad Goetz, Del Gesu Baltic, …) as pasted recipe JSON. **Append-only** — add instruments, don't restructure. |
| `ceruti-helpers.ts` | `*Info()` functions — the help text behind each field's info button. |
| `panels/` | One folder per sidebar panel. Panels are thin; see the layer rule in the root CLAUDE.md. |
| `renders/` | SVG emitters for the arching views, plus geometry that only serves one view. |

`ceruti-calcs.ts` → `ceruti-paths.ts` is the 2D outline pipeline; `ceruti-arching.ts` →
`ceruti-arch-geometry.ts` → `ceruti-surface.ts` is the 3D one. The split between the last two is
the one most often gotten wrong: *where and how tall* is `arching`, *what shape* is
`arch-geometry`.

## The arching model

There is **one** arching model. A second ("classic") one existed until 2026-07-31 and is fully
deleted; the `gouged` prefix that distinguished them came off everything on 2026-08-03. If you
find `gouged` as a model qualifier anywhere, it's a leftover.

The word *gouge* is not retired — it names the tool. `gougeHalfWidth`, `gougeProfileZ`,
`cornerGougeZ` and prose like "the channel is gouged before the arch is carved" are correct.

Order of operations follows the bench, and the code follows it too: channel gouged at constant
section first → long arch carved to a template → crown across. The panel order in
`ceruti-violin.ts` is deliberately this order.

`normalizeArchPlate` in `ceruti-arching.ts` migrates recipes saved during the overlap. It
recognizes the current format *positively* so it stays idempotent; six tests in
`ceruti-arching.archMigration.spec.ts` pin that. Don't loosen them.

## Settled decisions — don't re-litigate

- **Templates carry no `arching` block, on purpose.** They ship solved outline geometry (`bouts`,
  `outerCorners`, `blocks`) but no arching, so `normalizeArchingParams` early-returns and the
  plate is seeded from `defaultArchingParams` by whichever arching panel or the surface builder
  reaches it first. The reason is that published arching data for these historical instruments is
  scarce and mostly paywalled. **Never fabricate arching values for a named instrument** — a
  plausible-looking crown on "Strad Goetz" is an invented measurement of a real object. What
  happens to the templates (new ones with public arching, added instruments, or leave as-is) is
  an open question, not a gap to be filled in.
- **`innerFlutingDepth` stays.** It still sets the long-arch span via `longArchHeightAt`.
  Retiring it would recompress every plate's arch — a shape decision, not cleanup.
- **Cross-arch templates cut at the five `bodyLandmarks`** plus any authored station further than
  `STATION_MERGE_EPS_MM` from one.
- **Plan-view sheets carry no channel.** In plan, a channel is two rims with nothing between them
  to say depth or section.
- **Templates terminate at the bottom of the fluting trough** on each end, via
  `trimProfileToTroughs` in `ceruti-surface.ts`. The acceptance property is that the cutting edge
  has **slope 0 at both ends**. Two approaches already failed: sweeping to the plate edge leaves
  dead flat on every blank; cutting at `section.centerHalf + section.halfWidth` is right along the
  bouts but wrong at the corners, where the surface reads transverse position off a distance field
  (`chordTrust`). Read the cut off the sampled surface, never compute it — and parse the profile's
  own vertices rather than `samplePathToPolyline`, which re-samples by arc length and slides the
  cut off the vertex it identified.

## Adding a panel

Six edits. Missing one fails quietly — usually a panel that never unlocks — so work the list.

1. **`panels/<name>-panel/`** — just `.ts` and `.html`. No per-panel stylesheet: all nine share
   `styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css']`, and markup uses the shared
   `ui-group` / `field-row` / `basic-input` classes. Extend `CerutiPanelBase`, implement `OnInit`.
   Copy `panels/outer-trace-panel/` as the reference; `panels/mould-panel/` is the smallest.
2. **`ceruti-violin.ts` → `panelOrder`** — id + label, positioned in bench order.
3. **`ceruti-violin.ts` → `canOpenPanel()`** — a case returning the right `hasX()` predicate. Add
   a new `hasX()` under *Panel gating* if no existing one fits.
4. **`ceruti-violin.ts` → `RENDER_TOGGLE_ROWS`** — which view-toggle rows the bar shows.
   `toggleRows({...})` with only what applies; `null` hides the bar.
5. **`ceruti-violin.ts` → component `imports`** array.
6. **`ceruti-violin.html`** — an `@if (openPanel === '<id>')` block with `#panelRef`,
   `[params]`/`[colors]`/`[flags]` (plus `[paths]` only if the panel reads the path cache), and
   `(panelUpdate)="onPanelRenderRequest($event)"`.

The panel body itself:

```ts
ngOnInit(): void { this.emitImmediate(); }   // first draw on activation
onChange(): void { this.emitDebounced(); }   // typed/dragged edits
protected buildRun(): RenderLayer[] { ... }  // calc, then compose renders
```

Pick the emit deliberately — `emitImmediate` for anything the user watches happen live (hover,
focus, drag ticks, first draw), `emitDebounced` for typed numbers, `emitCoalesced` when
`buildRun()` is expensive enough that arrow-key repeat would fall behind. `panel-base.ts`
explains each.

`export-panel` is deliberately not this shape — it has no `#panelRef` and emits `draftChange`
directly, because it isn't a drafting step. Don't copy it as a template.

**If the panel reads the path cache:** call the matching `ensure*` from `ceruti-calcs.ts` at the
top of `buildRun()` before any `getPath()`. `getPath` asserts non-null, so a missing `ensure*` is
a runtime crash rather than a type error. Use the `getPathOrNull` variant for entries that are
legitimately optional (`purfling`, `outerPurfling`).

## Working in the arching files

`ceruti-arching.ts`, `ceruti-arch-geometry.ts` and `ceruti-surface.ts` were built largely with
agents, because the math is specialist. That means the usual safety net — the author spotting a
wrong answer on sight — is thinner here than elsewhere in the codebase. Explain what a change
does in bench terms, not just in code terms, and lean on the specs: they encode properties
(slope-0 cut edges, idempotent migration, no kink at the taper) that are the real acceptance
criteria.

## Notes

- One spec in `ceruti-arch-geometry.spec.ts` ("eases into the taper without a kink") runs ~5s and
  was flaky against vitest's 5s default; it carries an explicit 20s timeout. Keep it.
- Panels share `onArcFocus`/`onArcBlur`/`adjustArcStart`/`adjustArcEnd`/`nearestFraction`. If you
  add a sixth copy, hoist instead.
- Help text style: what the concept *is* to a luthier, then what the field controls. Terse.
