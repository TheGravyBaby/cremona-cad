---
id: fluting
title: Fluting channel
kind: panel
panel: fluting
status: unreviewed
image: wiki/fluting.svg
---
This panel allows you to define the properties of the fluting channels. Once the contours for the top and back plates are cut, the maker begins the arching process by carving the fluting channel. This is a small channel which travels around the instrument, carved with a gouge. The arching will later be carved to smoothly meet this channel.

The C-Bout usually has a thinner fluting channel, hence the toggle. 

### Gouge Corners
There is a toggle which sets whether the fluting channel will be smoothed to the corners. In the normal making process, the fluting channel is carved such that it bypasses the corners. Usually after arching is completed, the corners are gouged out to smoothly meet the fluting channel. CremonaCad can export STL files of the top and back plates, and toggling this setting will affect whether or not the STL attempts to smoothly join the corner to the channel. It has no effect on the calculated arching but can be relevant to CNC making.


## Fields
**Channel**

| Field | Description |
|---|---|
| Fluting Edge | The width of the flat left around the plate's edge before the channel begins, measured in from the outer edge. One value for both plates. |
| Gouge Corners | Smooths the corners down to the channel in the STL export. Has no effect on the drawn arching. |

**Top Plate** and **Back Plate**

| Field | Description |
|---|---|
| Width | The channel's width, from where the gouge enters the plate to where it comes back out. |
| Depth | The channel's depth at its trough. |
| C Bout | Uses a second, narrower channel around the center bout. |
| Width | The width of that narrower channel. |

## Notes
Creating a smooth fluting channel around the instrument is fairly straightforward in real life, as one just takes the gouge around the path of the plate, continuing the channel past the corners. However, to calculate a smooth path in CremonaCad was one of the trickier problems of the application, as the corners are a critical part of the geometry. The solution came from studying two papers from Bolton (1975) and Meek & Walton (1992). Two arcs can be drawn to smoothly join any two vectors, but there are always many possible solutions. Further work had to be done to find reasonable solutions, even involving changing the taking off point on the initial arcs. Anyhow, this is just a cool development note, might delete later :P. 
