---
id: bouts
title: Main bouts
kind: panel
panel: mainBouts
aliases: [upper bout, lower bout]
image: wiki/bout-widths.svg
caption: The three widths, each measured outside the ribs.
---
This panel defines the size and profile of the upper and lower bouts. The bouts are made up of a very simple system where a large central arc intersects either the upper and lower edge of the bounding box you made on the previous panel. 

A secondary smaller arc is drawn to smoothly intersect right and leftmost edges of the bounding box, as well as the initial large circle. These smaller circles can be called Vesecai, a coin termed by David Beard. 

## Viol Neck
The viol family of instruments often do not have a top section defined by a single arc segment. Rather, the upper bout gradually curves vertically until it is cut off at the neck line. This geometry has been widely adapted by double basses, perhaps because it offers more room for a solid upper block. CremonaCad allows for you to toggle this kind of upper bout on and off. 

When using the viol neck geometry, the upper large arc U0 is split on either side, and another arc V0 is smoothly joined to it. V0 turns in the opposite direction of U0. 

Some viols and basses feature a long straight section before the bout curves upwards. To simulate this, set U0 to a very high value, as a large radius approximates to a straight line in this system. 

## Fields

| Field | Description |
|---|---|
| Upper Width | The outer width of the upper bout, often published online. |
| U0 | The large central circle of the upper bout. |
| U1 | The upper vesecai, one on either side of the instrument. |

| Lower Width | The outer width of the lower bout, often published online. |
| L0 | The large central circle of the lower bout. |
| L1 | The lower vesecai, one on either side of the instrument. |

| V0 | The primary arc for the viol neck, sweeping in the opposite direction as U0, which will now be drawn on either side of the instrument. |
| Join Turn | The end anlge for U0 when the viol neck is used.  |
| V0 Sweep | - |
| Width | The distance between the end segments of V0, the width of the neck. |
| Join Radius | Necks feature varying degrees of rounding at their top, use this to set the rounding to your liking. |
