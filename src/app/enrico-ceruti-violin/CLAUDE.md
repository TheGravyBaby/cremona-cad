# enrico-ceruti-violin

The one real instrument model. `CerutiViolin` (`ceruti-violin.ts`) is a shell: it owns the panel
order, the resolved colours, and the geometry caches. Everything else is delegated.

Each file below opens with a header comment stating its own boundary. Read that header before
adding to a file — they are current and more specific than this page.

`calculation/` holds the math that knows it's a violin, in the three groups a reader already
thinks in: `outline/` (the 2D pipeline), `arching/` (the 3D pipeline) and `neck/` (the neck set).
The folders are reading groups, not dependency layers — `ceruti-calcs` reaches into `neck/` and
`arching/`, and `ceruti-neck` reaches back into `outline/`.

| File | Concern |
|---|---|
| `calculation/outline/ceruti-calcs.ts` | Outline solvers — where the bout/corner/center-bout arcs actually sit. Plus mould & block fabrication geometry. |
| `calculation/outline/ceruti-paths.ts` | Turns solved arcs into SVG path strings: inner/outer trace, insets, purfling, fluting, the scroll's side profile (`defineSideScrollPath`, read off the arcs alone so this file needn't import `ceruti-scroll`, and `definePlacedSideScrollPath` set on the neck), and the front profile (`defineFrontProfilePath`: the body cut where the neck covers it, with the board and nut laid over). The three neck readers that needs — `mortiseFloorY`, `neckHalfWidthAt`, `fingerboardEnd` — live here too, since this file can't import `ceruti-neck`. |
| `calculation/arching/ceruti-arching.ts` | Long-arch height profile, station normalization, `bodyLandmarks`, the `*AtY` half-width queries. The layer that decides *where* a section is taken and how tall the arch stands there. |
| `calculation/arching/ceruti-arch-geometry.ts` | The gouge's circular section, the crown, and the tangency joining them. Answers "what shape is the section here". |
| `calculation/arching/ceruti-surface.ts` | The evaluable height field z(x,y) over the plan view. Cross-arch templates, STL. |
| `calculation/neck/ceruti-neck.ts` | The neck set in the side elevation: `calculateNeck` places the neck wood's four corners, the heel arc and the bridge on `p.neck`, and the functions beside it read the dressing (button, nut block, fingerboard, bridge wedge, guides, the neck's own path) off those for the render. Hangs off the top plate's edge via `topPlatePlacement`, so the rib taper carries through. |
| `calculation/neck/ceruti-scroll.ts` | The scroll in its own side-view frame: the volute's spiral styles about the eye, and `calculateScroll`, which lays the spiral out and runs the back and front off it, writing every arc onto `p.scroll` the way `calculateNeck` writes `p.neck`. Three panels edit it, each drawing its own part: volute (the spiral and the crown, S0–S1), scroll (the back from S2 on, and the front), and scroll widths (the back and front views beside the side profile, see *The scroll's widths* below). |
| `calculation/neck/ceruti-scroll-views.ts` | The scroll seen from behind and in front, as strokes with ink names: the scroll widths panel draws them beside the side profile, and the plan profiles set them on the neck's end. See *The scroll's widths* below. |
| `calculation/neck/ceruti-neck-template.ts` | The neck and scroll template for the export panel: the side outline as one closed loop, neck foot to duck tail, and the volute inside it as a slotted stencil. See *The neck template* below. |
| `ceruti-types.ts` | `EnricoCerutiParams` and the whole serialized shape. View flags. Stays at the top level with `ceruti-serialization.spec.ts`, which tests its save-and-reopen contract, and `ceruti-fixtures.ts`, the test fixtures every group's specs share. |
| `templates/ceruti-templates.ts` | Bundled historical instruments (Strad Goetz, Del Gesu Baltic, …) as pasted recipe JSON. **Append-only** — add instruments, don't restructure. |
| `templates/corpus/` | Instruments traced from open-licence museum records — one `.json` file each, listed in `templates/corpus/index.ts`. Same type as the templates above, but carrying a `source` link and a per-image `ImageCredit` so the numbers and the pixels can each be rechecked. New instruments go here, not in `ceruti-templates.ts`. |
| `templates/local/` | Gitignored developer scratch space — traces and theories with no provenance to check, never shipped, never swept by the suite. Shows up in the picker only on a local dev build. See that folder's `README.md`. |
| `panels/` | One folder per sidebar panel. Panels are thin; see the layer rule in the root CLAUDE.md. The ⓘ write-ups, explanatory tooltips and condition messages live under `src/app/docs/` (root CLAUDE.md), not in the panel; `panels/render-toggles/` is the strip of per-panel view toggles. |
| `renders/` | Violin drawing several panels share. `front-profile.render.ts` is the instrument as far as it's been taken, see *The front profile* below; `body-side-profile.render.ts` the side elevation both the long-arching and neck panels draw on; `render-constants.ts` the highlight types. Colour comes in as the panel's `PanelPalette` (`src/app/theme/`, root CLAUDE.md) and is read by position, `pal.ink(2).lightness(0.6).css`. A panel's own renders live in its panel file. |

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

