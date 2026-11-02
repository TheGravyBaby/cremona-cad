---
id: pegbox
title: Pegbox
kind: panel
panel: pegbox

image: wiki/scroll.svg
---
This panel allows you to design the full side profile of the scroll pegbox system. The system here is fairly straightforward: more smooth intersections between arcs and lines. One minor complexity comes from the duck tail.

### The Duck Tail
The duck tail is a semicircular area where the neck transitions to the scroll. On many late 17th and early 18th century violins, the tip of the duck tail is flush with the nut. On cellos and large instruments, it is common for the duck tail to "hang" below the nut. On these large instruments, it is also common for the nape to "point" down, a feature you can adjust with the nape angle parameter. 

## Fields
**Back**

| Field | Description |
|---|---|
| Straight | The length of the straight run down the back of the pegbox, after S2. |
| S3 R | The arc that turns the back in toward the neck at the bottom of that straight. |
| Hang | How far the duck tail drops below the lower edge of the nut. S3's end is solved from it. |
| Nape R | The arc that joins the duck tail to the neck's back. |
| Nape Angle | The angle of the line from the duck tail to the nape, in degrees off square, rising toward the neck's back. |

**Front**

| Field | Description |
|---|---|
| Flat | The length of the flat that runs up from the nut before the front begins to curve. |
| F0 R | The arc that turns the front of the pegbox up from the flat. |
| Sweep | How far F0 turns, in degrees. |
| Straight | The straight run up the front of the pegbox after F0. |
| F1 R | The arc that curves the front back until it meets the spiral. |

**Neck**

| Field | Description |
|---|---|
| Thickness | The thickness of the neck at the nut, the same value as on the neck panel. |
| Nut Height | How far the nut stands proud of the neck's front. |
