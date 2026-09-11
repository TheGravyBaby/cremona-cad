# draft-canvas/tools

The drawing toolbox: pluggable tools that sketch and trace on the canvas, snapping to the geometry
the recipe rendered underneath.

Most files here carry a header comment explaining their own contract. Read it before editing.

## The shape of the thing

- **`draft-tool.ts`** — the `DraftTool` interface and `DraftToolHost`, the narrow subset of
  draft-canvas a tool may touch. Tools receive points already in world (mm) space; draft-canvas
  owns pointer routing and the render loop.
- **`tool-registry.ts`** — root singleton holding every tool and which is active. `toolRows` is
  where you register a new one; the palette and pointer routing pick it up automatically. One
  row = one palette row; a nested array = one button plus a caret holding variants of the same
  shape kind.
- **`toolbox-store.ts`** — root singleton holding drawn shapes, with undo/redo. Persisted through
  `helpers/workingStorage.ts`, so shapes survive a reload but not the tab closing. Still a scratch
  annotation layer, deliberately not part of the saved recipe.
- **`toolbox-shape.ts`** — `DraftShape`, the method-free plain-object union. See below.
- **`snap-engine.ts`** — indexes snap candidates by reading the *rendered SVG*, not recipe data,
  so it works for any recipe and for toolbox shapes alike.
- **`shape-renderer.ts` / `shape-grabbers.ts` / `shape-hit-test.ts`** — drawing, handles, picking.
- **`image-asset-store.ts` / `reference-image-schema.ts` / `image-placement.ts`** — reference
  images: the pixel table (plus the upload and paste-a-link passes that feed it), the file-format
  translation, and where a newly added image lands. See below.

## Adding a tool

Write `createXTool(...)` returning a `DraftTool`, then add it to `toolRows` in `tool-registry.ts`.
Nothing else needs touching. `two-point-tool.ts` is the base for anything drawn from two clicks
and handles angle-lock (Shift) and tangent-lock (Ctrl/⌘) for you.

Flags worth knowing: `oneShot` commits on a single click and returns to Select; `actsOnSelection`
keeps the selection alive across activation, for transform tools like Offset.

## Constraints that bite

**`DraftShape` is a plain-object union with no methods, on purpose.** It crosses a serialization
boundary that has no calc pass to rebuild prototypes — unlike recipe geometry, which
`ceruti-calcs.ts` reassigns through real constructors on load. Don't put a getter or method on it,
and don't reuse `models/types.ts` classes here. Sharing geometry *math* via `helpers/math/` is
encouraged; sharing those *types* is not.

