export type Layer = { id: string; name: string; visible: boolean; locked: boolean };

// Shapes persisted before layers existed have no `layerId` — treating that as
// this fixed id (rather than migrating stored data) means old shapes just
// land on the first layer for free. See ToolboxStore.
export const DEFAULT_LAYER_ID = 'layer-default';

let layerIdSeq = 0;

export function makeLayerId(): string {
  layerIdSeq += 1;
  return `layer-${Date.now().toString(36)}-${layerIdSeq.toString(36)}`;
}
