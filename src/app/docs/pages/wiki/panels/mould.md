---
id: mould
title: Mould
kind: panel
panel: mould

image: wiki/mould.svg
---
This panel draws the inside mould the ribs are bent around. Its outline is the rib line from the first panels, with pockets cut for the six blocks. 

## Blocks
Blocks are positioned around the corners and at the top and lower bout. All blocks have custom height and width values, while the corner blocks may be padded along the X or Y directions. 

## Clamp Box
The clamp box is what a clamp reaches through to hold each block in place. It comes in two patterns. **Window** cuts the mould down to a frame: flat edges to clamp your blocks to, and a parallel surface which wraps around the mould. Behind the neck and end blocks the frame bumps into its window, so the wood a clamp bears on there is as thick as the rest of the wall. **Holes** leaves the mould solid, with a round hole beside each corner block and a slot behind the neck and end blocks, each sized from its block; there is far less to cut, and the mould stays stiffer. If you would prefer to cut your own clamping system, choose **None**. 

## Alignment Holes
Two small holes on the centerline, one just behind the neck block and one just behind the end block, where they stay whichever clamp box is cut. The Inner Contour export carries the same two holes, so a template cut from it pins down over the mould with a pair of dowels. Each hole is the diameter of the bit, so a CNC plunges it without a tool change and the dowel is the bit's size.

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
| Clamp Box | The cutouts a clamp reaches through to hold each block in place: Window for a frame, Holes for a hole or slot behind each block, None for a solid mould. |
| Window Inset | How far the windows stand in from the rib line: the thickness of the frame's wall, and of the wood left behind the neck and end blocks. |
| Alignment Holes | Adds two holes the bit's diameter on the centerline, here and on the Inner Contour export, for pinning a template over the mould. |
