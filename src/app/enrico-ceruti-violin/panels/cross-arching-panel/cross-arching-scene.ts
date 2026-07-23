import { Pt } from '../../../models/types';
import { clamp } from '../../../helpers/draftMath';
import { samplePathToPolyline } from '../../../helpers/svgPathMath';
import { CerutiColors, CerutiViewFlags, EnricoCerutiParams } from '../../ceruti-types';
import {
  calculateCrossArchTop,
  contourSampleSteps,
  flutingHalfWidthAtY,
  flutingOuterHalfWidthAtY,
  innerHalfWidthAtY,
  outerHalfWidthAtY,
  wireframeSampleSteps,
} from '../../ceruti-arching';
import { calculateOuterArcs } from '../../ceruti-calcs';
import { defineOuterPath } from '../../ceruti-paths';
import {
  ArchContourLevel,
  buildPlateSurfaceModel,
  calculateFlutingSectionTop,
  computeArchContourRings,
  PlateSurfaceModel,
  stationChordsAt,
} from '../../ceruti-surface';
import {
  computeArchContourBounds,
  projectArchContourRings,
  projectFlatPolyline,
  renderArchContours3d,
} from '../../renders/arch-contours.render';
import {
  computeSingleWireframeStrip,
  computeWireframeBounds,
  computeWireframeGeometry,
  projectWireframe,
  renderArch3dWireframe,
  WireframeGeometry,
} from '../../renders/arch-3d-wireframe.render';
import { renderCrossSection } from '../../renders/cross-arching.render';
import { renderWireframeDragFrame } from '../../renders/wireframe-drag-frame.render';

export type RenderLayer = (g: any, ui: any) => void;

export interface CrossArchingSceneInput {
  params: EnricoCerutiParams;
  viewFlags: CerutiViewFlags;
  colors: CerutiColors;
}

export interface CrossArchingDragState {
  active: boolean;
  onPointerDown: (event: PointerEvent) => void;
}

/**
 * Builds all cross-arching render layers from params and view flags.
 * This owns cross-arching caches so the component can stay as a thin runtime.
 */
export class CrossArchingSceneBuilder {
  /**
   * The contour grid is the most expensive cross-arching step and depends only
   * on params, so rotation and station drags can reuse cached local rings.
   */
  private archContourCache: {
    key: string;
    top: { levels: ArchContourLevel[]; outlinePts: Pt[] | null } | null;
    bottom: { levels: ArchContourLevel[]; outlinePts: Pt[] | null } | null;
  } = { key: '', top: null, bottom: null };

  /**
   * Wireframe sampling is rotation-independent: cache raw strip/rib geometry
   * and only re-project during drags.
   */
  private wireframeCache: {
    key: string;
    top: WireframeGeometry | null;
    bottom: WireframeGeometry | null;
  } = { key: '', top: null, bottom: null };

  /**
   * Surface model build is params-only and relatively expensive, so we reuse it
   * across station and rotation updates.
   */
  private surfaceModelCache: {
    key: string;
    top: PlateSurfaceModel | null;
    bottom: PlateSurfaceModel | null;
  } | null = null;

