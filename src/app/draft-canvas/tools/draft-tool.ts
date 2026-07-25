import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftShape } from './toolbox-shape';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** The subset of draft-canvas that tools are allowed to touch. */
export interface DraftToolHost {
  addShape(shape: DraftShape): void;
  requestDraw(): void;
  /** Tangent direction (radians) of the snap that resolved the most recent point, if any. */
  getSnapTangent(): number | undefined;
  /** True while the angle-lock modifier (Shift) is held — see two-point-tool.ts's angle snapping. */
  isAngleLockHeld(): boolean;
}

/**
 * A pluggable drafting tool. Draft-canvas owns pointer/keyboard routing and
 * the render loop; a tool only needs to react to points already translated
 * into world (mm) space and commit finished shapes through the host.
 */
export interface DraftTool {
  readonly id: string;
  readonly label: string;
  onPointerDown(pt: Pt, host: DraftToolHost): void;
  onPointerMove(pt: Pt, host: DraftToolHost): void;
  onPointerUp(pt: Pt, host: DraftToolHost): void;
  /** Return true if the key was consumed (e.g. Escape cancels the in-progress shape). */
  onKeyDown?(event: KeyboardEvent, host: DraftToolHost): boolean;
  /** Draws any in-progress preview (e.g. the line being dragged out). */
  renderPreview(gRoot: RootGroup, gUI: RootGroup, pxPerMm: number): void;
  /** Clears in-progress state, e.g. when the tool is deselected. */
  reset(): void;
}
