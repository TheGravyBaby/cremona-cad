---
id: f-hole-contours
title: F-hole contours
kind: panel
panel: fHoleContours

image: wiki/f-hole-contours.svg
---
This panel allows you to set the shape of the f-hole contours. Much like the body of the instrument, f-holes were classically drawn by smoothly joining compass arc sections. 

The system is similar to other arc methods in CremonaCad: define the radii of your arcs, and the application will smoothly join them such that they connect to the eyes and the stem. You can create compound arcs and adjust their sweep, much like the corner placement controls. 

Both eyes feature a "wing" section, which contains a sharp linear cut between the eye and the f-hole path. You may set the angle of the cut, the angle where it intersects the eye, as well as the angle at which the f-hole path "takes off" from the line. 

The stem exists as two parallel lines that you placed on the previous panel. Four arcs of the same radius are then made to smoothly join the upper and lower eye systems. 

## Fields
The upper and lower halves of the f-hole carry the same set of fields, U for the upper eye and L for the lower. Each half runs from the eye through a shoulder (U1), an arm (U2) and a wing (U3) before landing on the stem.

**Upper** and **Lower**

| Field | Description |
|---|---|
| U1 Radius | The shoulder: the arc that leaves the eye. |
| U1 End | The bearing, in degrees, where the shoulder ends and the arm takes over. |
| U2 Radius | The arm: the arc that carries the hole down toward the stem. |
| Compound | Splits the arm into two arcs. |
| U21 Radius | The second arc of a compound arm. |
| U2 Sweep | How far U2 turns, in degrees, before U21 takes over. |
| U3 Radius | The wing: the arc that turns out from the arm to the wing's tip. |
| Wing Angle | The angle at which the wing meets its cut, read at the tip. |
| Wing | The length of the straight cut from the eye to the wing's tip. |
| Slope | The direction the cut runs, in degrees. |
| Eye Angle | Where on the eye the cut starts, in degrees around the eye. |

**Stem**

| Field | Description |
|---|---|
| Arc Radius | One radius for the four arcs that land the upper and lower outlines on the stem's edges. |