## Settled decisions — don't re-litigate

- **Colour is positional: a panel names a palette and reads `pal.ink(i)`, never a part's name**
  (2026-10-07). Sixty hand-picked hexes became a `CerutiColors` role map for a day, then went
  entirely: `CerutiPanelBase` takes the `Theme` as its input, `paletteId` says which palette this
  panel reads (every panel on `classicCremona` so far), and `pal` is that palette resolved, which
  every render function takes too. Palettes are interchangeable lists of any length, read wrapping,
  so a panel's colours change by naming another palette, not by changing keys. Shared parts keep
  one colour because one render function draws them (the front profile, the neck, the scroll
  views). The scroll views emit part tokens (`front`, `back`, `turns`, `neck`…) that `viewInk` in
  the widths panel maps to inks. The `Off`/`Off2`/`Muted` greyings are gone (root CLAUDE.md, *Colour
  has two tiers*). Specs that need to tell strokes apart use `labelTheme()`, whose inks' `css` is
  their recipe (`ink2+0.6`, `neutral-0.3`), so a tone change shows up as a label change in the spec.
- **A reference image can be scoped to particular panels**, via `scope` on
  `ReferenceImage`/`ImageShape` — full mechanics are in `draft-canvas/tools/CLAUDE.md`. What's
  specific to this model: `initializePanelFlow` hands `panelOrder` down to
  `ToolboxStore.setAvailablePanels` so the bottom bar's scope menus have real panel labels, since
  this is the one place that already has them.
- **A template carries `arching` only where it ships the profile that arching was read from.**
  **Never fabricate arching values for a named instrument** — a plausible-looking crown on
  "Strad Goetz" is an invented measurement of a real object, and published sections for these
  instruments are scarce and mostly paywalled. What changed (2026-09) is that a museum side-view
  photograph turns out to be a usable source: the long arch is read off the silhouette and then
  corrected by hand in the panel. So the rule is now a pairing rather than a prohibition, and
  `ceruti-templates.spec.ts` enforces it — a corpus template with an `arching` block must also
  ship a reference image scoped to the `longArching` panel. A template with no such image still
  carries no arching, and the plate is seeded from
  `defaultArchingParams` by whichever arching panel or the surface builder reaches it first.
  Each entry's `description` records how far to trust its numbers; the top plate is occluded by
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
  radius.
- **The fingerboard's thickness is one number, not two.** It runs parallel to the neck at a
  uniform `thickness` — a real board is planed thicker toward the body as the crown rises under
  it, but that's not worth a second variable here.
- **The neck wood's thickness is one number too, root to nut.** `NeckParams.thickness` sets
  `back.nut` and `back.root` equally; templates read as uniform enough here that carrying
  separate root/nut values wasn't earning its keep. Entered once, under the "Neck" section.
- **S3's end angle is always solved, from `hang`** (2026-10-05 as a `fitToNut` toggle over an
  authored angle; 2026-10-06 the toggle and the End field went, `hang` being the only way a maker
  thinks about it). The duck tail comes down to `hang` mm below the nut's lower edge (y = −hang in
  the scroll's frame) and the angle is read back onto `S3.start`; the other of the two angles at
  that height is passed over for the shorter sweep. The nape therefore sits at a fixed height
  whatever the back above it does, and a back whose S3 can't reach that height is a solve failure,
  not a shorter arc. A spec fixture's back has to come down to the nut.
