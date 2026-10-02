# enrico-ceruti-violin

The one real instrument model. `CerutiViolin` (`ceruti-violin.ts`) is a shell: it owns the panel
order, the color palette, and the geometry caches. Everything else is delegated.

Each file below opens with a header comment stating its own boundary. Read that header before
adding to a file — they are current and more specific than this page.

| File | Concern |
|---|---|
| `ceruti-calcs.ts` | Outline solvers — where the bout/corner/center-bout arcs actually sit. Plus mould & block fabrication geometry. |
| `ceruti-paths.ts` | Turns solved arcs into SVG path strings: inner/outer trace, insets, purfling, fluting. |
| `ceruti-arching.ts` | Long-arch height profile, station normalization, `bodyLandmarks`, the `*AtY` half-width queries. The layer that decides *where* a section is taken and how tall the arch stands there. |
| `ceruti-arch-geometry.ts` | The gouge's circular section, the crown, and the tangency joining them. Answers "what shape is the section here". |
| `ceruti-surface.ts` | The evaluable height field z(x,y) over the plan view. Cross-arch templates, STL. |
| `ceruti-neck.ts` | The neck set in the side elevation: `calculateNeck` places the neck wood's four corners, the heel arc and the bridge on `p.neck`, and the functions beside it read the dressing (button, nut block, fingerboard, bridge wedge, guides, the neck's own path) off those for the render. Hangs off the top plate's edge via `topPlatePlacement`, so the rib taper carries through. |
| `ceruti-scroll.ts` | The scroll in its own side-view frame: the volute's spiral styles about the eye, and `calculateScroll`, which lays the spiral out and runs the back and front off it, writing every arc and line onto `p.volute` the way `calculateNeck` writes `p.neck`. Edited by two panels: volute (the spiral and the crown, S0–S1), then scroll (the back from S2 on, and the front); both draw through `renders/scroll.render.ts`. |
| `ceruti-types.ts` | `EnricoCerutiParams` and the whole serialized shape. `CerutiColors`, view flags. |
| `ceruti-templates.ts` | Bundled historical instruments (Strad Goetz, Del Gesu Baltic, …) as pasted recipe JSON. **Append-only** — add instruments, don't restructure. |
| `templates/corpus/` | Instruments traced from open-licence museum records — one `.json` file each, listed in `templates/corpus/index.ts`. Same type as the templates above, but carrying a `TemplateMeta` and a per-image `ImageCredit` so the numbers and the pixels can each be rechecked. New instruments go here, not in `ceruti-templates.ts`. |
| `templates/local/` | Gitignored developer scratch space — traces and theories with no provenance to check, never shipped, never swept by the suite. Shows up in the picker only on a local dev build. See that folder's `README.md`. |
| `ceruti-helpers.ts` | `*Info()` functions — the help text behind each field's info button. |
| `panels/` | One folder per sidebar panel. Panels are thin; see the layer rule in the root CLAUDE.md. |
| `renders/` | SVG emitters for the arching views, plus geometry that only serves one view. `body-section.render.ts` is the side elevation both the long-arching and neck panels draw on; `scroll.render.ts` the same for the volute and scroll panels. |

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

- **A reference image can be scoped to particular panels**, via `panels`/`excludePanels`/
  `isDefault` on `NamedReferenceImage`/`ImageShape` — full mechanics are in
  `draft-canvas/tools/CLAUDE.md`. What's specific to this model: `initializePanelFlow` hands
  `panelOrder` down to `ToolboxStore.setAvailablePanels` so the settings-bar picker has real panel
  labels, since this is the one place that already has them.
- **A template carries `arching` only where it ships the profile that arching was read from.**
  **Never fabricate arching values for a named instrument** — a plausible-looking crown on
  "Strad Goetz" is an invented measurement of a real object, and published sections for these
  instruments are scarce and mostly paywalled. What changed (2026-09) is that a museum side-view
  photograph turns out to be a usable source: the long arch is read off the silhouette and then
  corrected by hand in the panel. So the rule is now a pairing rather than a prohibition, and
  `ceruti-templates.spec.ts` enforces it — a corpus template with an `arching` block must also
  ship a reference image scoped to the `longArching` panel. A template with no such image still
  carries no arching, `normalizeArchingParams` early-returns, and the plate is seeded from
  `defaultArchingParams` by whichever arching panel or the surface builder reaches it first.
  Each entry's `meta.notes` records how far to trust its numbers; the top plate is occluded by
  the fingerboard and strings on every one of these views and is always the weaker of the two.
