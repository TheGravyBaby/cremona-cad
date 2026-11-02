---
id: base
title: Base Measurements
kind: panel
panel: base
---
The base measurements panel allows you to set the primary bounds for your instrument, and provides fields for basic file properties. The panel renders two rectangles to represent the bounding areas.

## Inner Versus Outer
It is important to understand the violin making process for real instruments, as this is what guides CremonaCad. A maker always starts with a mould, which the ribs are bent around. Traditionally, the maker will trace the outline of the ribs onto the top and back, with a small offset which will become the overhang. The overhang and rib width are defined on this panel, creating an inner and an outer bounding box. The first few panels will draw arcs within the inner bounding box, so as to form the boundaries of the mould.

## Reference Images
This panel is a sensible place to upload and scale a reference image, as the outer bounding box gives you the instrument's height and width to scale against. See [[images]].

## Fields
**File Properties**

| Field | Description |
|---|---|
| Name | The name of the design, used as the file name when saving and exporting. |
| Description | Free notes about the design. |
| Source | Where the design came from, such as the instrument it was traced from or the image's origin. |

**Primary Dimensions**

| Field | Description |
|---|---|
| Height | The outer height of the instrument. |
| Width | The total width of the instrument, almost always the width of the lower bout. |
| Overhang | The amount the top and back plate project over the ribs. |
| Ribs | The thickness of the ribs. |
| Inset | Read-only. Overhang plus rib thickness: the distance from the outer edge in to the mould line that the first panels draw. |
