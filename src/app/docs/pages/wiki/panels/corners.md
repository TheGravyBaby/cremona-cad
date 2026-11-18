---
id: corners
title: Corners and center bout
kind: panel
panel: corners
aliases: [center bout, c bout]
image: wiki/corners.svg
---
This panel defines the positions of the corners, the arcs that run into them from both sides, and the center bout between them. The join arcs that carry each bout toward its corner, U2 and L2, are set on the main bouts panel; here they are given their end.

Each corner tip is one point shared by two arcs: the bout side (U3, L3) and the center bout side (C2, C1). Once this panel solves, the entire inner path of the violin is a closed system of arcs.

The corner position is set using an XY point. This represents the "inner" corner of the rib line. When tracing an instrument, this means it will be inside the plate rather than on its edge. Two arcs are then drawn to shape the corner and the bout. 

## Compounding
Simple instruments may feature a single arc for the corner, and this can look quite good. But many Cremonese makers used more complicated compounding arcs to draw their corners. Usually the arc sizes would get progressively smaller as they reached the corner point. The small arcs at the very end flare more and create a dramatic corner. 

For a compound corner, you can set the radius of both arcs and the sweep of the second.

### Straight Sections
Some Cremonese instruments feature a straight section which joins the corner arcs to the bout arcs. This greatly simplified construction of the system during the days of hand making, as a corner circle and bout circle could be drawn, and then a tangent line could be found which smoothly joined them. 

To simulate this, simply compound the corner, and set the primary arc radii to a very large value, which approximates a straight line. 

## Default Positions
![The arc used to draw the default corner position](wiki/default_corner.svg)
The Default button places the corner point using a rule of thumb from David Beard: a line is drawn at a set height on the body, and an arc as wide as the bout is swung from the opposite side to meet it. Where they cross is the corner. It is a good starting point, and a way back if the values get out of bounds.

## Viol Corners
Many viols and double basses do not feature small arcs which flare out their corners. Rather, they simply smoothly join the bout to a corner point using a single arc. You may toggle this simple geometry on and off.

## Center Bout
![The center bout](wiki/center-bout.svg)
The center bout is relatively simple: it is a single arc, C0, that smoothly joins to its own corner arcs.

### Fit C0 to Bouts
This button constrains the position of the center bout arc such that it smoothly joins the upper and lower bouts. This method was drawn from Kevin Kelly's four-circles violin theory. Not all instruments follow this geometry. By default, C0's X and Y position can be set freely.

## Fields
**Upper Corner**

| Field | Description |
|---|---|
| X, Y | The position of the upper corner tip on the rib line. Arrow keys move it from either box. |
| Default | Puts the corner back on its guide circle, a good starting point if the values get out of bounds. |
| U3 Corner Radius | The arc that runs from U2 into the corner tip. |
| Compound | Splits U3 into two arcs for a more pronounced corner. |
| U31 Radius | The second, smaller arc of a compound corner, which finishes at the tip. |
| U31 Sweep | How far U31 turns, in degrees, from where it takes over to the tip. |
| C2 Corner Radius | The arc that leaves the upper corner tip on the center bout side. |
| Compound | Splits C2 into two arcs. |
| C21 Radius | The second arc of a compound corner, which finishes at the tip. |
| C21 Sweep | How far C21 turns, in degrees, from where it takes over to the tip. |
| Use Viol Corner | Draws a single arc from the bout straight to the corner tip, replacing U2 and U3. |

**Center Bout**

| Field | Description |
|---|---|
| Total Width | The outer width at the narrowest point of the body. Like the other bout widths, this includes the ribs and overhang. |
| C0 Radius | The single arc of the center bout. |
| C0 Y | The height of C0's center. |
| Fit C0 to Bouts | Places C0 so it touches both the upper and lower join arcs. The width and Y are then read off the fit rather than typed. |

**Lower Corner**

| Field | Description |
|---|---|
| X, Y | The position of the lower corner tip on the rib line. |
| Default | Puts the corner back on its guide circle. |
| C1 Corner Radius | The arc that leaves the lower corner tip on the center bout side. |
| Compound | Splits C1 into two arcs. |
| C11 Radius | The second arc of a compound corner, which finishes at the tip. |
| C11 Sweep | How far C11 turns, in degrees, from where it takes over to the tip. |
| L3 Corner Radius | The arc that runs from L2 into the corner tip. |
| Compound | Splits L3 into two arcs. |
| L31 Radius | The second, smaller arc of a compound corner, which finishes at the tip. |
| L31 Sweep | How far L31 turns, in degrees, from where it takes over to the tip. |
| Use Viol Corner | Draws a single arc from the bout straight to the corner tip, replacing L2 and L3. |
