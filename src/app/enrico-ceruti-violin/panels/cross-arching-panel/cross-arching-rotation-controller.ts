import { clamp, normalizeDegrees } from '../../../helpers/draftMath';
import { CerutiViewFlags } from '../../ceruti-types';

/**
 * Pointer-driven plate rotation controller used by cross-arching overlays.
 * Owns drag state and window-level pointer listeners; the host provides the
 * mutable view flags and redraw callback.
 */
export class CrossArchingRotationController {
  private static readonly PLATE_DEG_PER_PX = 0.4;

  private dragActive = false;
  private dragLastX = 0;
  private dragLastY = 0;

  constructor(
    private readonly flags: CerutiViewFlags,
    private readonly redraw: () => void,
  ) {}

  get isDragging(): boolean {
    return this.dragActive;
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.dragActive = false;
  }

  onPointerDown = (event: PointerEvent): void => {
    // Stop this from bubbling into draft-canvas's own pointerdown handler.
    event.stopPropagation();
    event.preventDefault();
    this.dragActive = true;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const dx = event.clientX - this.dragLastX;
    const dy = event.clientY - this.dragLastY;
    this.dragLastX = event.clientX;
    this.dragLastY = event.clientY;

    // Horizontal drag yaws; vertical drag pitches the plate.
    this.flags.plateRotYDeg = normalizeDegrees(
      (this.flags.plateRotYDeg ?? 0) + dx * CrossArchingRotationController.PLATE_DEG_PER_PX,
    );
    this.flags.plateRotXDeg = clamp(
      (this.flags.plateRotXDeg ?? 0) - dy * CrossArchingRotationController.PLATE_DEG_PER_PX,
      -90,
      90,
    );
    this.redraw();
  };

  private onPointerUp = (): void => {
    this.dragActive = false;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    // Redraw once more so the drag frame cursor resets from grabbing to grab.
    this.redraw();
  };
}
