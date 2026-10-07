# Changelog

## v0.9.0 — TODO

TODO: the neck, volute, scroll and scroll widths panels, the string setup, and the five neck and scroll sheets.

- **One palette for the drawing** — the colours on canvas come from five inks and a tone per part rather than a hand-picked hex each, so a part another panel owns draws in plain grey and the day canvas gets the same ramps in a legible band. Some colours have shifted slightly.

## v0.8.8.0 — Sep 14, 2026

New panels for designing f-holes.

- **F-Hole Placement** panel allows for the sizing and placement of the eyes and stem.
- **F-Hole Contours** panel allows for the shaping of f-hole curves through familiar arc geometry.
- **High Quality Templates** have been added from the Library of Congress collections.
- **Automatic Image Cycling** per panel, so you can display relevant images on the panel you need it on. See the image setting menu.
- **UI improvements** Many small updates to the UI to improve the experience, particularly in light mode.

## v0.8.3.4 — Aug 20, 2026

Added more comprehensive arc tools, improvements made to the text tool, ctrl/cmd + arrow keys now moves objects by a small degree.

- **Two more arc tools** — set both ends first, then either a point the arc passes through or its center. The four three-point arc tools renamed and re-drawn for the order you click them in.
- **Text on the drawing, not the screen** — labels take a size in millimetres and an angle, double-click to edit in place, and line breaks are editable in the settings bar.
- **Fine nudge** — Ctrl(⌘)+Arrow moves a selection 0.1mm, beside the existing 1mm and 10mm steps.

## v0.8.3.3 — Aug 18, 2026

Room to draw on a small screen.

- **Both bars fold away** — layers and reference images moved to the bar under the canvas.
- **Offset measurements** — the Distance tool can park its line and number off to one side.

## v0.8.3.2 — Aug 5, 2026

Control improvements.

- **Viol-neck geometry fixes** — proper joins for the neck now carry through to purfling.
- **Smarter number fields** — fields step by a size-aware amount, with Shift/Ctrl(⌘)+Arrow for bigger or finer nudges, and panel undo/redo is more reliable.
- **Undo Redo** - unified the undo / redo logic and added buttons, should work much better now.

## v0.8.3.1 — Aug 4, 2026

Files and view controls.

- **Your work survives closing the tab** — and the design name now lives in the toolbar, where the New button offers a blank instrument or any template.
- **Day/night moved** — it now sits with zoom and axis at the bottom of the canvas.

## v0.8.3 — Aug 2, 2026

Drawing toolbox.

- **A drawing toolbox** — now draw directly onto the canvas with lines, arcs, circles, boxes, points and text. Keep your work sorted on named layers.
- **Snapping** — everything you draw can snap to existing paths, centers and edges of the recipe underneath, so your sketch lines up with the instrument rather than near it.
- **Reference images have moved** — images are now objects on the canvas instead of a panel setting. Several can sit side by side, each named.
- **Asymmetric arching** — splines can now be drawn asymetrically, and can be used for both the long and cross arching.
- **Cross Arcing Stations** - to support more complex curvature along the plate surfaces, different cross arches can be set at different heights along the panel. A smooth surface will be generated between the different stations.
- **Clearer view controls** — the module and view toggles are proper buttons now, and easier to read at a glance.

## v0.8.1 — Jul 24, 2026

Fluting channel refinements.

- **Deeper ends** — the fluting channel now keeps its depth into the top and bottom of the plate, shaped by the long arch instead of fading to flat.

## v0.8.0 — Jul 22, 2026

Long and cross arching.

- **Long & cross arching** — plates finally have real shape. Model the top and back with catenary or spline profiles lengthwise, and cycloid cross-sections that flow naturally into the fluting channel.
- **3D surface preview** — spin your plate around and actually see your arching, as a wireframe or a contour map.
- **Arching Templates** — once your arching is defined, export templates for the long and cross arches.
- **STL export** — top and back plate arching can be exported as a 3D STL model for cutting via CNC.
- **Multiple reference images** — keep your plan, long arch, and cross arch references all open at once, each in its own tab.
- **Snappier everywhere** — a large number of performance improvements across the breadth of calculations and rendering.

## v0.7.2.1 — Jun 24, 2026

Purfling and fluting.

- Improved fluting rendering performance.
- Made corner curve controls more clear.
- Template updates.

## v0.7.2 — Jun 22, 2026

Purfling and fluting.

- Added purfling channel to the design workflow — set offset and depth relative to the plate edge.
- Added fluting to the design workflow — defines the flat platform between the purfling and the arching.
- Updated templates for purflign and fluting support.

## v0.7.1 — Jun 16, 2026

Post release refinement.

- PDFs now render against standard ISO paper formats.
- Refactored violneck system for more accurate and flexible arc relations.
- Updated Mittenwald bass and Magini Delmas templates for the new system.
- Many small UI improvements to aid in visibility.
- Significant internal refactors around saving, loading, and template selection.

## v0.7.0 — May 18, 2026

Initial public release. Thanks for checking it out!
