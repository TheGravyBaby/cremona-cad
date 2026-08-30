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
- **`image-asset-store.ts` / `reference-image-schema.ts`** — reference images. See below.

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
and don't reuse `models/types.ts` classes here. Sharing geometry *math* via `helpers/draftMath.ts`
is encouraged; sharing those *types* is not.

**`ArcShape` sweeps counterclockwise.** Ordering of `startAngle`/`endAngle` selects minor vs
major, so the value is self-contained and tools can draw >180° sweeps. `models/types.ts` `Arc`
always renders the minor arc and needs an out-of-band flag for the major. Converting this type to
that one is lossy past 180° — don't write a blind converter.

**The active layer says where new shapes land, not what you can edit.** Anything on a visible,
unlocked layer is selectable and editable, whichever layer happens to be active — hide or lock is
how you put a layer out of reach. `getEditableShapes()` is the single gate; every selection path in
`draft-canvas.ts` reads through it, and the store's own mutators gate on the shape's layer lock
rather than the active layer. Keep those two agreeing.

**Missing `layerId` means `DEFAULT_LAYER_ID`,** not a migration. Shapes persisted before layers
existed land on the first layer for free. Keep it that way.

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
canvas — and only visibly so after save-and-reopen. `panels`, `isDefault`, `crop` and `credit` are
the shape of field this catches: authored in a template file rather than arrived at by dragging,
and easy to leave out of `imageShapesToRecipe`.

**Panel-scoped images.** An image's `panels` list names the recipe panels it belongs on; empty or
absent means all of them. The recipe pushes the open panel through `setActivePanel` and
`getVisibleImages` filters on it. The store only compares strings — it never learns what a panel is,
which is what keeps this out of the canvas's instrument-agnostic boundary. `activePanel` is view
state like the two masters: not persisted, not undo-tracked, and not cleared by `resetAll`, since
the open panel outlives the file shown in it. A `null` panel filters nothing, so a recipe that
forgets to push shows an image too widely rather than hiding one with no indication of why.

**An `isDefault` image is the set's general view** — "Default" everywhere the user sees it; the
field is spelled out because `default` alone reads as a keyword. Marked `isDefault` with no `panels`
of its own, it shows on every panel no *other* image has claimed by name, and steps aside on the ones
that have one. So `imageMatchesActivePanel` is a question about the image *and* its neighbours, not
the image alone — which is the whole point: adding a scoped view is enough on its own, and the
general view never has to enumerate the panels it's still wanted on. Hidden images don't displace it,
so parking the specific view brings the general one back rather than leaving the panel bare. An
unscoped image with no flag still shows everywhere, which is every image a user placed by hand.
Naming panels and being the default are alternatives, and the settings bar clears one when you set
the other: a default that named panels of its own could never be reached anywhere else.

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

**Panel choices come from the recipe.** `setAvailablePanels` takes `{id, label}` from
`RecipeComponentBase.initializePanelFlow`, so the settings bar can offer a scoping picker. The store
still learns nothing about panels beyond two strings, and a host that ships none leaves the picker
hidden rather than empty.