- **The heel is a cove, on purpose.** A convex arc tangent to the neck's back can never reach
  the button tip, which sits outside that line's extension — so the side silhouette of a heel is
  necessarily concave where it leaves the neck. `calculateHeel` draws it as one arc tangent to the
  back from the outside; a wide radius reaches the tip on its own, a tight one is a fillet onto a
  flat foot that runs on to the tip. The foot is cut square to the neck, not level with the body
  (2026-10, from historical examples), so it rises off the button at the neck angle. The convex
  nose a hand feels is a cross-section fact, not a silhouette one.
- **The button is built from its tip.** `button.height` is how far the tip stands beyond the
  plate's end on the centreline, so the neck's side view needs nothing from the plan: the heel
  foot ends at `height + button.height`. `ceruti-paths` drops the walls from the cap circle down
  to the edge, and trims the cap itself against the edge once the height is under the cap's
  radius. Recipes saved as a `Rectangle` stored the wall's length instead; `calculateOuterArcs`
  converts them, telling them apart by the corner points they carry.
- **The fingerboard's thickness is one number, not two.** It runs parallel to the neck at a
  uniform `thickness` — a real board is planed thicker toward the body as the crown rises under
  it, but that's not worth a second variable here.
- **The neck wood's thickness is one number too, root to nut.** `NeckParams.thickness` sets
  `back.nut` and `back.root` equally; templates read as uniform enough here that carrying
  separate root/nut values wasn't earning its keep. Entered once, under the "Neck" section.
- **The scroll continues the neck's own plane; the nut sits proud of it.** The origin the
  volute's eye is measured from starts at `nut` (the fingerboard-plane point), not the string
  contact point raised by the nut's thickness — the pegbox/scroll is flush with the neck as it
  runs on past the nut, and the nut itself is the thing standing proud, not a step the scroll
  itself takes. Building the scroll off `nutString` looks tempting since it's the point closest
  at hand, but it makes the scroll jump up to string height at the nut and is wrong.
- **A panel's help-text info icons are added by hand, not by an agent.** Every `ⓘ` button
  wired to a `*Info()` help function was pulled from every panel (2026-09-14) — the write-ups in
  `ceruti-helpers.ts` stayed as reference text, but no panel binds them any more. Don't add a new
  one when adding a field; leave that to a human pass.
- **The neck's own `length` places the nut; the string figures are read off, not dialed.**
  `length` is the root to the nut, along the neck — `nutAt = root` moved `length` toward the nut,
  one `moveInVectorSpace` call, no intersection needed. `stringLength` (nut to bridge, the
  classical figure that should land near 325–328 mm) is derived from it rather than the other way
  around, so the nut can no longer fail to place. This replaced an earlier design where the
  nut-to-bridge distance was entered and the nut was solved backward off a circle around the
  bridge top — that circle could come up empty, which the current design retires by construction.
  As of 2026-09-20 the neck feature has shipped in no template and carries no migration for this
  rename; the usual "frozen field name" rule (root CLAUDE.md) applies again once it does.
  (`nut.neckStop`, root to nut and once quoted here as the classical 130 mm figure, was cut the
  same day — see the next bullet.)
