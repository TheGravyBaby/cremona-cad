---
id: long-arching
title: Long arching
kind: panel
panel: longArching
status: unreviewed
image: wiki/long-arching.svg
caption: The long arch, in side profile.
---
This panel allows you to define the side profile of the instrument by setting the rib heights and the long arching for both the top and back plates. 

## Rib Tapers
Cremonose violins featured a slight taper. Once the back was fastened to the ribs, the top edge would be planed down at a slight angle such that the top was thinner than the bottom. In this model, the back will always be square to the rib line, while the top angles slightly.

## Long Arch Curves
There are an enormous number of theories regarding how Cremonese arching was done, and like most historical topics there doesn't appear to be a consensus nor any primary sources on the process. What we are left with are the instruments themselves, which feature a variety of curves, many of which are distorted over time. Given this situation, CremonaCad gives the user two options for drawing the long arch. 

### Catenary Curves
These are natural curves that form when dangling a chain or rope between two points, and they approximate the long arch curve on many existing instruments. Because the curve is so easy to formulate, it very well could have been a shop practice in 17th century Cremonese making. Further, Catenaries offer interesting mechanical properties, loads on the top of the arch can be completely converted into compression rather than bending the plate.

### Splines
Natural splines can be obtained by bending wood through a series of control points, and the technique was certainly known and available to makers in rennaisance Italy. Was this the technique used by the Cremonese masters? Who is to say... Historical correctness aside, splines offer a way to track well against almost any kind of arching. 

### Fluting Channel
The fluting channel travels along the entire outer edge of the plate, the long arch must intercept the height you have given it while also smoothly joining the fluting channel. CremonaCad does this by iteratively running through possible solutions until it finds one, or if none, the arching will take off from the inner fluting edge. 

## Fields

| Field | Description |
|---|---|
| Upper Rib Height | TODO |
| Lower Rib Height | TODO |
| Plate Thickness | TODO |

| Curve type (Catenary, Spline) | TODO |
| Arch Height | TODO |

| Spline point position | TODO |
| Spline point height | TODO |
| Spline point Mirror | TODO |
| Peak | TODO |

## What it feeds