  build(input: CrossArchingSceneInput, drag: CrossArchingDragState): RenderLayer[] {
    const p = input.params;
    const f = input.viewFlags;
    const colors = input.colors;
    const a = p.arching!;

    f.crossSectionY = clamp(f.crossSectionY ?? 0, 1, p.height - 1);
    // The plate slabs span the outer path, whose corner arcs must be current.
    calculateOuterArcs(p);

    // Snapshot taken after calculateOuterArcs so the key is deterministic.
    // One key serves the model, contour, and wireframe caches.
    const paramsKey = JSON.stringify(p);
    if (this.surfaceModelCache?.key !== paramsKey) {
      this.surfaceModelCache = {
        key: paramsKey,
        top: buildPlateSurfaceModel(p, 'top'),
        bottom: buildPlateSurfaceModel(p, 'bottom'),
      };
    }

    const model = this.surfaceModelCache.top;
    const backModel = this.surfaceModelCache.bottom;
    const halfWidthInner = innerHalfWidthAtY(p, f.crossSectionY);
    // Chords come from the sampled outer path to retain cubic corner tips.
    const chords = model ? stationChordsAt(p, model, f.crossSectionY) : null;
    const halfWidthOuter = chords?.outerHalf ?? outerHalfWidthAtY(p, f.crossSectionY);
    const flutingOuterHalf = chords?.platformOuterHalf ?? flutingOuterHalfWidthAtY(p, f.crossSectionY);
    const flutingInnerHalf = chords?.flutingInnerHalf ?? flutingHalfWidthAtY(p, f.crossSectionY);
    const crossTop = calculateCrossArchTop(p, f.crossSectionY, 'top');
    const crossBack = calculateCrossArchTop(p, f.crossSectionY, 'bottom');

    const flutingSlice = model ? calculateFlutingSectionTop(p, model, f.crossSectionY) : null;
    const flutingSliceBack = backModel ? calculateFlutingSectionTop(p, backModel, f.crossSectionY) : null;

    const renders: RenderLayer[] = [
      renderCrossSection(
        p,
        a,
        colors,
        f.showModuleGuides,
        halfWidthInner,
        halfWidthOuter,
        flutingOuterHalf,
        flutingInnerHalf,
        crossTop?.path ?? null,
        flutingSlice,
        crossBack?.path ?? null,
        flutingSliceBack,
      ),
    ];

    // yOffset lifts overlays above the section view.
    const yOffset = a.ribHeight + a.top.thickness + a.top.arch.archHeight + 15;
    const rotX = f.plateRotXDeg ?? 0;
    const rotY = f.plateRotYDeg ?? 0;
    const rotZ = f.plateRotZDeg ?? 0;

    const showTopContours = f.topPlateView === 'contours';
    const showBackContours = f.backPlateView === 'contours';
    if ((showTopContours || showBackContours) && (model || backModel)) {
      if (this.archContourCache.key !== paramsKey) {
        this.archContourCache = { key: paramsKey, top: null, bottom: null };
      }
      const c = this.archContourCache;

      if (showTopContours && model) {
        const { stepMm, gridMm } = contourSampleSteps(p, a.top.arch.archHeight);
        c.top ??= {
          levels: computeArchContourRings(p, model, stepMm, gridMm),
          outlinePts: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, false), 1),
        };

        const levels = projectArchContourRings(c.top.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        const outline = c.top.outlinePts
          ? projectFlatPolyline(c.top.outlinePts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1)
          : null;

        renders.push(renderArchContours3d(colors, levels, outline, colors.archTop));
        const bounds = computeArchContourBounds(c.top.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        renders.push(renderWireframeDragFrame(bounds, colors, drag.active, drag.onPointerDown));
      }

      if (showBackContours && backModel) {
        const { stepMm, gridMm } = contourSampleSteps(p, a.bottom.arch.archHeight);
        c.bottom ??= {
          levels: computeArchContourRings(p, backModel, stepMm, gridMm),
          outlinePts: samplePathToPolyline(defineOuterPath(p, p.overhang + p.rib, true, true), 1),
        };

        const levels = projectArchContourRings(c.bottom.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        const outline = c.bottom.outlinePts
          ? projectFlatPolyline(c.bottom.outlinePts, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1)
          : null;

        renders.push(renderArchContours3d(colors, levels, outline, colors.archBack));
        const bounds = computeArchContourBounds(c.bottom.levels, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        renders.push(renderWireframeDragFrame(bounds, colors, drag.active, drag.onPointerDown));
      }
    }

    const showTopWireframe = f.topPlateView === 'wireframe';
    const showBackWireframe = f.backPlateView === 'wireframe';
    if ((showTopWireframe || showBackWireframe) && (model || backModel)) {
      if (this.wireframeCache.key !== paramsKey) {
        this.wireframeCache = { key: paramsKey, top: null, bottom: null };
      }
      const wf = this.wireframeCache;
      const { stationStepMm, sampleStepMm } = wireframeSampleSteps(p);

      if (showTopWireframe && model) {
        wf.top ??= computeWireframeGeometry(p, model, stationStepMm, sampleStepMm);
        const top = projectWireframe(wf.top, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        const highlightTop = f.crossSectionY != null
          ? computeSingleWireframeStrip(p, model, f.crossSectionY, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, 1)
          : null;

        renders.push(renderArch3dWireframe(colors, top.strips, top.ribs, highlightTop, colors.archTop));
        const bounds = computeWireframeBounds(wf.top, p.height, yOffset, rotX, rotY, rotZ, 1, 0, 1);
        renders.push(renderWireframeDragFrame(bounds, colors, drag.active, drag.onPointerDown));
      }

      if (showBackWireframe && backModel) {
        wf.bottom ??= computeWireframeGeometry(p, backModel, stationStepMm, sampleStepMm);
        const back = projectWireframe(wf.bottom, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        const highlightBack = f.crossSectionY != null
          ? computeSingleWireframeStrip(p, backModel, f.crossSectionY, yOffset, rotX, rotY, rotZ, 1, sampleStepMm, 0, -1)
          : null;

        renders.push(renderArch3dWireframe(colors, back.strips, back.ribs, highlightBack, colors.archBack));
        const bounds = computeWireframeBounds(wf.bottom, p.height, yOffset, rotX, rotY, rotZ, 1, 0, -1);
        renders.push(renderWireframeDragFrame(bounds, colors, drag.active, drag.onPointerDown));
      }
    }

    return renders;
  }
}