- **`calculateNeck` writes its solved geometry onto `p.neck`, not a returned struct.** (2026-09-21)
  `NeckSolve` — a separate interface `calculateNeck` used to return and every render/test held
  onto — is gone. `NeckParams` now carries both the nine authored inputs and the solved fields
  (`edge`, `root`, `bridge`, `nutBlock`, `heel`, `scroll`, `stringLength`, …), nullable until the
  first solve and commented as derived, the same split `FholeParams` already uses for `U1`/`UTip`
  next to `UEye`/`stem`. This brought the neck in line with how `calculateFholeContours`/
  `calculateOuterArcs` already work: calc mutates params, `renderNeck(p, colors, ...)` reads
  `p.neck` directly instead of taking a solve object as its argument. Unlike f-hole's arcs,
  nothing in the neck's solved geometry is hand-tunable per-shape — it's recomputed and
  overwritten every pass, closer in character to `LongArchSolve` (never persisted) than to a
  traced f-hole arc. Merging it into `NeckParams` anyway was a deliberate call for one consistent
  pattern across the 2D panels, accepting the redundancy of persisting recomputed values in every
  saved recipe. `ceruti-paths.ts` gained a matching `defineNeckPath`/`ensureNeckPath` (`PathKey`
  `'neck'`) that traces the same boundary `renderNeck` draws, root to the heel's end/face — it
  stops there rather than closing a loop, since the block's own foot inside the mortise has no
  back-face point solved yet. It isn't wired into on-screen rendering (which still needs its
  root/heel vs. neck two-color split, segment by segment) or into the export panel yet; it exists
  so a future neck template export has a real path to start from.
- **`p.neck` keeps only what fixes the neck's shape; the dressing is read off it.** (2026-10-02)
  The first pass at the rule above wrote every derived point back onto `p.neck` — unit vectors,
  the mortise floor, the button profile, the nut block, the bridge wedge, the fingerboard, the
  scroll placeholder box, a readout nothing showed — 24 solved fields on 9 authored, a quarter of a
  saved recipe. `NeckParams` now carries eight: `root`, `nut`, `backRoot`, `backNut` (the neck
  wood's corners), `heel` as a plain `Arc`, `bridgeFoot`, `bridgeTop` (the one piece that needs the
  arching solve) and `stringLength` (the readout). Everything else the panel draws is a function in
  `ceruti-neck.ts` reading those and the authored numbers — `buttonTip`, `mortiseFloorY`,
  `gluingAtMortise`, `plateEdgeAtNeck`, `heelBottom`, `heelFace`, `fingerboardEnd`, `bridgeWedge` —
  shared by `renderNeck` and `defineNeckPath`, the way `violNeckCap` serves both the outer trace and
  the main-bouts preview. `defineNeckPath` moved from `ceruti-paths.ts` into `ceruti-neck.ts` for
  that: `ceruti-arch-geometry` imports `ceruti-paths` and `ceruti-neck` imports `ceruti-arch-geometry`,
  so `ceruti-paths` reaching back into `ceruti-neck` would close a cycle. The scroll placeholder
  box and its label were removed outright, the scroll having its own panels now;
  `stringOverFingerboardEnd` went with it, by the readout rule below. The rule going forward, for
  the scroll as well: a solved field earns a place on params if it is an arc the user tunes, a
  readout the panel shows, or needs a solve the render shouldn't repeat. The rest is derived.
- **`calculateScroll` writes onto `p.volute` the same way.** (2026-10-02) The scroll started life
  the other way round — `layoutVolute`/`layoutBack`/`layoutFront` returned `Placed*` structs and
  `renderScroll` ran all three itself — and was brought in line with the neck: `VoluteParams` now
  carries the spiral and every arc by name (`spiral`, `S0`–`S3`, `nape`, `F0`, `F1`), each arc
  holding its authored `r` and the one angle its field sets, the rest solved each pass and
  reassigned through `new Arc`. The straights, the flat and the square line are deliberately not
  stored (2026-10-02): each runs between arcs that are, so `scrollLines` reads them off the arcs
  for the render and the highlight, the way the f-hole render draws its stem between arc ends. The
  spiral stays stored even though the style and the eye determine it, as the arcs are expected to
  be useful downstream. A miss comes back as a `ScrollFailure` through `solveSection`, listing the parts
  after it as unsolved, rather than the run silently stopping. The arcs are plain `Arc`s, but read
  counterclockwise from `start` to `end`: a scroll arc can pass a half turn, so the scroll render
  passes `longArc` when it does. A separate swept-arc type was tried for this and dropped as one
  convention too many. The one corpus template with a volute (`amati-violin-brookings`) was
  rewritten to the new shape rather than given a loader migration, since the scroll had shipped
  nowhere else.
