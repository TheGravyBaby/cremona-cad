---
id: center-bout
title: Center bout
kind: panel
panel: centerBout
image: wiki/center-bout.svg
---
This panel allows you to define the center bout of the instrument, as well as the corner arcs of the center bout. The center bout is relatively simple: it is a single arc that smoothly joins to its own corner arcs. 

Once you complete the center bout section, the entire inner path of the violin becomes a closed system of arcs. 

### Fit C0 to Bouts
This button constrains the position of the center bout arc such that it smoothly joins the upper and lower bouts. This method was drawn from Kevin Kelly's four-circles violin theory. Not all instruments follow this geometry. By default, C0's X and Y position can be set freely.

### Default Corner Positions
Almost all Cremonese instruments feature a variety of corner positions. This method produces a good rule of thumb based on the research of David Beard. It is a good starting point and also helpful if you get lost and need to reset. 


## Fields
**Upper Corner**

| Field | Description |
|---|---|
| X, Y | The upper corner tip, the same point set on the corners panel. |
| Default | Puts the corner back on its guide circle. |
| C2 Corner Radius | The arc that leaves the upper corner tip on the center bout side. |
| Compound | Splits C2 into two arcs. |
| C21 Radius | The second arc of a compound corner, which finishes at the tip. |
| C21 Sweep | How far C21 turns, in degrees, from where it takes over to the tip. |

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
| X, Y | The lower corner tip, the same point set on the corners panel. |
| Default | Puts the corner back on its guide circle. |
| C1 Corner Radius | The arc that leaves the lower corner tip on the center bout side. |
| Compound | Splits C1 into two arcs. |
| C11 Radius | The second arc of a compound corner, which finishes at the tip. |
| C11 Sweep | How far C11 turns, in degrees, from where it takes over to the tip. |
