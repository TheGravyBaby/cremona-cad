import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { renderPath, renderSegment, renderSolveFailures, renderTranslatedLayers } from '../../../../helpers/renderFuncs';
import { buildBlankMiss, buildMiss, reportFailures, solveSection } from '../../../../helpers/validators';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { STROKE_WEIGHT } from '../../../../theme/palettes';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { BassBarParams, RenderLayer, ViolinFamilyParams, ViolinFamilyToggleKey } from '../../violin-family-types';
import { PanelComponentBase } from '../panel-component-base';
import { BassBarSolve, PlateContourSolve } from '../../violin-family-solves';
import { renderPlateContour, solvePlateContour } from '../plate-contour-panel/plate-contour-panel';
import { defineFholePath, renderFholes, solveFholeContours } from '../fhole-contours-panel/fhole-contours-panel';
import { solveNeck } from '../neck-panel/neck-panel';
import { calcSideViewOffsetX, renderBodySideProfile, solveLongArching } from '../long-arching-panel/long-arching-panel';
import { moveInVectorSpace, TURN, vectorFromSlopeAndMag } from '../../../../helpers/math/simpleGeometry';

// The bass bar, tried out on localhost only, once the top is graduated. A placeholder so far: the
// panel, its seed and a solve that only checks the fields, drawn over the top. Panel and render,
// then the solve.

// a violin's bar runs about three quarters of the body, 5.5 mm wide and 12 mm high at the middle;
// the bigger instruments scale from it. Placeholder figures
const SEED_LENGTH_SHARE = 0.75;
const SEED_WIDTH_SHARE = 5.5 / 356;
const SEED_HEIGHT_SHARE = 12 / 356;

@Component({
  selector: 'app-vf-dev-bassbar-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-bassbar-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevBassBarPanel extends PanelComponentBase {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = [];
  protected readonly pal = ThemeService.getPalette('lamplight');

  static seed(p: ViolinFamilyParams): void {
    if (p.bassBar || !p.graduation) return;
    let h = p.body.height;
    let upperEyeX = p.fHoles.UEye.x;
    

    p.bassBar = {
      length: Math.round(h * SEED_LENGTH_SHARE),
      width: Math.round(2 * h * SEED_WIDTH_SHARE) / 2,
      height: Math.round(2 * h * SEED_HEIGHT_SHARE) / 2,
      xOffset: -upperEyeX/2,
      angle: 90
    };
  }

  // what the last draw solved; reportSolveFailures() reads it rather than solving again
  b!: BassBarSolve;

  get bb(): BassBarParams {
    return this.params.bassBar!;
  }

  reportSolveFailures(): void {
    reportFailures(this.b.failures, 'Dev Bass Bar');
  }

  protected buildCanvasLayers(): RenderLayer[] {
    let p = this.params;
    let a = solveLongArching(p)!;
    let o = solvePlateContour(p)!;
    let b = this.b = solveBassBar(p)!;
    let sideX = calcSideViewOffsetX(p);
  
    // we will put a side profile of the bass bar here
    let side = [      
    ]

    return [
      renderPlateContour(p, o, this.pal, this.flags, false, false),
      renderFholes(p, this.pal),
      renderTranslatedLayers(side, sideX),
      renderSolveFailures(b.failures, this.pal.alert),
      renderBassBar(b, this.pal),
    ];
  }
}

export const renderBassBar = (b: BassBarSolve, pal: PanelPalette) => (g: any, ui: any): void => {
  let { upperLeft, upperRight, lowerLeft, lowerRight } = b;
  if (!upperLeft || !upperRight || !lowerLeft || !lowerRight) return;
  renderSegment(upperLeft, upperRight, pal.ink(0))(g, ui);
  renderSegment(upperRight, lowerRight, pal.ink(0))(g, ui);
  renderSegment(lowerRight, lowerLeft, pal.ink(0))(g, ui);
  renderSegment(lowerLeft, upperLeft, pal.ink(0))(g, ui);
}

// a later panel reads the bass bar by calling this; it returns and never writes to the params
export function solveBassBar(p: ViolinFamilyParams): BassBarSolve | null {
  if (!p.bassBar) return null;
  let bb = p.bassBar;
  let b: BassBarSolve = { upperLeft: null, upperRight: null, lowerLeft: null, lowerRight: null, failures: [] };

  solveSection(b.failures, 'Bass bar', ['bar'], () => {
    let blank = buildBlankMiss('Bass bar', ['bar'], [bb.length, bb.width, bb.height, bb.xOffset, bb.angle]);
    if (blank) return blank;
    if (!(bb.length > 0 && bb.width > 0 && bb.height > 0)) return buildMiss('Bass bar: the length, width and height need values above 0.', ['bar']);
    
    let angle = bb.angle * TURN.degree
    let normalAngle = angle + TURN.quarter;
    let widthVector = vectorFromSlopeAndMag(normalAngle, bb.width / 2);
    let widthVectorX = widthVector.a * widthVector.mag;
    let widthVectorY = widthVector.b * widthVector.mag;

    let midpointY = p.body.height / 2
    let leftMid = { x: bb.xOffset + widthVectorX, y: midpointY + widthVectorY };
    let rightMid = { x: bb.xOffset - widthVectorX, y: midpointY - widthVectorY };

    let bassBarVector = vectorFromSlopeAndMag(angle, bb.length / 2)
    let bassBarVecorMinus = vectorFromSlopeAndMag(angle + TURN.half, bb.length / 2);
    
    b.upperLeft = moveInVectorSpace(leftMid, [bassBarVector]);
    b.upperRight = moveInVectorSpace(rightMid, [bassBarVector]);
    b.lowerLeft = moveInVectorSpace(leftMid, [bassBarVecorMinus]);
    b.lowerRight = moveInVectorSpace(rightMid, [bassBarVecorMinus]);
    return null;
  });

  return b;
}
