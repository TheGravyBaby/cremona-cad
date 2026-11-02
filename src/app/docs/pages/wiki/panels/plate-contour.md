---
id: plate-contour
title: Plate contour
kind: panel
panel: plateContour

image: wiki/outer-contour.svg
---
This panel allows you to complete the outer paths for the top and back plate as well as the purfling. In real making, the ribs are pinned to a billet of spruce or maple, and traced at an offset, with some additional offsets around the corner area. The maker then cuts the traced path by hand. 

Here, the offset was already defined on the [[base]] panel. The total sweep of the outer corner arcs is defined here by the user. A line is cut between these two arcs, and the feeling of the arc is greatly influenced by the angle of this line.

The purfling is also defined here, with a width and an offset amount from the outer edge. Even though the purfling is usually done as one of the final steps in real making, from a UI perspective this felt like the right place for it. 

The button, a semicircle which is eventually used to secure the neck, can also be defined here. 

## Fields
**Button**

| Field | Description |
|---|---|
| Width | The diameter of the button's cap. |
| Height | How far the button's tip stands beyond the end of the plate. |

**Upper Corner**

| Field | Description |
|---|---|
| Top Cutoff | How far the upper bout's corner arc runs on past the rib corner, in degrees. |
| Bottom Cutoff | How far the center bout's corner arc runs on past the rib corner, in degrees. |
| Rounding | From 0 to 1. Swaps the flat cut between the two arcs for a curve. |

**Lower Corner**

| Field | Description |
|---|---|
| Top Cutoff | How far the center bout's corner arc runs on past the rib corner, in degrees. |
| Bottom Cutoff | How far the lower bout's corner arc runs on past the rib corner, in degrees. |
| Rounding | From 0 to 1. Swaps the flat cut between the two arcs for a curve. |

**Purfling**

| Field | Description |
|---|---|
| Offset | The distance from the outer edge in to the purfling. |
| Width | The width of the purfling channel. |
