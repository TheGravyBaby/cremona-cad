# helpers

Instrument-agnostic code. Nothing here should know it's a violin — that knowledge belongs in an
instrument model's own folder. These sit outside any single model deliberately, so a second
instrument module can use them unchanged.

## The math files, and the line between them

The point/circle/arc math used to live in one `draftMath.ts` that grew past the point a person
could hold it in their head — basic identities sitting next to Hyman filters and Hermite
evaluators. It's now three files, split by **how far the math is from something you could do with
a compass and straightedge**, not by what it operates on — all three take and return plain
geometric objects (`Pt`/`Circle`/`Arc`/`Rectangle`), layered so each only imports from the one
before it:

- **`simpleGeometry.ts`** — basic identities and single closed-form formulas: distance, point on
  circle, line/circle intersection, clamping, angle normalization, offsetting and mirroring. No
  case-splitting, no iteration. Imports nothing from the other two math files.
- **`draftMath.ts`** — solvers with real casework that are still classic drafting constructions:
  circle tangent to a line and a circle, joining/inscribed circle families, fillets, arc-fit-from-
  constraint (`fitTangentArc`, `fitArcThroughPoints`, `fitArcFromEndsAndCenter`), the G1 arc-chain
  functions, biarc joining. Imports from `simpleGeometry`.
- **`vibeMath.ts`** — math that goes past what a compass and straightedge can do: the polyline
  spatial index (`PolylineIndex` and friends, for dense batch nearest-point queries), the two
  harmonic-fit closed-form inverses of the G1 chain functions, and the curve/spline machinery
  (catenary solving, monotone/natural/C2 splines, the Hyman filter). Imports from both
  `simpleGeometry` and `draftMath`.
- **`svgPathMath.ts`** — building, combining and boolean-diffing SVG path *strings*. Sections:
  Path helpers, Path combinations, Arch curve path builders, Arch curve evaluators. Wraps
  `polygon-clipping` and `svg-path-properties`. Imports from all three of the above.

If a function takes points and returns points, it belongs in one of the first three files, sorted
by how far it is from hand-drafting. If it takes or returns a `d` string, it's `svgPathMath`.
Nothing upstream of `svgPathMath` should import it back.

Within each file, functions are grouped by the type they're about (points, then circles, then
lines, then arcs) and roughly ordered by increasing complexity within each group — a family that
already reads as a unit (the G1 arc-chain functions, the biarc solve) stays together rather than
being resorted to fit that rule exactly.

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
| `workingStorage.ts` | The one seam to per-tab browser storage for in-progress work. See root CLAUDE.md. |

## When adding here

The pull is to write a helper that quietly assumes a violin — a magic proportion, a bout name, a
default sized for a 355mm body. If a function needs that, it belongs in the model's `*-calcs.ts`
instead. The test is whether the name and signature would still make sense to someone drafting a
guitar.

Watch for the reverse too: generic math that has accreted as a private method on a component
belongs here. `normalizeDegrees` and `clamp` arrived that way.

Tests live beside their subject (`draftMath.spec.ts`, `svgPathMath.*.spec.ts`) and run under
vitest via `ng test`.
