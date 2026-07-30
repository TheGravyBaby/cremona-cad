import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { ImageShape, makeShapeId } from './toolbox-shape';
import { ImageAssetStore } from './image-asset-store';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

/** Width a placed image falls back to when no recipe has set design bounds yet. */
const FALLBACK_WIDTH_MM = 200;

/**
 * Sizes a newly placed image to sit over the design it will be traced against: fitted inside the
 * recipe's bounds, aspect preserved, centered on them. That's the workflow this exists for — drop
 * a photo of an instrument onto the drawing, then scale it to real dimensions off the axis or the
 * bounding box. Once placed it's an ordinary selected shape, so nudging or resizing from there
 * needs nothing image-specific.
 */
function fitToBounds(
  naturalW: number, naturalH: number, bounds: { pt1: Pt; pt2: Pt } | null,
): { x: number; y: number; width: number; height: number } {
  const aspect = naturalW / naturalH || 1;

  if (!bounds) {
    const width = FALLBACK_WIDTH_MM;
    const height = width / aspect;
    return { x: -width / 2, y: 0, width, height };
  }

  const boundsW = Math.abs(bounds.pt2.x - bounds.pt1.x);
  const boundsH = Math.abs(bounds.pt2.y - bounds.pt1.y);
  const centerX = (bounds.pt1.x + bounds.pt2.x) / 2;
  const centerY = (bounds.pt1.y + bounds.pt2.y) / 2;

  const width = boundsW / boundsH > aspect ? boundsH * aspect : boundsW;
  const height = boundsW / boundsH > aspect ? boundsH : boundsW / aspect;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/**
 * Places a reference image — a photo, scan, or drawing to trace over — on the canvas.
 *
 * Unlike every other tool, its input is a file rather than a click, so it does its whole job in
 * onActivate: open the picker, place the image over the design bounds, then hand control straight
 * back to Select with the new image selected, so its resize/rotate handles and its settings-bar
 * row are immediately live. There is deliberately nothing else here — moving, resizing, rotating,
 * hiding, deleting and undoing a placed image are all the generic shape machinery (see
 * shape-grabbers.ts, shape-hit-test.ts, ToolboxStore), not this tool's business.
 *
 * The pixels never touch the shape: `imageRef` points into ImageAssetStore, which is what keeps
 * base64 payloads out of undo history and sessionStorage.
 */
export class ImageTool implements DraftTool {
  readonly id = 'image';
  readonly label = 'Reference Image';

  constructor(private assets: ImageAssetStore, private toolbox: ToolboxStore) {}

  onActivate(host: DraftToolHost): void {
    void this.placeImage(host);
  }

  private async placeImage(host: DraftToolHost): Promise<void> {
    const file = await host.requestImageFile();
    // Dismissed the dialog — go straight back to Select rather than leaving a tool active that
    // ignores every click.
    if (!file) {
      host.returnToSelect();
      return;
    }

    const box = fitToBounds(file.width, file.height, host.getDesignBounds());
    const shape: ImageShape = {
      id: makeShapeId(),
      type: 'image',
      ...box,
      rotationDeg: 0,
      imageRef: this.assets.intern(file.dataUrl, file.width, file.height),
      // Numbered like the recipe loader's own default (see reference-image-schema.ts), so several
      // placed images are told apart in the image list without renaming each one first.
      label: `Img ${this.toolbox.getImageShapes().length + 1}`,
      // Explicitly unlocked, against the absent-means-locked default: you add an image in order
      // to position and scale it, so it has to be grabbable straight away. It saves as unlocked
      // and can be locked from the image list or the settings bar once it's placed.
      locked: false,
    };

    host.addShape(shape);
    host.returnToSelect(shape.id);
  }

  // Every gesture on a placed image is handled by Select mode, so there is nothing for the tool
  // itself to do with the pointer — it has already handed control back by the time any of these
  // could fire.
  onPointerDown(_pt: Pt, _host: DraftToolHost): void {}
  onPointerMove(_pt: Pt, _host: DraftToolHost): void {}
  onPointerUp(_pt: Pt, _host: DraftToolHost): void {}
  renderPreview(_gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void {}
  reset(): void {}
}

export function createImageTool(assets: ImageAssetStore, toolbox: ToolboxStore): ImageTool {
  return new ImageTool(assets, toolbox);
}
