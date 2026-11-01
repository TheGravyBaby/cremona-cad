---
id: mould
title: Mould
kind: panel
panel: mould
status: unreviewed
image: wiki/mould.svg
---
This panel allows you to set various properties of the mould used to assemble your ribs. Set the size and positions of your blocks. 

One of the notable use cases for CremonaCad is a design tool that outputs files to be carved on CNC. If this is your use case, consider entering the size of your bit. CremonaCad will ensure that the mould has appropriate cutouts to make fabrication possible. 

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
