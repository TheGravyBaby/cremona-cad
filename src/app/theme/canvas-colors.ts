// the toolbox's own colours: the pen a new shape is stamped with, the preview of a shape being
// drawn, and the selection, snap and grabber marks over it. Fixed in both modes, since a pen
// colour is saved into the shape and the marks sit over shapes of any colour
export const CANVAS_COLORS = {
  pen: '#1d4ed8',
  sectionAlt: '#93c5fd',
  preview: '#2563eb',
  snap: '#16a34a',
  selection: '#f59e0b',
  grabberStroke: '#78350f',
  highlighter: '#fde047',
} as const;