- **The neck panel's one readout is the figure a maker checks with a ruler, nothing else.**
  `stringLength` (straight-line nut to bridge — noted as approximate since the fingerboard and
  bridge are curved and a 2D side elevation can't give a real string length) was joined briefly
  by `stringAngleDeg` (2026-09-20), then `stringAngleDeg` was cut outright the same day — string
  length alone was judged enough, and the field was removed from the solved neck geometry
  entirely rather than just hidden, since nothing else read it. It's shown as a `.basic-display`
  (the same "computed mm value" styling `fluting-panel`/`center-bout-panel` use for non-ratio
  readouts), not the `.readout` span the panel used briefly — that class has no other panel
  consumer any more once this one stopped using it. `nut.neckStop` (root to nut) and
  `projection`/`projectionHit` (the fingerboard's top line carried on to the bridge axis, with its
  render guide) were cut outright the same day for the same reason: solved but not shown, kept
  alive only by their own bench-figure tests. `stringOverFingerboardEnd` outlived them until
  2026-10-02, when the trim above cut it too; its bench-figure test now derives the figure itself.
  `bodyDepthAtRoot` had neither a render nor a test depending on it, so
  it was deleted outright rather than kept as an unused field. The pattern going in: a solved
  `NeckParams` field earns its keep by feeding either the drawing or the panel, not just a test —
  losing the last one gets it deleted, not just unhooked.
- **Fingerboard and nut are reference geometry, not template inputs — and `nutHeight` didn't
  even earn that.** Nothing in `fingerboard.length`/`.thickness` touches the neck's own carved
  shape (the back, the heel, the button, the mortise) — they exist only to draw the fingerboard/nut
  and feed the string readouts, since fingerboards and nuts are fitted/interchanged independently
  of any template this app produces. `nutHeight` (string standing proud of the fingerboard at the
  nut) went further and was removed outright (2026-09-20): a real nut has some height, but at
  ~1 mm on a violin it moved `stringLength`/`stringAngleDeg` by an amount the classical figures
  don't care about, so the string now runs flush with the fingerboard's own top corner —
  the fingerboard's top corner at the nut (`nut` moved the nut thickness along the neck's normal,
  derived where it is drawn) is also where the string sits, and there's no `nut.string` any more. The nut block still draws as a little box past the fingerboard end
  (the nut block in `renderNeck`), it just doesn't peak above the fingerboard's own surface. `fingerboard.length`/
  `.thickness` stay as fields for now since they still meaningfully move the readouts and the
  drawing; if that stops being true, treat them the same way.
- **Fingerboard, bridge and the readouts share one "String Setup" section.** Since none of the
  three feed the neck's own template geometry (previous bullet), they don't need their own
  section headers the way "Neck"/"Neck Root" do — merged 2026-09-20 to cut the vertical space
  three `ui-group` headers cost. The section itself carries no `[style.border-color]` (it mixes
  fingerboard purple and bridge off-white); each input still carries its own part's color, same
  as "Readouts" was already uncolored while its neighbors were.
- **The button draws in the back plate's own color, not the neck's.** The button profile is carved
  from the back plate carried on past its edge (see the button bullet above), so it renders in
  `colors.archBack` — the same color the long-/cross-arching panels already use for "Back Plate" —
  and the Button Height field's border matches it, rather than both drawing in `colors.neck` as
  they did before 2026-09-20. The heel arc and the mortise/overstand lines render in
  `colors.neckRoot` for the same reason: those are the "Neck Root" section's fields (Heel Radius,
  Mortise, Overstand), and the drawing had been rendering the whole neck — root included — in the
  plain `colors.neck` used by the "Neck" section's own fields (Length, Thickness), so the root
  never read as visually distinct from the body it's attached to. The mortise/overstand pair
  started out dashed (`renderDashedLine`, a "hidden line" convention) and was switched to solid
  the same day the fingerboard toggle shipped (next bullet) — with the fingerboard now optional,
  the neck needed to read as one coherent piece whether or not the board is showing, and a dashed
  segment sitting mid-drawing read as an unfinished edge rather than a deliberate one.
