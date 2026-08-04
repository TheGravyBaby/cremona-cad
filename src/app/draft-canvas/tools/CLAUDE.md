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
- **`toolbox-store.ts`** — root singleton holding drawn shapes, with undo/redo. Backed by
  **sessionStorage**: shapes survive reload, die with the tab. This is a scratch annotation layer,
  deliberately not part of the saved recipe.
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

**Missing `layerId` means `DEFAULT_LAYER_ID`,** not a migration. Shapes persisted before layers
existed land on the first layer for free. Keep it that way.

**Reference images are the one exception to sessionStorage.** `ImageShape` lives in the same shape
list — so it gets selection, move, delete, layers and undo for free — but its durable home is the
recipe's `referenceImages` field. `exportState` leaves images out; they're re-derived from the
recipe on load. `reference-image-schema.ts` is the only place that translates between the frozen
file format and the canvas object model, which is what lets the canvas side change freely. Keep
the translation there, and keep emitting the same field so files stay openable in older builds.
The deprecated singular `referenceImage` still loads, folded into the array.
