import { PanelScope } from './panel-scope';

export type Layer = {
  id: string;
  name: string;
  locked: boolean;
  /** Where the layer shows — see panel-scope.ts. Absent means every panel. */
  scope?: PanelScope;
  /** The part face this layer's shapes are drawn on, for a recipe that cuts what is drawn there:
   * `id` a plain key like a scope's panel ids, `origin` where that face's own zero sat on the
   * canvas when the shapes were last placed, so a shape less the origin is a point on the face.
   * The recipe moves both together — see ToolboxStore.moveFace. */
  face?: { id: string; origin: { x: number; y: number } };
};

// Shapes persisted before layers existed have no `layerId` — treating that as
// this fixed id (rather than migrating stored data) means old shapes just
// land on the first layer for free. See ToolboxStore.
export const DEFAULT_LAYER_ID = 'layer-default';

let layerIdSeq = 0;

export function makeLayerId(): string {
  layerIdSeq += 1;
  return `layer-${Date.now().toString(36)}-${layerIdSeq.toString(36)}`;
}
