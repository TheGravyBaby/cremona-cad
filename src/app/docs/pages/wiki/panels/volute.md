---
id: volute
title: Volute
kind: panel
panel: volute
status: unreviewed
image: wiki/volute.svg
---
This panel allows you to define the volute (spiral) which gives the scroll its signature shape. There are architectural techniques for drawing spirals using arc segments which date back thousands of years. Along with a custom four-point arc system, CremonaCad pays homage to many of these historical techniques, many of which would have been available and known to Cremonese makers in the 17th century. 

All spirals have a center, or eye, from which the spiral grows. In most historical systems, the size of the eye dictates how the spiral grows. All volutes begin at 0 degrees along the eye, and rotate two full turns before joining the other arcs of the scroll system. 

The Maggini fans among you will surely be disappointed that CremonaCad does not support three-turn arcs, and frankly, you are right. Perhaps this will be a feature to add later.

### Fit to Neck
In most instruments, the second turn of the volute is flush with the fingerboard, though this is not always the case. You may use this toggle to ensure that the position of the eye is always such that your spiral hits this edge. 

## Reference Image Notes
Most reference images of scrolls do not come with a reliable way of scaling them. This is mostly fine, as scrolls are really just vibes, man. So long as the scroll is of sufficient size to house the pegs, have fun. You are the Dave Grohl of your violin scroll. The templates in CremonaCad scale these images based on known values, and provide a good reference point for scroll sizes. 


## Fields
The scroll is drawn in its own side view, with the nut at the origin on the neck's front. Positive Y runs up the neck and negative X toward the back.

**Volute**

| Field | Description |
|---|---|
| Style | Which construction draws the spiral: Four Point, Archimedean, Serlio, Salviati, Goldmann or Kelly. |
| Radius | The radius of the eye. |
| X, Y | The position of the eye's center from the nut. X is read-only while Fit to Neck is on. |
| Pitch | Archimedean only. How much the spiral grows per turn. |
| Seed | Kelly only. The length of the seed the construction grows from. |
| Fit to Neck | Solves the eye's X so the spiral's front lands flush with the neck's front. |
| R | Four Point only. The radius of each quarter turn, in order from the eye outward. |

**Crown**

| Field | Description |
|---|---|
| S0 R, S1 R, S2 R | The arcs that run on from the spiral over the back of the head, each tangent to the last. |
| Sweep | How far each of those arcs turns, in degrees. |
| Height, Width, H to W | Read-only. The overall size of the scroll and its proportion. |

## What it feeds