- **Fingerboard length is a standard size by instrument, not a free parameter — and the board
  itself is now a view toggle, defaulted on.** `NeckParams.fingerboard` lost its `length` field
  (2026-09-20); `calculateNeck` looks it up instead from `standardFingerboardLength(p.height)`,
  the same body-height thresholds `calculateMould` already uses to tell violin/viola/cello/bass
  apart (`<400`/`<500`/`<800`/else — 270/310/580/850 mm). Modern fingerboards really do come in a
  handful of stock lengths, so entering one was never a real degree of freedom. The render call
  for the fingerboard polygon (the board's end and the nut's top corners, in `colors.fingerboard`)
  had existed only as a commented-out line in `neck-panel.ts` since some earlier pass — it's now
  live, gated behind a new `showFingerboard` render-toggle-bar flag (`CerutiViewFlags`/
  `RenderToggleKey`, default `true` in `DEFAULT_CERUTI_VIEW_FLAGS`) so the board can be hidden
  without losing any geometry that depends on it. The "String Setup" section's "FB Thickness, Length" shared-title
  field row lost its second cell along with the field — it's just "FB Thickness" now, thickness
  being the one fingerboard number still worth dialing by hand.
- **A panel's section color has to be restated on every input inside it, not just the
  `<section>` wrapper.** `.ui-group` sets `border: none`, so a bare
  `[style.border-color]="colors.x"` on the section has no border-style/width to tint and renders
  nothing — `.basic-input` already carries a real 2px border, so the same binding on each
  `<input>` is what actually shows. `fluting-panel`/`cross-arching-panel`/`long-arching-panel`
  already did this; the neck panel's own first coloring pass (2026-09-14) colored only the
  section wrapper and was invisible until this was corrected (2026-09-20).
- **The rib taper is a placement fact, not a carving one.** Ribs are planed down toward the
  upper block after the back is glued on, so `ribHeightLower`/`ribHeightUpper` tilt the plane the
  top plate glues to while the back's stays square. Nothing in the arch, the channel, the crown,
  the templates or the STL sees it — a plate is carved against its own gluing plane, and that is
  the frame `PlateSurfaceModel` works in. The two section views apply the tilt at draw time, the
  long-arching one by drawing the top plate in its own frame and placing it with a single rigid
  rotation — centred on the rib line, so the plate overhangs the garland equally at both ends —
  rather than by teaching every path builder about an angle. Rotated, not sheared: the plate is
  one piece of wood and its section has to read as the one that was carved, which costs six
  microns of plan foreshortening on a violin. Both heights are entered
  perpendicular to the rib's top edge; `solveRibTaper` converts to vertical rise in closed form,
  and the correction is half a micron on a violin. The acceptance property is that equal heights
  reproduce an untapered instrument exactly, which is why the loader migration splits an old
  `ribHeight` into an equal pair rather than seeding a default taper. `maxRibTaperMm` bounds the
  pair at the point where the tilted rib line outgrows the body — the long arching panel rolls
  an over-taper back rather than drawing a plate stretched to reach a garland that cannot exist.
- **A long-arch spline knot may sit below the plate edge, down to the plate thickness — even below
  the channel's trough.** An arch that arrives sloping down has no tangent on the channel's inner
  flank, so `solveArchTakeoff` looks on the outer flank, past the trough (`contactS` goes negative)
  and the arch runs on below the gouge. It tries the inner flank first, so arches that already met
  it don't move. Each end of the long arch solves its own takeoff (`takeoff`/`farTakeoff`), since an
  unmirrored knot near one end makes the two arrive differently. The cross-arch solve rides the same function, and a station's crown may sit below
  the trough for the same reason. A cross-arch cycloid gets there with `pct` above 100%, which
  curls its ends under the takeoff (long-arch cycloid has no UI, so it has no such field). Near the caps the surface reads the arch by distance to the
  wrapping channel, so an STL's centerline there is shallower than the long-arch section; the
  long-arch templates are exact.
- **Cross-arch knots are measured against the wood before the cross arch, never the solved
  takeoff** (2026-09-29). Position is a fraction of the way from the joint to the channel's inner
  edge; height a fraction of the crown above plate level, the datum `archHeight` uses. A takeoff
  always lands outboard of the inner edge, so it can move without passing or moving a knot. Authored
  spline knots only: a trochoid or catenary is a generated curve whose end *is* the takeoff, so it
  keeps measuring from each side's takeoff (`fromTakeoff`) — in the fixed frame its end stopped at
  the inner edge and a second curve bridged to the channel, a visible bump past 100%. Recipes
  saved before this read differently; no migration, by choice. The smooth crown spline is kept
  unless it rises above the crown or sinks below the trough (`breaksSpec`), and then the monotone
  one is used — so a moved crown can show a faint curvature line along its ridge.
