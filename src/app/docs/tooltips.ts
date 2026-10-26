import { Directive, HostBinding, Input } from '@angular/core';

// Every tooltip that explains something, keyed by where it hangs. A tooltip that only names a
// control ("Zoom in", "Add layer") stays a literal title= in its template.

export const TOOLTIPS = {
  'view.zoom': "Click to type in the view's center and zoom.",

  'edit.copy': 'Copies the selection to the clipboard as a real size SVG.',
  'edit.paste': 'Pastes in place onto the active layer.',
  'edit.saveSelection': 'Saves the selection as a real size SVG file.',
  'edit.duplicate': 'Places a copy over the original on the active layer. Duplicating a recipe piece gives you a copy you can edit.',

  'layers.recipe': 'Everything the recipe draws. When this layer is unlocked you can select, measure and duplicate its pieces, but never edit them.',
  'layers.moveSelection': 'Moves the selection to this layer.',
  'layers.importSvg': 'Imports an SVG or DXF file onto the active layer.',
  'layers.saveLayer': 'Saves the active layer as a real size SVG or DXF file.',

  'images.unlock': 'Click to show and unlock this image. Double-click to rename it.',
  'images.upload': 'Places an image file on the canvas. You can also paste a copied image onto the canvas with Ctrl+V.',
  'images.link': 'Places an image from a web address. Use the link to the image itself, found with "Copy image address", not the page it sits on.',

  'settings.recipePiece': 'The recipe draws this piece from its parameters, so it can\'t be edited here. Duplicate it with Ctrl+D to get a copy you can edit.',
  'settings.color': 'Sets the color of the selected shape. With nothing selected, it sets the color for new shapes.',
  'settings.sectionColor2': 'The section tool alternates between both colors.',
  'settings.strokeWidth': 'Line weight in screen pixels. It looks the same at any zoom.',
  'settings.selectionCenter': 'The center of the selection. Type a new value to move everything selected.',
  'settings.lineLength': 'Changes the distance from X1/Y1. The angle stays the same.',
  'settings.dimensionOffset': 'Moves the dimension line away from the points it measures. A negative value moves it to the other side.',
  'settings.cycloidFactor': 'How far out on the rolling circle the draw point sits. 100 draws a true cycloid and 0 draws a plain cosine hump.',
  'settings.cycloidPercent': 'How much of the full cycloid spans the chord. Below 100 trims the flat ends, above 100 curls them under the chord.',
  'settings.labelText': 'Enter adds a line and Escape reverts. Double-click the label on the canvas for a bigger editing box.',
  'settings.fontSize': 'Text size is measured in mm on the drawing, so it scales with the zoom. New labels use this size too.',
  'settings.textAngle': 'Degrees counterclockwise. You can also drag the round handle above a selected label.',
  'settings.resetPen': 'Sets the color, width and opacity back to a normal line.',
  'settings.highlighter': 'Switches the pen to a wide, translucent yellow line.',
  'settings.imageWidth': 'Type a real measurement in mm to scale the image. The height follows, so the image never stretches.',
  'settings.imageHeight': 'Type a real measurement in mm to scale the image. The width follows, so the image never stretches.',
  'settings.imageMirror': 'Mirrors the image left to right.',
  'settings.imageCrop': 'Hides part of the image. The rest keeps its place and scale.',
  'settings.imagePanels': 'Choose which panels show this image.',
  'settings.imageLock': "Locks the image so it can't be selected or dragged. You can unlock it again from the image list.",
  'settings.sectionWeights': 'A comma separated list of weights. A list of 1,2,1 splits the distance into three parts, with the middle part twice as long. Press Enter to apply.',

  'toolbar.export': 'Export templates, plans and a copy of the recipe.',

  'prefs.appearanceAuto': 'Uses the day theme from 7:00 to 19:00, checked when you open the app.',
  'prefs.barAutoHide': 'The top bar slides away until your pointer reaches the top edge.',
  'prefs.fitOnPanelChange': 'You can also press F to fit the view at any time.',

  'reorderRow': 'Drag to reorder this row, or use the arrow keys.',
} as const satisfies Record<string, string>;

export type TooltipId = keyof typeof TOOLTIPS;

@Directive({ selector: '[docTip]', standalone: true })
export class TooltipDirective {
  @Input({ required: true }) docTip!: TooltipId;

  @HostBinding('attr.title') get title(): string { return TOOLTIPS[this.docTip]; }
}
