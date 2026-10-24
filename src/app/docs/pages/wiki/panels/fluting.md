---
id: fluting
title: Fluting channel
kind: panel
panel: fluting
status: unreviewed
image: wiki/fluting.svg
caption: The fluting channel of the default violin.
---
This panel allows you to define the properties of the fluting channels. Once the contour for the top and back plate are cut, the maker begins the arching process by carving the fluting channel. This is a small channel which travels around the instrument, carved with a gouge. The arching will later be carved to smoothly meet this channel. 

The C-Bout usually has a thinner fluting channel, hence the toggle. 

### Gouge Corners
There is a toggle which sets whether the fluting channel will be smoothed to the corners. In the normal making process, the fluting channel is carved such that it bypasses the corners. Usually after arching is completed, the corners are gouged out to smoothly meet the fluting channel. CremonaCad can export STL files of the top and back plates, toggling this setting will effect whether or not the STL attempts to smoothly join the corner to the channel. It has no effect on the calculated arching but can be relevant to CNC making.

### Bi-Arcs
Creating a smooth fluting channel around the instrument is fairly straight forward in real life, as one just takes the gouge around the path of the plate, continuing the channel past the corners. However, to calculate a smooth path in CremonaCad was one of the trickier problems of the application, as the corners are a critical part of the geometry. The solution came from studying two papers from Bolton (1975) and Meek & Walton (1992). Two arcs can be drawn to smoothly join any two vectors, but there are always many possible solutions. Further work had to be done to find reasonable solutions, even involving changing the taking off point on the initial arcs. Anyhow, this is just a cool development note, might delete later :P. 


## Fields

| Field | Description |
|---|---|
| Fluting Edge | TODO |
| Gouge Corners | TODO |

| Width | TODO |
| Depth | TODO |
| C Bout Width | TODO |