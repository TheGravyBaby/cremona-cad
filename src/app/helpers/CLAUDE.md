# helpers

Instrument-agnostic code. Nothing here should know it's a violin — that knowledge belongs in an
instrument model's own folder. These sit outside any single model deliberately, so a second
instrument module can use them unchanged.

## The two math files, and the line between them

The split is **what the code operates on**, not what it computes.

- **`draftMath.ts`** — plain geometric objects (`Pt`/`Circle`/`Arc`/`Rectangle`). No notion of an
  SVG command string. Sections: Simple Geometry, Arc construction, Complex Geometry, Curve math.
  Intersections, clamping, angle normalization, tangent/biarc solving, polyline indexing,
  monotone and C2 splines, catenary solving.
- **`svgPathMath.ts`** — building, combining and boolean-diffing SVG path *strings*. Sections:
  Path helpers, Path combinations, Arch curve path builders, Arch curve evaluators. Wraps
  `polygon-clipping` and `svg-path-properties`.

If a function takes points and returns points, it's `draftMath`. If it takes or returns a `d`
string, it's `svgPathMath`. `svgPathMath` imports from `draftMath`, never the reverse.

## Everything else

| File | Concern |
|---|---|
| `renderFuncs.ts` | SVG emission — `renderPath`, color/transform utilities. |
| `fileExporter.ts` | SVG and PDF output (`jspdf`, `svg2pdf.js`). |
| `dxfExporter.ts` | DXF output for templates and moulds. |
| `stlExporter.ts` | `buildHeightFieldStl` — CNC plate output. |
| `panelFlow.ts` | The sidebar panel state machine. |
| `debounce-controller.ts` | Used by `change*()` methods before recalculating. |
| `nearestFraction.ts` | Decimal → fraction, plus `NamedConstant` defaults. |
| `arcDegrees.ts` | Degree helpers for the arc input fields. |
| `validators.ts` | `clampParam`, `safeRun`. |

## When adding here

The pull is to write a helper that quietly assumes a violin — a magic proportion, a bout name, a
default sized for a 355mm body. If a function needs that, it belongs in the model's `*-calcs.ts`
instead. The test is whether the name and signature would still make sense to someone drafting a
guitar.

Watch for the reverse too: generic math that has accreted as a private method on a component
belongs here. `normalizeDegrees` and `clamp` arrived that way.

Tests live beside their subject (`draftMath.spec.ts`, `svgPathMath.*.spec.ts`) and run under
vitest via `ng test`.
