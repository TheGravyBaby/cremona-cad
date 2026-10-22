---
id: tools
title: Tools
kind: overview
image: wiki/tools.svg
caption: Draw and Modify 
aliases: [toolbox, palette, drafting tools]
---
On the left side of the application there are a variety of tools you can use to assist you in drafting. These tools are split into two groups: draw and modify.

Draw tools place objects onto the canvas while modify tools allow you to take operations against selected objects. 

Most of the objects drawn with tools have some configurable settings, which are displayed on the bottom bar of the canvas. Common settings include color, stroke width, stroke style, distance, and XY position. You can edit these settings before an object is placed, or after you select it. 

The draw tools identify and snap to edges of existing geometry. When snapped to an object, the application determines the object's type, which can unlock additional settings. 


## Lines — L

|---|---|
| :line: Line | This draws a simple line between two points. Hold *Shift* to snap the angle. Hold *Ctrl* to draw tangent to a snapped object. You can edit the distance of a line on selection, or type a distance in and hit *Enter* at draw time.|
| :polyline: Polyline | Connects multiple lines together. |
| :line-tangent: Tangent Line | Select a path and pick a point; a tangent line will be drawn between them. |
| :line-perpendicular: Perpendicular Line | Select a path and pick a point; a perpendicular line will be drawn between them. |
| :freehand: Draw | A free draw tool.  |

## Measure & Divide — D, S, K

|---|---|
| :dimension: Distance | Operates similarly to the line tool. Displays the distance between two XY points. You can offset the display above or below the line.  |
| :section: Section | The section tool displays a rectangle that is split into parts. The parts can be set by simple fractions, or a comma-separated list of numbers. The list will split the tool into parts equal to the relative weight of its sections. For example, a list of "1,2,1" splits the distance into 3 parts with weights of "-/--/-". |
| :ticks: Ticks | Functions similarly to the section tool but uses small ticks.  |
| :angle: Angle | A simple protractor tool, displays an angle in degrees. |
| :curve-length: Curve Length | Displays the distance traveled along a curved path. |
| :curve-ticks: Curve Ticks | Works similarly to the ticks tool, but works along a curved path. |

## Arcs — A

|---|---|
| :arc: Center First | First select the center point for a circle, then two points along its radius which define the arc span. Hold *Shift* to select the longer span between two points. You may display dashed lines to the center by selecting the compass option. |
| :arc-start: Center Second | Here the first click defines the starting point of the arc, the second click defines the arc center, and the third click defines the end of the arc segment. |
| :arc-ends-center: Center Last | Here the first two clicks define points along the arc path, while the third click defines the center. |
| :arc-through: Three Point | Here you never define the center; your three clicks define points along the arc path. |
| :arc-tangent: Tangent Arc | This tool will draw an arc that is always tangent to the path of a snapped shape. |
| :arc-chain: Chained Arc | This tool allows you to draw multiple arcs that are smoothly joined. Hold *Shift* to change the sweep direction of the arc being drawn at the tangent point. |
| :join-arc: Join Arc | This one is cool. Use this tool to draw a smooth biarc join between two selected paths. There are often multiple solutions, some of which can look fairly odd. Hit *Shift* to cycle through the solutions; there is usually a pretty one in there. |

## Circle & Polygons — C

|---|---|
| :circle: Circle | Select a center, then a radius, then a circle is drawn. |
| :polygon-3: Triangle | Same as the circle tool except we draw an equilateral triangle. You may hold *Shift* to snap the radius to a standard angle.|
| :polygon-4: Square | - |
| :polygon-5: Pentagon | - |
| :polygon-6: Hexagon | - |
| :polygon-8: Octagon | - |

## Boxed Shapes — R

|---|---|
| :rect: Rectangle | Draws a rectangle between two points. Holding *Shift* will draw a square.|
| :right-triangle: Right Triangle | Draws a right triangle between two points. |

## Mathematical Curves — H

|---|---|
| :batten: Batten | Batten draws a spline curve that intersects a series of points you place on the canvas. Hit *Enter* when you are done. *Double-clicking* along a batten will add a control point. Holding *Ctrl* and *double-clicking* an existing control point will remove it. |
| :catenary: Catenary | A catenary is the natural curve a rope takes when suspended between two points. Pick two points and then select a third for the depth of the curve. You may edit the depth of a selected curve in its settings bar.  |
| :cycloid: Cycloid | A cycloid is a curve drawn by tracking a point within a circle as it rotates along a plane. Pick two points and then select a third for the depth of the curve. Cycloid factor indicates how far along the radius the draw point is selected. Percentage will scale a "window" of the cycloid to the given distance. |

## Marks

|---|---|
| :text: Text | Select a point and then begin typing to add text. Press *Enter* to confirm. If you select existing text, you may press *Enter* to begin editing it. *Shift+Enter* will create a new line. |
| :point: Point | Draws a small crosshair at a given point.  |
| :eraser: Eraser | *Click and hold* and then *drag* over objects to erase them.  |

## Modify

|---|---|
| :group: Group | You can group and ungroup multiple selected objects. You can also do this by *right-clicking* a selection or using *Ctrl+G*. Grouped objects are treated as single objects for the various modify tools. |
| :move: Move | Select an object, then pick a point. Travel to a new point and the object will be translated by the difference between those two points. |
| :offset: Offset | Offsets an object by some quantity. Not all objects or paths can be offset. Type in a metric value and hit *Enter* to offset to that exact amount. |
| :fillet: Fillet | Draws an arc fillet between two lines. You can edit the radius of the fillet on the bottom bar when the tool is selected. Once a fillet is made, the two lines are altered. |
| :scale: Scale | Select an object or a group and then two points to scale them. The object always retains its aspect ratio. |
| :rotate: Rotate | Select an object or group and then two points to rotate it. There are two rotate tools for fast clockwise and counterclockwise rotation about an object's geometric center. |
| :flip-h: Mirror | Various mirror tools flip a selection about its own axis, about the canvas, or about a mirror line. |
| :align-left: Alignment | When selecting multiple objects, the alignment tools offer various ways to align and space them. Groups are treated as single objects for the purposes of alignment.  |
