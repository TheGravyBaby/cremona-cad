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
  /** The shapes currently selected in Select mode — only meaningful to tools with
   * `actsOnSelection: true`, which run against a selection made before they were activated. */
  getSelectedShapes(): DraftShape[];
  /** Current zoom, for converting an mm distance to screen pixels — e.g. distinguishing a
   * stationary click from a real drag with the same fixed pixel threshold draft-canvas's own
   * Select-mode drags use, regardless of how zoomed in/out the canvas is. */
  getPxPerMm(): number;
}

/**
 * A pluggable drafting tool. Draft-canvas owns pointer/keyboard routing and
 * the render loop; a tool only needs to react to points already translated
 * into world (mm) space and commit finished shapes through the host.
 */
export interface DraftTool {
  readonly id: string;
  readonly label: string;
  /** A single click commits immediately (e.g. Text) — draft-canvas returns to Select and
   * selects the new shape right after, rather than leaving the tool active for another click. */
  readonly oneShot?: boolean;
  /** True for tools that transform the current selection instead of drawing new shapes by
   * clicking (e.g. Offset) — draft-canvas keeps the selection alive across activation for
   * these, instead of clearing it the way it does for ordinary drawing tools. */
  readonly actsOnSelection?: boolean;
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
