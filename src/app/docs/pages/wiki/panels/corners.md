---
id: corners
title: Corners
kind: panel
panel: corners
image: wiki/corners.svg
---
This panel defines the positions of the corners as well as the arcs that join them to the upper and lower bouts.

The corner position is set using an XY point. This represents the "inner" corner of the rib line. When tracing an instrument, this means it will be inside the plate rather than on its edge. Two arcs are then drawn to shape the corner and the bout. 

## Compounding
Simple instruments may feature a single arc for the corner, and this can look quite good. But many Cremonese makers used more complicated compounding arcs to draw their corners. Usually the arc sizes would get progressively smaller as they reached the corner point. The small arcs at the very end flare more and create a dramatic corner. 

### Straight Sections
Some Cremonese instruments feature a straight section which joins the corner arcs to the bout arcs. This greatly simplified construction of the system during the days of hand making, as a corner circle and bout circle could be drawn, and then a tangent line could be found which smoothly joined them. 

To simulate this, simply compound the corner, and set the primary arc radii to a very large value, which approximates a straight line. 

## Viol Corners
Many viols and double basses do not feature small arcs which flare out their corners. Rather, they simply smoothly join the bout to a corner point using a single arc. You may toggle this simple geometry on and off.

## Fields
**Upper Bout**

| Field | Description |
|---|---|
| U2 Join Radius | The arc that leaves the upper bout and turns in toward the corner. |

**Upper Corner**

| Field | Description |
|---|---|
| X, Y | The position of the upper corner tip on the rib line. Arrow keys move it from either box. |
| Default | Puts the corner back on its guide circle, a good starting point if the values get out of bounds. |
| U3 Corner Radius | The arc that runs from U2 into the corner tip. |
| Compound | Splits U3 into two arcs for a more pronounced corner. |
| U31 Radius | The second, smaller arc of a compound corner, which finishes at the tip. |
| U31 Sweep | How far U31 turns, in degrees, from where it takes over to the tip. |
| Use Viol Corner | Draws a single arc from the bout straight to the corner tip, replacing U2 and U3. |

**Lower Corner**

| Field | Description |
|---|---|
| X, Y | The position of the lower corner tip on the rib line. |
| Default | Puts the corner back on its guide circle. |
| L3 Corner Radius | The arc that runs from L2 into the corner tip. |
| Compound | Splits L3 into two arcs. |
| L31 Radius | The second, smaller arc of a compound corner, which finishes at the tip. |
| L31 Sweep | How far L31 turns, in degrees, from where it takes over to the tip. |
| Use Viol Corner | Draws a single arc from the bout straight to the corner tip, replacing L2 and L3. |

**Lower Bout**

| Field | Description |
|---|---|
| L2 Join Radius | The arc that leaves the lower bout and turns in toward the corner. |