**`ArcShape` sweeps counterclockwise** (root CLAUDE.md's arc-sweep trap). Ordering of
`startAngle`/`endAngle` alone selects minor vs major, so unlike `models/types.ts` `Arc`, tools can
draw >180° sweeps with no out-of-band flag. Converting past 180° is lossy — don't write a blind
converter.

**The active layer says where new shapes land, not what you can edit.** Anything on a visible,
unlocked layer is selectable and editable, whichever layer happens to be active — hide or lock is
how you put a layer out of reach. `getEditableShapes()` is the single gate; every selection path in
`draft-canvas.ts` reads through it, and the store's own mutators gate on the shape's layer lock
rather than the active layer. Keep those two agreeing.

**Missing `layerId` means `DEFAULT_LAYER_ID`,** not a migration. Shapes persisted before layers
existed land on the first layer for free. Keep it that way.

**Adding a reference image is not a tool.** It was one until the reference-image controls were
gathered into the bottom bar's image list, and it never fitted: its input is a file or a link
rather than a click, so it did its whole job in `onActivate` and handed control straight back —
and having it in the palette as well meant two entry points, only one of them beside the list of
what you had already placed. `toolRows` has no image entry and `tool-hotkeys.ts` no `KeyI`.
`draft-canvas`'s `placeImageFromFile`/`placeImageFromLink` are what the list's two buttons call;
`image-placement.ts` holds the sizing. A pasted link is inlined into the recipe when the host
sends CORS headers and kept as a bare link when it doesn't — `prepareLinkedImage` explains the
trade, and the user is told which they got.

**Reference images are the one shape the toolbox does not own.** `ImageShape` lives in the same
shape list — so it gets selection, move, delete, layers and undo for free — but its durable home is
the recipe's `referenceImages` field. `exportState` leaves images out; they're re-derived from the
recipe on load. `reference-image-schema.ts` is the only place that translates between the frozen
file format and the canvas object model, which is what lets the canvas side change freely. Keep
the translation there, and keep emitting the same field so files stay openable in older builds.
The deprecated singular `referenceImage` still loads, folded into the array.

**Every field on `NamedReferenceImage` must also exist on `ImageShape`.** The canvas is the live
copy: recipe-base subscribes to this store and rewrites `referenceImages` from the placed shapes on
every change, so a field that stops at the file type is erased the first time the user touches the
canvas — and only visibly so after save-and-reopen. `panels`, `excludePanels`, `isDefault`, `crop` and `credit`
are the shape of field this catches: authored in a template file rather than arrived at by dragging,
and easy to leave out of `imageShapesToRecipe`.

**Panel-scoped images.** An image's `panels` list names the recipe panels it belongs on; empty or
absent means all of them. The recipe pushes the open panel through `setActivePanel` and
`getVisibleImages` filters on it. The store only compares strings — it never learns what a panel is,
which is what keeps this out of the canvas's instrument-agnostic boundary. `activePanel` is view
state like the two masters: not persisted, not undo-tracked, and not cleared by `resetAll`, since
the open panel outlives the file shown in it. A `null` panel filters nothing, so a recipe that
forgets to push shows an image too widely rather than hiding one with no indication of why.

**A panel can be deliberately blank.** `excludePanels` is `panels` written from the other end —
"all but these" — and it's absolute: checked before `panels` and before `isDefault`, so nothing
overrules it. It exists because a panel nothing claims falls through to the default view, and
"this instrument has no usable cross-arch photograph" had no way to be said; showing the plan shot
there instead invites tracing the wrong thing. Excluding is about the *image*, not the panel, so
adding a real reference scoped to that panel later just works with nothing to undo. The settings
bar hides the two encodings behind one checkbox per panel meaning "shown here", storing whichever
list is shorter — see `writeImagePanels`, which also explains why the short list is the one that
ages well.

**An `isDefault` image is the set's general view** — "Default" everywhere the user sees it; the
field is spelled out because `default` alone reads as a keyword. With no `panels` of its own, it
shows on every panel no *other* image has claimed by name and steps aside on the ones that have
one — so `imageMatchesActivePanel` checks the image *and* its neighbours, and adding a scoped view
is enough on its own: the general view never has to enumerate what it's still wanted on. Hidden
images don't displace it, so parking the specific view brings the general one back rather than
leaving the panel bare. An unscoped image with no flag still shows everywhere — every image a user
placed by hand. Naming panels and being the default are alternatives; the settings bar clears one
when you set the other, since a default that named panels of its own could never be reached
anywhere else.

**The selected image is exempt from scoping.** `setRevealedImage` holds one id that
`imageMatchesActivePanel` waves through — set when an image is picked from the bottom bar's list or
clicked on the canvas, cleared when the selection moves on or the panel changes. Without it, picking
a row scoped to another panel unlocks and selects something that never appears, and scoping the image
you have selected takes the image and the controls you were using away mid-edit. It overrides
scoping only; `hidden` and the master switch still apply, since those are the user's own switches
rather than the recipe's.

**Cropping trims the box, not the picture's scale.** `crop` holds fractions inset from each edge of
the source, and `x`/`y`/`width`/`height` measure the **visible** rectangle — so grabbers, hit-testing,
the halo and the settings bar's W/H all keep describing what you can see and need no crop-awareness.
`drawImageShape` is the only reader that works back to the source, via `imageSourceBox`, and clips it
to the box. The price is that a crop change has to move and resize the box in the same step so the
retained picture stays exactly where it was, at the scale it was already set to: `applyImageCrop` is
the only thing that should compute that, and `image-crop.spec.ts` pins the invariant (including under
rotation, where the box centre the rotation turns about has itself moved). This is also why the
`<image>` renders with `preserveAspectRatio="none"` — crop fractions only mean anything if the
picture fills its rectangle.

**A reference image is never skewed.** It's a photograph of a real object being measured against,
so a stretched one is a wrong drawing rather than a look, and every way to notice is subtle — an
arch reading a millimetre low, a corner at the wrong angle. All three resize paths (typed W/H via
`applyImageSize`, corner drags, edge drags) take the second dimension from `imageAspect`, and
there is deliberately no unlock. `imageAspect` reads the ratio off the *box* rather than the source
pixels, which is what makes it survive cropping — a crop leaves the box at the cropped picture's
proportions, and those are the ones the next resize should hold — and what lets a hand-authored
template that arrived out of proportion keep what it has instead of jumping when first touched.
`image-resize.spec.ts` pins it from each path.

**Panel choices come from the recipe.** `setAvailablePanels` takes `{id, label}` from
`RecipeComponentBase.initializePanelFlow`, so the settings bar can offer a scoping picker. The store
still learns nothing about panels beyond two strings, and a host that ships none leaves the picker
hidden rather than empty.
