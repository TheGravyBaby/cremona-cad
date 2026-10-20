---
id: tools
title: Tools
kind: overview
aliases: [toolbox, palette, drafting tools]
---
On the left side of the application there are a variety of tools you can use to assist you in drafting. These tools are split into two groups: draw and modify. Draw tools place objects onto the canvas while modify tools allow you to take operations against selected objects. 

Most of the objects drawn with tools have some configurable settings, which are displayed on the bottom bar of the canvas. Common settings include color, stroke width, stroke style, distance, and XY position. You can edit these settings before an object is placed, or after you select it. 

The draw tools identify and snap to edges of existing geometry. When snapped to an object, the application determines the objects type, which can unlock additional settings. 


## Lines — L

|---|---|---|
| Line | L | This draws a simple line between two points. Hold SHIFT to snap the angle. Hold CTRL to draw tangent to a snapped object. You can edit the distance of a line on selection, or type a distance in and hit enter at draw time.|
| Polyline | L×2 | Connects multiple lines together. |
| Tangent Line | L×3 | Select a path and pick a point, a tangent line will be drawn between them. |
| Perpendicular Line | L×4 | Select a path and pick a point, a perpendicular line will be drawn between them. |
| Draw | B | A free draw tool.  |

## Measure & Divide — D, S, K

|---|---|---|
| Distance | D | Operates similar to the line tool. Displays the distance between two XY points. You can offset the display above or below the line.  |
| Section | S | The section tool displays a rectangle that is split into parts. The parts can be set by simple fractions, or a comma seperated list of numbers. The list will split the tool into parts equal to the relative weight of its sections. For example, a list of "1,2,1" slits the distance into 3 parts with weights of "-/--/-".
| Ticks | K | Functions similar to the section tool but uses small ticks.  |
| Angle | D×2 | A simple protractor tool, displays an angle in degrees. |
| Curve Length | D×3 | Displays the distance traveled along a curved path. |
| Curve Ticks | K×2 | Works similar to the ticks tool, but works along a curved path. |

## Arcs — A

|---|---|---|
| Center First | A | First select the center point for a circle, then two points along its radius which define the arc span. Hold SHIFT to select the longer span between two points. You may display dashed lines the the center by selecting the compass option. |
| Center Second | A×2 | Here the first click defines the starting point of the arc, the second click defines the arc center, and the third click defines the end of the arc segment. |
| Center Last | A×3 | Here the first two clicks define points along the arc path, while the third clickdefines the center. |
| Three Point | A×4 | Here you never define the center, your three clicks define points along the arc path. |
| Tangent Arc | A×5 | This tool will draw an arc that is always tangent to the path of a snapped shape. |
| Chained Arc | A×6 | This tools allows you to draw multiple arcs that are smoothly joined. Hold SHIFT to chnage the sweep direction of the arc being drawn at the tangent point. |
| Join Arc | A×7 | This one is cool. Use this tool to draw a smooth biarc join between two selected paths. There are often multiple solutions, some of which can look fairly odd. Hit SHIFT to cylce through the solutions, there is usually a pretty one in there. |

## Circle & Polygons — C

|---|---|---|
| Circle | C | Select a center, then a radius, then a circle is drawn. |
| Triangle | C×2 | Same as the circle tool except we draw an equalateral triangle. You may hold SHIFT to snap the radius to a standard angle.|
| Square | C×3 | - |
| Pentagon | C×4 | - |
| Hexagon | C×5 | - |
| Octagon | C×6 | - |

## Boxed Shapes — R

|---|---|---|
| Rectangle | R | Draws a rectanglw between two points. Holding SHIFT will draw a square.|
| Right Triangle | R×2 | Draws a right triangle between two points. |

## Mathematical Curves — H

|---|---|---|
| Batten | H | Batten draws a spline curve that intersects a series of points you place on the canvas. Hit enter when you are done. Double clicking along a batten will add a control point. Holding CTRL and double clicking an existing control point. |
| Catenary | H×2 | A catenary is the natural curve a rope takes when suspended between two points. Pick two points and then select a third for the depth of the curve. You may edit the depth of a selected curve in its settings bar.  |
| Cycloid | H×3 | A cycloid is a curve drawn by tracking a point within a circle as it rotates along a plane. Pick two points and then select a third for the depth of the curve. Cycloid factor indicates how far along the radius the draw point is selected. Percentage will scale a "window" of the cycloid to the given distance. |

## Marks

| Tool | Key | What it does |
|---|---|---|
| Text | T | Select a point and then begin typing to add text. Press ENTER to confirm. If you select existing text, you may press enter to begin editing it. SHIFT+ENTER will create a new line. |
| Point | P | Draws a small crosshair at a given point.  |
| Eraser | E | Click and hold and then drag over objects to erase them.  |

## Modify

|---|---|---|
| Group | - | You can group and ungroup multiple selected objects. You can also do this by right clicking a selection or using CTRL+G. Grouped objects are treated as single objects for the various modify tools. |
| Move | — | Select an object, then pick a point. Travel to a new point and the object will be translated the difference between those two points. |
| Offset | O | Offsets an object by some quantitiy. Not all objects or paths can be offset. Type in a metric value and hit enter to offset to that exact amount. |
| Fillet | — | Draws an arc fillet between two lines. You can edit the radius of the fillet on the bottom bar when the tool is selected. Once a fillet is made, the two lines are altered. |
| Scale | — | Select an object or a group and then twp points to scale them. The object always retains its aspect ratio. |
| Rotate | — | Select an object or group and then two points to rotate it. There are two rotate tools for fast clockwise and counterclockwise rotation about an objects geometric center. |
| Mirror Line | — | Various mirror tools flip a selection about its own axis, about the canvas, or about a mirror line. |  
| Alignment | - | When selecting multiple objects, the alignment tools offer various ways to align and space them. Groups are treated as single objects for the purposes of alignment.  |
