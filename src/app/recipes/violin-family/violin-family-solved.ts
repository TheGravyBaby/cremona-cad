import { ViolinFamilyParams } from './violin-family-types';
import { ViolinFamilySolved } from './violin-family-solves';

// brings `p.solved` up to the params. Nothing is solved here: a stage whose own params have moved
// is cleared, and so is every stage that reads it, down through the children. The
// `solved<Stage>(p)` beside each solver calls this, then solves its stage if it stands cleared, so
// a read is never behind the params whoever changed them: a field, a seed, an undo, a spec. The
// check is a few microseconds; a loop still reads once and keeps the answer in a variable.
// `solved` is not enumerable, so JSON never sees it: not the file, an undo entry or the session
// write. A copy of the params (`{ ...p }`, a JSON round trip) comes without it for the same reason
export function updateSolved(p: ViolinFamilyParams): void {
  if (!p.solved) {
    let solved: ViolinFamilySolved = {
      ribArcs: { solve: undefined, children: ['plateContour'], lastParams: '' },
      plateContour: { solve: undefined, children: ['fluting', 'graduation'], lastParams: '' },
      fluting: { solve: undefined, children: ['crossArchingTop', 'crossArchingBack'], lastParams: '' },
      crossArchingTop: { solve: undefined, children: ['landTop'], lastParams: '' },
      crossArchingBack: { solve: undefined, children: ['landBack'], lastParams: '' },
      graduation: { solve: undefined, children: ['landTop', 'landBack', 'femGarland'], lastParams: '' },
      landTop: { solve: undefined, children: ['thicknessFieldTop'], lastParams: '' },
      landBack: { solve: undefined, children: ['thicknessFieldBack'], lastParams: '' },
      thicknessFieldTop: { solve: undefined, children: ['thicknessBandsTop', 'bassBarContact', 'femMesh'], lastParams: '' },
      thicknessFieldBack: { solve: undefined, children: ['thicknessBandsBack', 'femMesh'], lastParams: '' },
      thicknessBandsTop: { solve: undefined, children: [], lastParams: '' },
      thicknessBandsBack: { solve: undefined, children: [], lastParams: '' },
      bassBarContact: { solve: undefined, children: [], lastParams: '' },
      femMesh: { solve: undefined, children: [], lastParams: '' },
      femGarland: { solve: undefined, children: [], lastParams: '' },
      femNeck: { solve: undefined, children: [], lastParams: '' },
    };
    Object.defineProperty(p, 'solved', { value: solved, enumerable: false });
  }
  let s = p.solved!;

  let ribArcs = JSON.stringify([p.body, p.bouts, p.corners]);
  if (s.ribArcs.lastParams !== ribArcs) {
    s.ribArcs.lastParams = ribArcs;
    clearSolved(s, 'ribArcs');
  }

  let plateContour = JSON.stringify(p.plateContour);
  if (s.plateContour.lastParams !== plateContour) {
    s.plateContour.lastParams = plateContour;
    clearSolved(s, 'plateContour');
  }

  let fluting = JSON.stringify(p.fluting);
  if (s.fluting.lastParams !== fluting) {
    s.fluting.lastParams = fluting;
    clearSolved(s, 'fluting');
  }

  let crossArchingTop = JSON.stringify(p.arching?.top);
  if (s.crossArchingTop.lastParams !== crossArchingTop) {
    s.crossArchingTop.lastParams = crossArchingTop;
    clearSolved(s, 'crossArchingTop');
  }

  let crossArchingBack = JSON.stringify(p.arching?.back);
  if (s.crossArchingBack.lastParams !== crossArchingBack) {
    s.crossArchingBack.lastParams = crossArchingBack;
    clearSolved(s, 'crossArchingBack');
  }

  let gr = p.graduation;
  let graduation = JSON.stringify([p.fHoles, p.fHoleContours, p.mould, gr?.lining, gr?.edgeInset, gr?.blockMargin]);
  if (s.graduation.lastParams !== graduation) {
    s.graduation.lastParams = graduation;
    clearSolved(s, 'graduation');
  }

  // the lands and the bands read no params of their own: only a parent clears them

  let thicknessFieldTop = JSON.stringify([gr?.fHoleThickness, gr?.top.points.map(pt => [pt.x, pt.y, pt.thickness])]);
  if (s.thicknessFieldTop.lastParams !== thicknessFieldTop) {
    s.thicknessFieldTop.lastParams = thicknessFieldTop;
    clearSolved(s, 'thicknessFieldTop');
  }

  let thicknessFieldBack = JSON.stringify([gr?.fHoleThickness, gr?.back.points.map(pt => [pt.x, pt.y, pt.thickness])]);
  if (s.thicknessFieldBack.lastParams !== thicknessFieldBack) {
    s.thicknessFieldBack.lastParams = thicknessFieldBack;
    clearSolved(s, 'thicknessFieldBack');
  }

  // where the bar stands; its depths move the underside, not where it meets the top
  let bb = p.bassBar;
  let bassBarContact = JSON.stringify([bb?.length, bb?.width, bb?.xOffset, bb?.angle]);
  if (s.bassBarContact.lastParams !== bassBarContact) {
    s.bassBarContact.lastParams = bassBarContact;
    clearSolved(s, 'bassBarContact');
  }

  let femMesh = JSON.stringify(p.bassBar);
  if (s.femMesh.lastParams !== femMesh) {
    s.femMesh.lastParams = femMesh;
    clearSolved(s, 'femMesh');
  }

  let femGarland = JSON.stringify([p.arching?.ribHeightLower, p.arching?.ribHeightUpper, gr?.liningHeight]);
  if (s.femGarland.lastParams !== femGarland) {
    s.femGarland.lastParams = femGarland;
    clearSolved(s, 'femGarland');
  }

  let femNeck = JSON.stringify([p.body, p.arching, p.plateContour, p.neck, p.scroll, p.stringSetup]);
  if (s.femNeck.lastParams !== femNeck) {
    s.femNeck.lastParams = femNeck;
    clearSolved(s, 'femNeck');
  }
}

function clearSolved(s: ViolinFamilySolved, name: keyof ViolinFamilySolved): void {
  s[name].solve = undefined;
  for (let child of s[name].children) clearSolved(s, child);
}
