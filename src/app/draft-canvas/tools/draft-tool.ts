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
  /** True while the tangent-lock modifier (Ctrl, or ⌘ on Mac) is held — locks onto the tangent of
   * whatever the start point snapped onto, independently of isAngleLockHeld/Shift's 30/45/90°
   * grid. See two-point-tool.ts's angleLockModifier. */
  isTangentLockHeld(): boolean;
  /** The shapes currently selected in Select mode — only meaningful to tools with
   * `actsOnSelection: true`, which run against a selection made before they were activated. */
  getSelectedShapes(): DraftShape[];
  /** Current zoom, for converting an mm distance to screen pixels — e.g. distinguishing a
   * stationary click from a real drag with the same fixed pixel threshold draft-canvas's own
   * Select-mode drags use, regardless of how zoomed in/out the canvas is. */
  getPxPerMm(): number;
  /** Nearest toolbox shape to `pt` within the same tolerance Select-mode clicks use, or null —
   * lets a selection-based tool (e.g. Offset) hit-test a click itself, without needing its own
   * copy of every shape or the select tolerance constant. */
  hitTestShape(pt: Pt): string | null;
  /** Replaces the whole selection with just this shape — same effect as a plain Select-mode
   * click on it, so a tool like Offset can adopt a shape the user clicked directly. */
  selectShape(id: string): void;
  /** Deletes a toolbox shape by id (a no-op if it's already gone or its layer is locked) — each
   * call is its own undo step, same as a Select-mode Delete keypress. See eraser-tool.ts. */
  removeShape(id: string): void;
  /** Switches back to the Select tool, optionally with a just-created shape selected — for a tool
   * whose commit is asynchronous and so can't rely on draft-canvas's synchronous `oneShot`
   * handling to hand control back. */
  returnToSelect(selectShapeId?: string): void;
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
  /** True for tools whose points shouldn't snap to nearby geometry (e.g. Freehand) — snapping
   * would flatten a natural pen stroke onto whatever construction geometry it passes near.
   * Checked by draft-canvas.ts's resolveToolPoint before every onPointerDown/Move/Up call. */
  readonly disableSnapping?: boolean;
  /** Runs the moment the tool is activated, before any pointer input. For a tool that has
   * something to set up, or whose input isn't a click at all. Most tools don't need it. */
  onActivate?(host: DraftToolHost): void;
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
