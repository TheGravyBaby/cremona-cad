---
id: f-hole-placement
title: F-hole placement
kind: panel
panel: fHolePlacement

image: wiki/f-hole-placement.svg
---
This panel allows you to set the placement of the f-hole eyes and the central stem. F-hole geometry can become quite complex. The community is full of theories regarding how to position the eyes relative to the body, and there seems to be no commonly agreed-upon method. 

F-holes all feature an upper and a lower eye, along with a straight stem section. CremonaCad tries to keep things flexible by setting these positions as XY coordinate values. 

## Notches
If you want your f-holes to feature notches, you may toggle this feature on. The body stop distance for the inner notch matches the Y value of your stem. The outer notch is placed using a guiding arc centered on the lower wing. To create a parametric model that could accurately represent a wide variety of notches would have involved adding more parameters to an already very dense set. Notches are traditionally cut with a knife after an f-hole has been cut, a fairly straightforward task in the violin making process. Ergo, this is a nice-to-have feature, but if you need more, feel free to program your own CAD tool.

## View Toggles
Given the number of f-hole placement theories available, this panel comes with a few view toggles which may help you place your eyes. The "Show Placement Guides" toggle shows you the distance your lower eye travels from the corner height, as well as the lower eye's distance from the rib line. The "Show Beard Guides" toggle renders guide boxes for the center 1/3, 2/9 and 1/9 of the instrument. These guide boxes align well with some instruments. 


## Fields
The treble side f-hole is the one you set. The bass side mirrors it.

**Upper Eye**

| Field | Description |
|---|---|
| Radius | The radius of the upper eye. |
| X, Y | The position of the upper eye's center. |
| Rise | How far the hole runs on past the eye toward the upper bout. |
| Eye Distance, Eye Angle | Read-only. The distance between the two eyes' centers and the angle of the line between them. |

**Stem**

| Field | Description |
|---|---|
| Width | The width of the stem, between its two parallel edges. |
| Angle | The stem's lean, in degrees past upright. Positive leans toward the upper eye. |
| X, Y | The position of the stem's center. |
| Notches | Draws the notches on the stem's edges. |
| Notch Stop | Read-only. The distance from the top edge of the plate down to the notch line. On most instruments this is where the bridge stands. |

**Lower Eye**

| Field | Description |
|---|---|
| Radius | The radius of the lower eye. |
| X, Y | The position of the lower eye's center. |
| Rise | How far the hole runs on past the eye toward the lower bout. |