- **The duck tail's round is the back's own width, entered** (`widths.duckTail`, 2026-10-06). Seen
  from behind the round is the edge where the pegbox's flat back dives into the neck's half-round. It
  was first read off the neck's half width at the duck tail, or the hips' when the pegbox's foot was
  narrower, which held while the back's widths were the front's; with the two split (see *The
  scroll's widths*) it is a number of its own, seeded at the neck's width. A violin's is about the
  neck and the round spans the pegbox; a cello's foot is wider (Strad: foot 46, neck 33, hang 16.5
  = the round's radius, so the round's top lands on the nut's lower edge) and the cheeks stand out
  past the round down to the foot. An earlier toggle between a hip-wide and a hang-deep round was
  tried and dropped.
- **The nape is a fillet off a square line, or one circle (`napeCircle`, 2026-10-06).** Off, a
  line runs square from the duck tail to the neck's back and the nape arc fillets the corner, which
  needs the radius no more than the gap between them. On, the nape is the circle of that radius
  through the duck tail tangent to the neck's back, which needs the radius at least half the gap:
  at the gap it is the same quarter turn with no straight; tighter, it rises off the duck tail
  before coming round and meets the neck higher, which is what a cello wants, since the nape takes
  neck a player needs; wider, it meets the duck tail at an angle. `nape.end` is the duck tail's
  angle, so walk the arc by `start`/`end`, never by a quarter turn.
- **The hips have their own height** (`ScrollParams.hipHeight`, 2026-10-06), up from the nut's
  top (`pegboxHipHeight` reads it into the scroll's frame), seeded onto the round's top
  (`duckTailRoundTop`) by `calculateScrollWidths` and clamped no lower than the duck tail. It was
  briefly derived from the round, which only holds while the round is the hips' own: a cello's hips
  sit on the pegbox's foot whatever the hang. At 0 there are none: the nut's width holds to its top
  and tapers from there to the throat, and the panel disables the hip's width. Below 0, a cello's
  on the pegbox's foot, they hold their width down to the foot.
- **The scroll continues the neck's own plane; the nut sits proud of it.** The origin the
  volute's eye is measured from starts at `nut` (the fingerboard-plane point), not the string
  contact point raised by the nut's thickness — the pegbox/scroll is flush with the neck as it
  runs on past the nut, and the nut itself is the thing standing proud, not a step the scroll
  itself takes. Building the scroll off `nutString` looks tempting since it's the point closest
  at hand, but it makes the scroll jump up to string height at the nut and is wrong.
- **A panel's help-text info icons are added by hand, not by an agent.** Don't add an `ⓘ`
  button or a new `FIELD_HELP` entry when adding a field; leave that to a human pass. The neck
  panel's write-ups in `docs/field-help.ts` exist but aren't bound yet.
- **The neck's own `length` places the nut; the string figures are read off, not dialed.**
  `length` runs along the fingerboard plane from where it crosses the mortise floor to the nut's
  bottom (`neckTop`) — that crossing moved `length` toward the nut. `stringLength` (nut to bridge, the
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
  saved recipe. As of 2026-10-04 `NeckParams` carries `root`, `neckTop`, `backRoot`, `backNut` (the
  neck wood's corners), `plateAtMortise` (2026-10-06, it needs the arch solve) and `heel` as a plain `Arc` whose `r` is the entered radius; a heel that
  can't stand keeps its stale arc and `heelStands` gates every reader. The bridge and nut live on
  their own top-level `p.stringSetup`, which `calculateNeck` also writes once it is set: `bridgeFoot`, `bridgeTop`
  (the one piece that needs the arching solve) and `nutTop`. The string length readout is
  `stringLength(p)`, not stored. Everything else the panel draws is a function in `ceruti-neck.ts`
  reading those and the authored numbers — `buttonTip`, `mortiseFingerboardIntersect`,
  `plateEdgeAtNeck`, `heelFace`, `bridgeWedge` (`mortiseFloorY` and `fingerboardEnd` moved to
  `ceruti-paths.ts` on 2026-10-05 with `defineFrontProfilePath`) —
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
- **The neck set's one readout is the figure a maker checks with a ruler, nothing else.** It sits
  on the string setup panel now.
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
- **Fingerboard and nut are reference geometry, not template inputs — except where the nut sets
  up the scroll.** Nothing on `p.stringSetup` touches the neck's own carved shape (the back, the
  heel, the button, the mortise) — the fields exist to draw the fingerboard/nut and feed the string
  readout, since fingerboards and nuts are fitted independently of any template this app produces.
  Three numbers, split 2026-10-05 after one `nutThickness` had stood for all of them:
  `fingerboardThickness` is the board at its edges, `fingerboardRadius` the cylinder its crown is
  cut from (the crown rises by the sagitta of the board's width, so far more at the body end than
  the nut; `fingerboardCrown`), and `nutThickness` the nut's total height off the neck plane, which
  is where the string sits. A nut below the crown at the nut is reported as a `nutThickness` miss,
  and a radius no larger than the board's widest point (its end) as a `fingerboardRadius` one.
  The thickness was once removed (2026-09-20) as a ~1 mm string-above-board figure; it came back
  measured from the neck plane instead, so it never has to be added to anything. Two more nut
  numbers (2026-10-05) do shape the scroll, so they're entered on the scroll's panels rather than
  the neck's: `nutHeight`, its length along the neck, which the pegbox's flat rises from the top of
  (a fixed 6 mm scaled by body length until then), and `nutWidth`, which sets where the scroll's
  path starts. Nut width is its own number, not the neck's `topWidth`: a cello's nut is often much
  wider than its neck. Both live on `p.neck`, not `p.stringSetup` (2026-10-06): the nut's seat is
  the neck's, and the scroll panels seeding `p.stringSetup` to reach them left no way to tell
  whether the string setup had been set.
- **The string setup is its own panel** (2026-10-06), the last before the mould. Bridge, nut,
  fingerboard and the string length readout were a "String Setup" section of the neck panel from
  2026-09-20; they moved out so the setup can grow without crowding the neck, since none of them
  feed the neck's own template geometry (previous bullet). Only the string setup panel seeds
  `p.stringSetup`, so its presence means the panel has been visited: until then the neck panel, the
  front profile and the long arching panel's neck draw the bare neck, with no bridge, board, nut
  or strings, and the neck runs on over the nut's seat to the scroll. Once set, the neck panel
  draws the board and nut as plain grey profile, a later panel's work, and never the bridge or
  strings. The string setup panel draws its own parts in colour over a neck in plain grey, all but
  the line the neck's length runs along, since that field is entered on both panels
  (`neckSetPalette`). Its sections are Neck (length and nut thickness), Fingerboard, and Bridge
  with the string length readout. Each panel's `buildRun` solves and draws the scene
  itself, from the renders `neck-panel.ts` exports. The fret marks toggle went with the strings; the neck's dimension guides
  stayed with the neck. The scroll panels still draw the nut, at the default thickness until set.
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
  segment sitting mid-drawing read as an unfinished edge rather than a deliberate one. As of
  2026-10-06 the mortise floor is drawn only from where it comes out through the top plate's
  surface (`plateAtMortise`, solved off the top arch in `calculateNeck`) out to the neck's face; the
  rest of the foot is inside the block and can't be seen from the side. `defineNeckPath` still
  traces the whole foot, since that's wood a neck template has to cut.
- **Fingerboard length defaults to a standard size by instrument, and the board is a view
  toggle, defaulted on.** `standardFingerboardLength(p.height)` uses the same body-height
  thresholds `calculateMould` uses to tell violin/viola/cello/bass apart (`<400`/`<500`/`<800`/else
  — 270/310/580/850 mm), since modern boards come in a handful of stock lengths. It was the only
  source of the length from 2026-09-20 until 2026-10-05, when `stringSetup.fingerboardLength` came
  back as an entered field seeded from it. The board draws behind the `showFingerboard` toggle
  (`CerutiViewFlags`/`RenderToggleKey`, default `true` in `DEFAULT_CERUTI_VIEW_FLAGS`), so it can be
  hidden without losing any geometry that depends on it. In the front view the board replaces the
  neck's outline rather than drawing over it. The board has its own colour, a shade lighter than
  `colors.nut`, which the nut uses in every view including the scroll's.
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
  reproduce an untapered instrument exactly. `maxRibTaperMm` bounds the
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

## The scroll's widths

- **The front and the back are two width systems, not one** (2026-10-06). Until then the pegbox's
  width went by height, back and front alike, and the back's own edges were the front's taper
  carried round; the more the real thing was studied the less that held: the front is sawn straight
  through the blank, the back is carved off the volute. Widths are full widths, held by name on
  `p.scroll.widths`, and where each sits is read off the arcs (`scrollWidthStations`), not stored.
  The panel is three sections, Front, Back and Turns, and the palette follows: the front's stations
  warm like `scrollFront`, the back's blues like `scrollBack`, the turns' greens like `scrollTurns`,
  so an edit's colour says which part it moves. In the back and front views everything past the
  crown (each turn's contour, its faces and the eye) draws in `scrollTurns`, the same in both views;
  the head's back up to the crown keeps `archBack` and the pegbox's front `archTop`. The plan
  profiles draw all of it grey.
- **The front goes by height** (`pegboxWidth`): straight lines sawn through the blank. The nut's own
  width (`neck.nutWidth`) holds to the nut's top, the cheeks run out from its edges to the
  `hip` (the pegbox's widest, at `hipHeight`), taper back from there to `throat` at the foot of the
  front's straight (`scrollThroat`, F1's `end`; it was F1's far end on the spiral until 2026-10-06),
  and carry that slope on up F1 to where it meets the spiral (`scrollFrontTop`) rather than holding
  the throat's width. The hips replaced a straight held at the nut's width (2026-10-06): on a real
  head the pegbox stands a little proud beside the nut and comes to a point there, tapering both
  ways. The hollow's `wall` is the front's too, one thickness for the cheeks and the floor alike
  (2026-10-06, after a day as two numbers and a day parked out of sight).
- **The back is "the path"**: from the top of the duck tail's round, over the crown and round the
  spiral in to the eye. `duckTail` is the round's diameter, entered, where it used to be read off
  the neck or the hips, and `foot` the back's width at the round's top, a radius up from the duck
  tail: a violin's is the round's own, a cello's wider, the round meeting it along level shoulders at
  angles 0 and π, clamped no narrower than the round. From there the back's edges go out on
  straight slopes, by height, to `backHip` at `backHipHeight`, up from the nut's top like the
  front's, and on to `poll`. A violin's back has no hip, so it defaults to 0, which is none, as is
  any height at or below the round's top: the back runs one slope from the foot. A cello's hip as
  wide as the foot leaves the back parallel up to it, the straight run its head has. The panel
  disables the back hip's width while its height is 0 or less. The hip's clamps, none at or below
  the round's top and the poll past it, are read in `backHipY` rather than written back, so the
  field doesn't jump under typing. The poll is the back of the head (2026-10-06, named `reach` for
  a day): its furthest reach, where its tangent runs straight up the neck (the first of S2, S1 and
  S0 to pass straight behind its centre), the same point `scrollExtent` reads the head's depth off.
  From there the curve goes by distance along the path (`pathWidth`), a monotone spline through
  `crown`, `turn1Bottom`, `turn2Top`, `turn2Bottom` and `eye`, leaving the slope tangent. A back
  with no poll above the path's start runs the slope up to the crown. The last turn is as wide as the eye from its top on in, so it has no width of its own.
- **`calculateScrollWidths` only seeds and clamps**, writing back: foot no narrower than the duck
  tail, crown no wider than the poll, each turn at least as wide as the one before, and the front's
  hips no lower than the duck tail.
- **Module arcs on the widths panel mark the widths a maker sets out with compasses** (2026-10-06):
  each a circle its width across on its view's centreline at the station's height, with a dashed
  centreline down each view, the back's in `scrollBack`. Behind, the crown, the poll and the duck
  tail; in front, the crown, the throat and the hips. The crown's and the throat's hang as half
  circles from the head's top and the pegbox's. The duck tail's station is the round's centre, so
  its circle has the round for its lower half. Every station once had a circle; it was too many to
  read. Module guides put a crosshair on each station in the side view and on both its edges in its
  own view.
- **From behind, the pegbox's sawn front shows wherever it stands out past the back**, in the front's
  colour: the cheeks from the throat down the hips to the nut's edge and the foot, and the foot's
  edge in to the neck, each hidden inside the round and the back's own silhouette. That one rule
  replaced the old special cases (the back's own cheeks under a round the hips sat below, walls only
  while the front hung below the path's start, a level shoulder out to the cheeks). A neck wider than
  the round, or than cheeks wider still, meets it along a level shoulder at the round's top.
- **The hollow** is `pegbox.wall` in from the outside in the front view, and in the side view
  (`pegboxCavity`) the back carried in by the same `pegbox.wall`, between a wall under the nut leaning 15°
  off square (`NUT_WALL_LEAN`, fixed) and one square to the neck where the front's straight ends.
- **Both views carry the neck on below** by `scrollNeckHalfWidth`, the authored taper, since
  `neckHalfWidthAt` needs the whole neck solved against the body.
- **The back and front views are drawn as a draughtsman would, not projected.** `scrollPathStretches`
  cuts the path at the crown and the turns into six stretches, each up the volute's back or down
  its front, and `scrollBackViewStrokes`/`scrollFrontViewStrokes` list which show and which stop at the height of the
  next turn nearer the viewer. Those cuts alone turned out not to be enough (2026-10-05): which of
  two stretches at a height is the wider depends on the widths entered, so every stretch but the
  nearest also passes through `seen`, which drops points behind a stretch nearer the viewer
  (`Pt3D.z`, the side view's x) and at least as wide. The pegbox's front above the first turn's
  bottom goes through the same check. Nothing hidden is drawn. A general projection and masking
  with `occludePath` were both weighed and passed over. The hollow is dashed in the side view only.

## The front profile

- **A panel shows the user's earlier work under its own, in the trace grey** (2026-10-06), so the
  instrument reads as one thing being built rather than separate edits. The panel solves its own
  stage, then `ensureFrontProfilePaths` re-solves every stage after it that the user has reached
  (`hasCorners`, `hasCenterBout`, `hasOuterTrace`, then the f-holes if placed and the neck if set),
  and `renderFrontProfile` draws the most there is. Nothing is seeded: a stage never visited stays
  out of the drawing. Before the outer trace, or while a section fails, that's the rib outline as
  far as it's drafted — `defineInnerPath(p, unsolved)` leaves out arcs not drafted yet or whose
  section failed, and draws the chains that remain as separate subpaths. The finished outline
  still goes through `unifyConnectedSvgPaths`, so a gap in the `'inner'` the mould and exports read
  fails loudly; a partial outline never goes into the cache.
- **The panels that draft the outline show only the outline.** Main bouts, corners and center bout
  are setting the rib's shape, and the purfling or anything past it there is later work in the way.
  Each solves its own stage, re-solves the drafting stages after it that have been reached
  (`calculateInnerOutline` from Main Bouts; just the center bout from Corners), and lays
  `renderFrontInnerProfile` first, with no `[paths]` needed. The full `renderFrontProfile` is for
  the screens past the outline; Base (`renderInstrumentProfile`) and both f-hole panels carry it, F-Hole
  Contours with `fHoles: false`, as it draws the holes itself in colour, and F-Hole Placement with
  `purfling: false`, as the line it wants inside the edge is the rib outline (`'inner'`). Both f-hole panels pass
  `neck: false` to the ensure (2026-10-06): the neck and scroll took the eye off the holes rather
  than giving them context. The render draws the neck only when the solve says it reached it
  (`solve.neck`, like `solve.scroll`), so the flag is given once. The option stays to revisit. Main Bouts and
  Corners carry the inner profile. Center Bout doesn't need it: it closes the outline, so its own arcs
  and the earlier stages it already draws are the whole of it.
- **The plate panels draw both plates, the top where it always is.** (2026-10-06) Outer Path and
  Fluting Channel keep the top centred on x = 0, as every other plan view draws it, with its
  f-holes once placed, and put the back `plateLayoutOffset` to its left, both through
  `renderPlatePair`, which can carry the front and back profiles' neck and scroll once the neck is
  set — proven there on 2026-10-06 and parked the same day, until the profiles have a home of their own.
  The back's button (`defineButton`) draws in `archBack`, the colour the neck panel already gives it. Every view of the top plate reads it as one `PlatePlan` through
  `topPlatePaths` (outline, purfling lines, one path per hole) rather than picking the cache
  entries over again; `defineFrontProfilePath` cuts and returns the same shape.
- **Long Arching can lay the neck under the body once the neck panel has set it** (2026-10-06),
  re-solving `calculateNeck` off its own arch so the neck follows the arch and the rib taper, and
  drawing it in grey through `renderNeck`'s `ground` option, without the strings or the bridge,
  which are set-up rather than the instrument's own profile. The fingerboard always shows there.
  `showNeck` is off as of the same day, for the reason the f-hole panels leave it off.
- **The scroll sits on the neck's end in the body's side elevation** once its panels have started it
  and `calculateScroll` solves it whole (2026-10-06). Its frame's origin is the nut on the neck's
  front, so `scrollOnNeck` is one rotation by the neck angle and a move to `neckTop`, and
  `definePlacedSideScrollPath` is the side profile through it. With it on, `renderNeck` drops the
  wall across the neck at the nut and runs the neck's back up to where the nape meets it, as the
  scroll panels draw that join. In grey on the neck and long-arching panels; the hollow isn't drawn.
  The front view goes on the end of the neck in the front profile (and the neck panel's front view)
  the same way: `scrollFrontViewStrokes` is the scroll widths panel's front view pulled out with a
  placement, and `scrollFrontInPlan` sets it on the neck through `scrollOnNeck`, foreshortened by
  the neck's tilt and nothing more. It was a projection for a day (2026-10-06), each point's depth
  carried into how far up the body it lands — but only the volute's contours carry a depth, so the
  pegbox, the nut and the turns' faces landed at other heights and the drawing came apart. The
  widths panel's drawing, set on the neck, is the one wanted. `solveNeckForProfile` is the one
  re-solve every such view runs, the neck against the top arch and then the scroll.
- **The back profile is the back plate with the neck's two sides and the scroll's back view**
  (2026-10-06), proven on the plate panels and parked there. `defineBackNeckPath` runs the neck's sides from the
  mortise floor to the nut and cuts them against the back plate's outline, since the plate is the
  nearest thing to the eye from behind, so they come out of the button or the edge wherever that
  falls. `scrollBackViewStrokes` is the widths panel's back view pulled out like the front, and
  `scrollBackInPlan` sets it on the neck the same way, its own neck sides carried on from the nut
  (`neckFrom`) rather than from below it, where the profile's are. No heel from behind: the neck
  geometry that would need isn't constructed anywhere yet, and these views won't live on the plate
  panels for good.

- **The front profile sits on x = 0 and the side profile to its left, on every panel** (2026-10-06).
  Every plan view already centred the front on the origin. The side elevation is still drawn in its
  own frame (x up off the back, y down the body) and moved over by one `translate` on a group in
  each panel's `buildRun`, to `sideViewOffsetX`: far enough left that the bridge's top clears the
  plan's widest point by a quarter of the body's width. It's read off the body and the bridge's
  height alone, so the long arching and neck panels put it in the same place whether or not the
  neck has been set. The neck panel's front view no longer moves right (`frontViewAxisX` is gone).

## The neck template

- **The volute is a stencil: slots along the spiral with bridges between them, falling back to
  pricked dots.** (2026-10-06) The oldest templates pricked dots the maker joined by eye; cutting
  the spiral through would leave a ribbon that can't hold its shape. `defineNeckTemplate` cuts the
  spiral from the eye out to where F1 meets it — from there out the spiral *is* the outline, the
  pegbox front running in under the first turn — as capsules on the arcs. One wall of each slot is
  the curve itself, the wall away from the eye, and the slot's width is taken inward, so the maker
  rides a pencil against the true wall as they do the outline's edge; a slot centred on the curve
  would let the line wander by half its width. Bridges sit at the arc junctions (tangent points the
  maker would mark anyway) and at least every `bridgeEvery`; a slot shorter than `minSlot` is merged
  across the junction. Where the web left between a slot and the next turn, or the front's edge,
  would be under `minWeb`, that stretch is pricked instead — unless it's a short one at either end
  of the stencil, where the curve runs on into the eye or into the outline at F1's crossing and
  needs no marking (the default violin's last few millimetres before the crossing). The eye is a
  prick at its centre, not a hole, which would leave a thin ring to the innermost turn. `NeckTemplateSpec` holds those numbers; the cuts (`slotWidth`, `bridgeWidth`,
  `minWeb`, `dotRadius`) are the material's and don't scale, the run lengths scale with body length.
  Not on params yet: `defaultNeckTemplateSpec` is the only source until a panel gives them fields.
- **The outline is one loop, closed along the back's inner face.** The neck's foot has no back-face
  point solved (see `defineNeckPath`), so the loop runs the mortise floor, the fingerboard plane up
  through the nut's footprint, the scroll's front, the spiral out from F1's crossing, S0–S3, the
  nape, the neck's back down over the heel and face, and closes from there to the mortise floor
  along x = 0. SVG only for a day (2026-10-06), until the scroll sheets brought PDF and DXF with them.

## The scroll back strip

- **The back profile is the back unrolled into a strip** (2026-10-06), `scrollBackStrip`, as old
  schematics print it to lay over the carved back and draw round. Up the strip is distance along
  the side profile from the duck tail to the bottom of the second turn; across it, the back's width
  there from `pathWidth`, so the paper bends back into place on the wood. Below the path's start
  it is the duck tail's round, mapped by height onto that distance, closing to a point at the duck
  tail; a foot wider than the round steps out to it level. The outline alone, no marks, labels or
  centreline, like every other template. It needs the scroll solved whole but not the neck set
  against the body.
- **The compass walk is the older tool for the same job** (`scrollCompassWalk`, 2026-10-06): a box
  to cut, its spine up the middle marked with a crosshair and a circle at each station, the circle
  the width across there. Along the spine each station sits the straight compass distance from the
  last, not the distance along the path, so a compass set between two crosshairs steps the same on
  the wood; the circle sets it for the width. The duck tail is at the bottom, a wider foot rings it,
  a back hip has its own station, then the poll, and from there `compassSteps` equal steps (10 by
  default, a field on the widths panel) the last landing on the second turn's bottom. The step is
  solved by halving, not set: the stretch divided (`volute`, about 175 mm on a violin, 375 on a
  cello) is the path's own length from the poll, while the compass cuts each bend short, so a given
  step size leaves an odd remainder and a count keeps the walk alike on every size. Every station,
  the last included, is the first point along the path a step from the one before, never an arc
  struck straight at the end: the spiral passes within a step of the end from stations still turns
  away, and such an arc would cross the back twice. So too few steps (under about 10 on any size,
  a chord spanning a bend) has no exact solution, and the last step comes up short of the rest; the
  widths panel's readout says so beside the step and the stretch. The box is sized from the circles, not the spine, so the duck tail's circle
  clears its bottom; the last station is a flat, so its circle is the half hanging under it, the flat
  drawn across its top; faint straight edges join the circles' sides, the outline the strip gives in
  full; and each centre is a star of three short lines through it on a heavier path of its own, so
  the beam crosses the point three times and it reads apart from where a circle crosses the spine. The strip and the
  walk share one guard in the export panel.
- **The front and back views export as they are drawn** (2026-10-06): the widths panel's
  `scrollFrontViewStrokes` and `scrollBackViewStrokes`, each flattened to one path on a sheet that
  starts at its lowest point, the neck's sides from the nut up. The same guard. One difference
  (2026-10-07): the panel's back view shows the pegbox's sawn front wherever it stands out past the
  back, so a back cut thinner than the front is seen to be; on the sheet that read as the back's own
  outline, so `scrollBackViewStrokes` takes `{ front: false }` there and draws the back alone, the
  neck's sides running up into the round. The turns' occlusion is kept: it is the volute's shape.
  The front view carries nothing of the back, so it exports unchanged.
- **All five neck and scroll sheets export as SVG, PDF and DXF** (2026-10-06) through one
  `scrollSheet` in the export panel that builds each sheet's paths once; the SVG keeps the stroke
  weights, the PDF draws every path at one weight and the DXF carries none. The full plan PDF
  carries each that can be built, after the arching templates, and leaves the rest out without a
  word, as it does the arching pages.

## Adding a panel

Six edits. Missing one fails quietly — usually a panel that never unlocks — so work the list.

1. **`ceruti-types.ts` → `CERUTI_PANEL_IDS`** — the id. `panelOrder` is typed against it, so this
   one is loud: skip it and step 3 fails the build. It exists because panel ids are file-format
   vocabulary now — a template's reference images scope themselves to panels by id
   (`ReferenceImage.panels`), so renaming a panel is a migration rather than a rename.
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
no kink at the taper).

## Notes

- `ceruti-surface.spec.ts` and `ceruti-arch-geometry.spec.ts` hold the suite's slowest tests —
  the dense sweeps below are why. `npm run test:arching` (root CLAUDE.md) runs just the 3D
  pipeline (`ceruti-arching*`, `ceruti-arch-geometry`, `ceruti-surface`) instead of the full
  suite; `npm run test:outline` runs the 2D one. `npm run test:panels` covers `panels/panels.spec.ts`
  and `export-panel.spec.ts`.
- Three specs sweep densely enough to run several seconds and were flaky against vitest's 5s
  default, so each carries an explicit 20s timeout. Keep them: in every case a sweep coarse
  enough to fit the default is coarse enough to step over what the test exists to catch.
  - `ceruti-arch-geometry.spec.ts` — "eases into the taper without a kink", "moves the contact
    smoothly as the crown changes"
  - `ceruti-surface.spec.ts` — "never voids a station row inside the body"
- **No spec reads a served template** (2026-10-06). `ceruti-templates.ts`, `corpus/` and `local/`
  are re-saved from the running app as an instrument is retraced, and a tolerance pinned against
  one then fails on unrelated work. `ceruti-fixtures.ts` builds every historical instrument from
  `templates/test-fixtures/`, frozen copies the specs own; to follow a template's change, copy its
  `params` in as a new file. The one exception is `ceruti-templates.spec.ts`, which validates the
  served set itself.
- The suite's own rules (2026-10-06 purge, 1362 → ~970 tests): no tests that only check a DOM node
  appeared, none that pin a number read off `DefaultParams` or a template, no per-template
  fan-out of a check the outline spec already makes once. Assert invariants — closure, symmetry,
  tangency, `on > off` — not counts or coordinates. A spec that touches no DOM API opens with
  `// @vitest-environment node`; the jsdom spin-up per file was most of the run time.
- Panels share `onArcFocus`/`onArcBlur`/`adjustArcStart`/`adjustArcEnd`/`nearestFraction`. If you
  add a sixth copy, hoist instead.
