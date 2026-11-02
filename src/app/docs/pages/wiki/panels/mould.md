---
id: mould
title: Mould
kind: panel
panel: mould
status: unreviewed
image: wiki/mould.svg
---
This panel draws the inside mould the ribs are bent around. Its outline is the rib line from the first panels, with pockets cut for the six blocks. 

## Blocks
Blocks are positioned around the corners and at the top and lower bout. All blocks have custom height and width values, while the corner blocks may be padded along the X or Y directions. 

## Clamp Box
The clamp box offers flat edges for you to clamp your blocks too, as well as a parallel surface which wraps around the mould. If you would prefer to cut your own clamping system, you can toggle this off. 

## CNC
If the mould will be cut on a CNC, enter the diameter of the bit you intend to use. A bit cannot cut a sharp inside corner, so CremonaCad adds relief at the block pockets so the blocks seat properly. Leave it at 0 if cutting by hand. 

## Fields
Only the sizes of the blocks are set here. Where they sit follows from the outline: the neck and end blocks stand on the centerline against the ends of the outline, and the corner blocks are hung off their corner tips.

**Neck Block**

| Field | Description |
|---|---|
| Height | The block's size along the body. |
| Width | The block's size across the body. |

**Upper Corner Blocks**

| Field | Description |
|---|---|
| Height | The block's size along the body. |
| Width | The block's size across the body. |
| Pad X | How far the block's outer corner stands past the corner tip, across the body. |
| Pad Y | How far the block's outer corner stands past the corner tip, toward the waist. |

**Lower Corner Blocks**

| Field | Description |
|---|---|
| Height | The block's size along the body. |
| Width | The block's size across the body. |
| Pad X | How far the block's outer corner stands past the corner tip, across the body. |
| Pad Y | How far the block's outer corner stands past the corner tip, toward the waist. |

**End Block**

| Field | Description |
|---|---|
| Height | The block's size along the body. |
| Width | The block's size across the body. |
| Bit Diameter | The diameter of the router bit that will cut the mould. Adds relief to the block pockets, since a bit cannot cut a sharp inside corner. Set to 0 if cutting by hand. |
| Clamp Box | Adds the windows a clamp reaches through to hold each block in place. |
