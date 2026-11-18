---
id: bouts
title: Main bouts
kind: panel
panel: mainBouts
aliases: [upper bout, lower bout]
image: wiki/bout-widths.svg
---
This panel defines the size and profile of the upper and lower bouts. The bouts are made up of a very simple system where a large central arc intersects either the upper or the lower edge of the bounding box you made on the previous panel. 

A secondary smaller arc is drawn to smoothly intersect the right- and leftmost edges of the bounding box, as well as the initial large circle. These smaller circles can be called vesica, a term coined by David Beard. 

A third arc leaves the vesica and carries the bout inward. 


## Viol Neck
The viol family of instruments often does not have a top section defined by a single arc segment. Rather, the upper bout gradually curves vertically until it is cut off at the neck line. This geometry has been widely adopted by double basses, perhaps because it offers more room for a solid upper block. CremonaCad allows for you to toggle this kind of upper bout on and off. 

When using the viol neck geometry, the upper large arc U0 is split on either side, and another arc V0 is smoothly joined to it. V0 turns in the opposite direction of U0. 

Some viols and basses feature a long straight section before the bout curves upwards. To simulate this, set U0 to a very high value, as a large radius approximates a straight line in this system. 

## Fields
**Upper Bout**

| Field | Description |
|---|---|
| Total Width | The outer width of the upper bout, often published online. |
| U0 Join Radius | The large central arc of the upper bout. |
| U1 Vesica Radius | The small arc that joins U0 to the side of the bounding box, one on either side of the instrument. |
| U2 Join Radius | The arc that leaves the upper bout and turns in toward the corner. |

**Lower Bout**

| Field | Description |
|---|---|
| Total Width | The outer width of the lower bout, often published online. This is the same number as the width on the base measurements panel. |
| L0 Join Radius | The large central arc of the lower bout. |
| L1 Vesica Radius | The small arc that joins L0 to the side of the bounding box, one on either side of the instrument. |
| L2 Join Radius | The arc that leaves the lower bout and turns in toward the corner. |

**Viol Neck**

| Field | Description |
|---|---|
| Use Viol Neck | Replaces the single upper arc with the viol geometry below. The values are kept when toggled off. |
| V0 Radius | The primary arc for the viol neck, sweeping in the opposite direction to U0, drawn on either side of the instrument. |
| Join Turn | Defines the angle at which the viol neck begins to curve downward. |
| V0 Sweep | The degrees for V0s arc sweep.|
| Width | The distance between the end segments of V0, the width of the neck. |
| Join Radius | Necks feature varying degrees of rounding at their top. Use this to set the rounding to your liking. |