- **The arch meets the channel first; the corners are smoothed from wherever it landed.**
  `cornerSmoothZ` stretches the channel's outer flank across the corner wedge starting at the
  arch's contact (`from`), which is past the trough for a cross arch over 100%. Stretching from
  the trough regardless lowered the flank under the arch's landing and left a step at every
  corner. The stretch eases out from a landing up the flank so the arch's grade carries on
  rather than creasing; from the trough it stays uniform, the shape settled first.
- **The cross-arching section view slices the surface, not the station solve.** It draws
  `sampleArchSectionRuns`, the same height field the wireframe and contours read. `section.zAt`
  places the channel by chord, one gouge wide on the station line, with no corner pass — so at a
  corner it drew a flat where the wedge is carved. Knot halos and module guides still sit on
  `section.zAt` (the crown as authored) and can float a fraction of a mm off the drawn curve there.
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

1. **`ceruti-types.ts` → `CERUTI_PANEL_IDS`** — the id. `panelOrder` is typed against it, so this
   one is loud: skip it and step 3 fails the build. It exists because panel ids are file-format
   vocabulary now — a template's reference images scope themselves to panels by id
   (`NamedReferenceImage.panels`), so renaming a panel is a migration rather than a rename.
2. **`panels/<name>-panel/`** — just `.ts` and `.html`. No per-panel stylesheet: all of them share
   `styleUrls: ['../../../sidebar.css', '../../ceruti-violin.css']`, and markup uses the shared
   `ui-group` / `field-row` / `basic-input` classes. Extend `CerutiPanelBase`, implement `OnInit`.
   Copy `panels/outer-trace-panel/` as the reference; `panels/mould-panel/` is the smallest.
   Declare `static readonly renderToggles` — which view-toggle buttons the bar shows while this
   panel is open. There is no default to inherit, so omitting it fails the build at step 3.
3. **`ceruti-violin.ts` → `panelOrder`** — id + label + `toggles: <Panel>.renderToggles`,
   positioned in bench order. `toggles: []` for a panel that offers none.
4. **`ceruti-violin.ts` → `canOpenPanel()`** — a case returning the right `hasX()` predicate. Add
   a new `hasX()` under *Panel gating* if no existing one fits.
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

`ceruti-arching.ts`, `ceruti-arch-geometry.ts` and `ceruti-surface.ts` are the agent-built files
root CLAUDE.md's "Keep it modifiable by hand" refers to. Explain a change in bench terms, not just
code terms, and lean on the specs — they encode the real acceptance criteria (slope-0 cut edges,
idempotent migration, no kink at the taper).

## Notes

- `ceruti-surface.spec.ts` and `ceruti-arch-geometry.spec.ts` are most of the full suite's
  runtime — the dense sweeps below are why. `npm run test:arching` (root CLAUDE.md) runs just
  the 3D pipeline (`ceruti-arching*`, `ceruti-arch-geometry`, `ceruti-surface`) instead of the
  full suite; `npm run test:outline` runs the 2D one. `npm run test:panels` covers `panels/panels.spec.ts`
  and `export-panel.spec.ts`, which are slow for the same reason — they render every bundled
  instrument through arching and STL export.
- Four specs sweep densely enough to run several seconds and were flaky against vitest's 5s
  default, so each carries an explicit 20s timeout. Keep them: in every case a sweep coarse
  enough to fit the default is coarse enough to step over what the test exists to catch.
  - `ceruti-arch-geometry.spec.ts` — "eases into the taper without a kink", "moves the contact
    smoothly as the crown changes"
  - `ceruti-surface.spec.ts` — "never voids a station row inside the body"
  - `panels/panels.spec.ts` — "draws every bundled instrument, not just the default"
- Panels share `onArcFocus`/`onArcBlur`/`adjustArcStart`/`adjustArcEnd`/`nearestFraction`. If you
  add a sixth copy, hoist instead.
