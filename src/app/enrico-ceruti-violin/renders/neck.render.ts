import { Pt } from '../../models/types';
import { pathFromArc } from '../../helpers/math/pathMath';
import { renderDashedLine, renderPath, renderPolygon, renderSegment, renderText } from '../../helpers/renderFuncs';
import { CerutiColors } from '../ceruti-types';
import { NeckSolve } from '../ceruti-neck';
import { STROKE_WEIGHT } from './render-constants';
import { renderGuideBaseline, renderGuideMeasure } from './module-guide.render';

// ===== Neck in the side elevation =====
// Drawn over the body section, in its frame. Every shape here is already solved in
// ceruti-neck.ts — this file only turns points and an Arc into SVG calls. Solid where the eye
// would see it, dashed where the foot sits inside the mortise and the fingerboard plane runs on
// through the plate's notch.

const HIDDEN_DASH = '2 2';

export function renderNeck(s: NeckSolve, colors: CerutiColors, showGuides: boolean) {
  return (g: any, ui: any): void => {
    const seg = (a: Pt, b: Pt, color = colors.neck) => renderSegment(a, b, color, STROKE_WEIGHT.section)(g, ui);
    const hidden = (a: Pt, b: Pt) => renderDashedLine(a, b, colors.neck, HIDDEN_DASH, STROKE_WEIGHT.guide, 0.6)(g, ui);

    // the button: the back plate carried on past its edge, the heel's foot on top of it
    renderPolygon(s.buttonProfile, colors.neck, STROKE_WEIGHT.section)(g, ui);

    // the foot in the mortise
    hidden(new Pt(0, s.mortiseFloorY), s.gluingAtMortise);
    hidden(s.gluingAtMortise, s.root);

    // the bridge blank, standing on the arch
    renderPolygon(s.bridgeWedge, colors.bridge, STROKE_WEIGHT.section)(g, ui);

    if (s.nut && s.fingerboard && s.back && s.nutBlock) {
      // the neck's own boundary where the fingerboard glues on — independent of whatever the
      // fingerboard itself ends up being, since that's still an open question
      seg(s.root, s.nut.at);

      const fb = s.fingerboard;
      renderPolygon([fb.end, fb.endTop, fb.nutTop, s.nut.at], colors.fingerboard, STROKE_WEIGHT.section)(g, ui);

      // the nut, on the fingerboard plane just past the board
      renderPolygon(s.nutBlock, colors.fingerboard, STROKE_WEIGHT.section)(g, ui);

      // the neck itself: nut-end wall, the back, and the heel down to the button
      seg(s.nut.at, s.back.nut);
      const heel = s.heel;
      if (heel) {
        seg(s.back.nut, heel.start);
        renderPath(pathFromArc(heel.arc), colors.neck, STROKE_WEIGHT.section)(g, ui);
        if (heel.face) seg(heel.end, heel.face);
      } else {
        seg(s.back.nut, s.back.root);
      }

      seg(s.nut.string, s.bridge.top, colors.innerTrace);

      // pegbox and scroll, boxed until their panel exists
      if (s.scroll && s.scrollLabelAngleDeg !== null) {
        renderPolygon(s.scroll, colors.neckOff, STROKE_WEIGHT.guide, 0.7)(g, ui);
        const mid = new Pt((s.scroll[0].x + s.scroll[2].x) / 2, (s.scroll[0].y + s.scroll[2].y) / 2);
        renderText(mid, 'scroll', colors.neckOff, 5, s.scrollLabelAngleDeg)(g, ui);
      }
    }

    if (!showGuides) return;
    const guide = colors.neckOff;
    renderGuideMeasure(s.edge, s.root, guide)(g, ui);
    renderGuideBaseline(new Pt(0, s.rootPlaneY), new Pt(s.gluingAtMortise.x, s.rootPlaneY), guide)(g, ui);
    renderGuideMeasure(new Pt(s.gluingAtMortise.x, s.rootPlaneY), s.gluingAtMortise, guide)(g, ui);
    if (s.nut && s.projectionHit) {
      renderGuideMeasure(s.root, s.nut.at, guide)(g, ui);
      renderGuideBaseline(s.fingerboard!.endTop, s.projectionHit, guide)(g, ui);
      renderGuideMeasure(s.bridge.foot, s.projectionHit, guide)(g, ui);
    }
  };
}
