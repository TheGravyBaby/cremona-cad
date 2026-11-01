---
id: cross-arching
title: Cross arching
kind: panel
panel: crossArching
status: unreviewed
image: wiki/cross-arching.svg
caption: A cross section of the plates.
---
This panel allows you to define the cross arching on the top and back plates. Traditionally, the long arch defines the peak of the arch in the middle of the instrument. At every station, cross arches rise from the edge to meet it. Cross arches therefore are bound by the height of the long arch, and the width of the instrument at their particular "station."

## Stations
By sliding the station height bar you can adjust which section of the cross arch you view on the canvas. The cross section is rendered below the main body of the instrument, and a small dashed line will move up and down the canvas to represent your cross sectional position. 

The cross arching on historical instruments rarely follows the same curve pattern all along the body. In order to accurately represent this, CremonaCad allows you to set the cross arching differently at different stations (heights) of the instrument. Click the 'Set Station at' button to set unique curves at your selected height. CremonaCad will do its best to smoothly join these defined sections.

Once you select your first station, you will have to set another before you can define its curve. Station curves must be of the same type (cycloids with cycloids, splines with splines).

## Curtate Cycloids
![A curtate cycloid: the path of a point inside a rotating circle.](wiki/cycloid.svg)
Along with catenary curves and splines, which are detailed more in the [[long-arching]] panel, the cross arching panel allows you to draw curtate cycloids. This is another lively topic within the making community, and there doesn't seem to be any direct evidence Cremonese makers used this shape for designing their arching. That said, it tracks some instruments quite well, and would have been a pattern of curves known at the time. 

![A curtate cycloid drawn against a circle.](wiki/cycloidCircle.svg)
One nice quality about cycloids is that they can approximate arc segments of circles, while at the same time "flattening out" at their ends. Many luthiers will describe the "radius" of a cross arching at particular stations, and cycloids draw these radii very naturally. 

## Contours and Wireframes
By clicking the wireframe or contour button, you can render a 3D surface of your top and back plates. You can rotate this system by dragging on the rendered area with your mouse. 

## Fields
**Station**

| Field | Description |
|---|---|
| Station | The height along the body of the cross section shown on the canvas. Type a value or drag the slider. |
| Set Station at | Sets a curve of its own at the current station. The table above the plate lists the stations set, and clicking a station's height jumps to it. |

**Top Plate** and **Back Plate**

| Field | Description |
|---|---|
| Catenary, Cycloid, Spline | Which curve draws the cross arch. Stations must use the same type as the plate. |
| Curtate | For a cycloid: how far out on the rolling circle the drawing point sits, as a percent. 100 is a true cycloid and 0 is a plain cosine hump. |
| Percent | For a cycloid: how much of the full cycloid spans the section. Below 100 trims the flat ends. |
| Position | For a spline point: where it sits across the plate, as a percent. 0 is the bass edge, 50 the joint and 100 the treble edge. |
| Height | For a spline point: its height as a percent of the arch height at that station. |
| Mirror | Repeats the point on the other side of the joint. |
| Peak | The spline's highest point, always at full height. Its position is a percent across the plate. |
| Contours, Wireframe | Renders the whole plate surface as a contour map or a wireframe mesh. Drag the rendered area to rotate it. |
