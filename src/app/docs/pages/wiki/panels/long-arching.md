---
id: long-arching
title: Long arching
kind: panel
panel: longArching

image: wiki/long-arching.svg
caption: The long arch, in side profile.
---
This panel allows you to define the side profile of the instrument by setting the rib heights and the long arching for both the top and back plates. 

## Rib Tapers
Cremonese violins featured a slight taper. Once the back was fastened to the ribs, the upper edge would be planed down at a slight angle such that the upper rib area was thinner than the lower. In this model, the back will always be square to the rib line, while the top angles slightly.

## Long Arch Curves
There are an enormous number of theories regarding how Cremonese arching was done, and like most historical topics there doesn't appear to be a consensus nor any primary sources on the process. What we are left with are the instruments themselves, which feature a variety of curves, many of which are distorted over time. Given this situation, CremonaCad gives the user two options for drawing the long arch. 

### Catenary Curves
These are natural curves that form when dangling a chain or rope between two points, and they approximate the long arch curve on many existing instruments. Because the curve is so easy to formulate, it very well could have been a shop practice in 17th century Cremonese making. Further, catenaries offer interesting mechanical properties: loads on the top of the arch can be completely converted into compression rather than bending the plate.

### Splines
Natural splines can be obtained by bending wood through a series of control points, and the technique was certainly known and available to makers in Renaissance Italy. Was this the technique used by the Cremonese masters? Who is to say. Historical correctness aside, splines track well against almost any kind of arching. You may add and remove spline points, set their height as well as their position along the body measured as a percent. 

### Fluting Channel
The fluting channel travels along the entire outer edge of the plate, and the long arch must intercept the height you have given it while also smoothly joining the fluting channel. CremonaCad solves this by iteratively running through possible solutions until a takeoff point is found. If none exists, the arching will take off from the inner fluting edge. 

## Fields
**Rib Heights**

| Field | Description |
|---|---|
| Upper Rib | The rib height at the upper block, square to the rib edge. |
| Lower Rib | The rib height at the lower bout. Equal values give an untapered rib. |

**Top Plate** and **Back Plate**

| Field | Description |
|---|---|
| Thickness | The plate's thickness at its outer edge. |
| Catenary, Spline | Which curve draws the long arch. |
| Arch Height | The height of the arch above the plate's edge at the peak. |
| Position | For a spline point: where it sits along the body, as a percent of the length from the lower end. |
| Height | For a spline point: how high it sits above the plate's edge, in mm. |
| Mirror | Repeats the point at the same distance from the other end of the body. |
| Peak | The spline's highest point: its position along the body and the arch height. Drag the rows to reorder them, or use Sort by Position. |
