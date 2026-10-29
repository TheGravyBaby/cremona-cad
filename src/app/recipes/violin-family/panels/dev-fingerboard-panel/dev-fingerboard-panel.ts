import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dist, moveInVectorSpace, pointAtDistanceToward } from '../../../../helpers/math/simpleGeometry';
import { pathFromCircle } from '../../../../helpers/math/pathMath';
import { intersectionFromTwoPaths } from '../../../../helpers/math/pathVibes';
import { renderFilledPath, renderPointHalo, renderSolveFailures } from '../../../../helpers/renderFuncs';
import { reportFailures, safeRun, solveSection, SolveFailure } from '../../../../helpers/validators';
import { readWorkingState, writeWorkingState } from '../../../../helpers/workingStorage';
import { Circle, Pt, Vect2D } from '../../../../models/types';
import { NumberStepperDirective } from '../../../../shared/number-stepper';
import { PanelPalette, ThemeService } from '../../../../theme/theme.service';
import { RenderLayer, StringSetupSolve, ViolinFamilyPanel, ViolinFamilyParams, ViolinFamilyToggleKey, ViolinFamilyViewFlags } from '../../violin-family-types';
import { familyStandards, FamilyStandards } from '../../violin-family-seed';
import { neckHalfWidthAt } from '../neck-panel/neck-panel';
import {
  fingerboardInPlan, renderFretTicks, renderStringSetupViews, semitoneStop, solveStringSetup, StringSetupHighlightKey,
} from '../string-setup-panel/string-setup-panel';

// The fingerboard, tried out on localhost only and carried without promise of support. It draws over
// the string setup. The scoop and the double radius are the board's own, kept on p.stringSetup and
// solved there; the panel only gives them fields. The position marks are kept off the file: their
// settings live in the tab's working state, and their solve and renders live here.

// inlaid position marks on the board's face: dots at chosen equal-tempered semitones above the open
// string. Every string shares the nut and the bridge, so an interval sits at one station across the
// board. `offset` is the dot's centre off the board's centreline as read at the nut, -x the bass edge
// as the player sees it with the scroll up; down the board the dot keeps that share of the widening
// half width. Past the edge it may hang over, inlaid as the part that lands on the board
export interface PositionMarksSettings {
  semitones: number[];
  diameter: number;
  offset: number;
}

// one position mark: how far down the string it sounds, its station on the fingerboard plane in the
// side elevation, and its dots in plan (x across the board, y along it)
export interface PositionMarkSolve {
  semitone: number;
  alongString: number;
  station: Pt;
  dots: Circle[];
}

export type PositionMarksFailure = SolveFailure<'marks'>;

export interface PositionMarksSolve {
  // the marks that land on the board, in semitone order
  marks: PositionMarkSolve[];
  failures: PositionMarksFailure[];
}

const STATE_KEY = 'violinFamilyDevFingerboard';

// a dot's size and its offset toward the bass on the bigger instruments, where the player looks
// down the other side of the board
const MARK_DEFAULTS: Record<FamilyStandards['family'], Omit<PositionMarksSettings, 'semitones'>> = {
  violin: { diameter: 2, offset: 9 },
  viola: { diameter: 2.5, offset: 9 },
  cello: { diameter: 3, offset: -10.5 },
  bass: { diameter: 4, offset: -14 },
};

export function defaultPositionMarks(p: ViolinFamilyParams): PositionMarksSettings {
  return { semitones: [5, 7, 12], ...MARK_DEFAULTS[familyStandards(p.body.height).family] };
}

type DevFingerboardHighlightKey = StringSetupHighlightKey | 'marks';

@Component({
  selector: 'app-vf-dev-fingerboard-panel',
  imports: [FormsModule, NumberStepperDirective],
  templateUrl: './dev-fingerboard-panel.html',
  styleUrls: ['../../../../sidebar.css', '../../violin-family.css'],
})
export class DevFingerboardPanel implements ViolinFamilyPanel, OnInit {
  static readonly renderToggles: readonly ViolinFamilyToggleKey[] = ['showFingerboard', 'showFretMarks', 'showScoopGuide'];
  protected readonly pal = ThemeService.getPalette('varnish');

  @Input({ required: true }) params!: ViolinFamilyParams;
  @Input({ required: true }) flags!: ViolinFamilyViewFlags;
  @Output() drawn = new EventEmitter<RenderLayer[]>();
  @Output() edit = new EventEmitter<void>();

  marks!: PositionMarksSettings;
  s!: StringSetupSolve;
  m!: PositionMarksSolve;
  highlighted: { key: DevFingerboardHighlightKey; color: string } | null = null;
  // the semitones as typed, so a half-typed list isn't reformatted under the cursor
  semitonesText = '';

  ngOnInit(): void {
    this.marks = readMarks() ?? defaultPositionMarks(this.params);
    this.semitonesText = this.marks.semitones.join(', ');
    this.draw();
  }

  // a field on the board, so it goes into the file and the undo history
  edited(): void {
    this.edit.emit();
    this.draw();
  }

  // the panel's own settings, kept for the tab alone
  stateEdited(): void {
    writeWorkingState(STATE_KEY, JSON.stringify(this.marks));
    this.draw();
  }

  semitonesEdited(text: string): void {
    this.semitonesText = text;
    this.marks.semitones = parseSemitones(text);
    this.stateEdited();
  }

  report(): void {
    reportFailures([...this.s.failures, ...this.m.failures], 'Dev Fingerboard');
  }

  focus(key: DevFingerboardHighlightKey, color: string): void {
    this.highlighted = { key, color };
    this.draw();
  }

  blur(): void {
    this.highlighted = null;
    this.draw();
  }

  draw(): void {
    safeRun(() => {
      let p = this.params;
      let s = this.s = solveStringSetup(p)!;
      let front: RenderLayer[] = [], side: RenderLayer[] = [];
      let m = this.m = solvePositionMarks(p, s, this.marks);
      let halo = this.highlighted?.key === 'marks' ? this.highlighted.color : null;
      if (this.flags.showFingerboard) front.push(renderPositionMarks(p, s, m, this.pal, halo));
      if (this.flags.showFretMarks) side.push(renderFretTicks(s, this.marks.semitones, this.pal));
      side.push(renderSolveFailures(m.failures, this.pal.alert));
      let highlighted = this.highlighted?.key === 'marks' ? null : this.highlighted as { key: StringSetupHighlightKey; color: string } | null;
      this.drawn.emit(renderStringSetupViews(p, s, this.pal, {
        fingerboard: this.flags.showFingerboard,
        scoopGuide: this.flags.showScoopGuide,
        highlighted, front, side,
      }));
    });
  }
}

function readMarks(): PositionMarksSettings | null {
  try {
    let parsed = JSON.parse(readWorkingState(STATE_KEY) ?? 'null');
    return parsed && Array.isArray(parsed.semitones) ? parsed : null;
  } catch {
    return null;
  }
}

const MARK_HALO_RADIUS = 3;

export function parseSemitones(text: string): number[] {
  return text.split(/[\s,;]+/).filter(Boolean).map(Number);
}

// the dots in the front view, each the part of it that lands on the board
const renderPositionMarks = (p: ViolinFamilyParams, s: StringSetupSolve, m: PositionMarksSolve, pal: PanelPalette, halo: string | null): RenderLayer => {
  let board = fingerboardInPlan(p, s);
  let dots = board ? m.marks.flatMap(mark => mark.dots).map(dot => ({ dot, inlay: intersectionFromTwoPaths(pathFromCircle(dot), board!) })) : [];
  return (g: any, ui: any): void => {
    for (let { dot, inlay } of dots) {
      renderFilledPath(inlay, pal.ink(3), 1, 'nonzero')(g, ui);
      if (halo) renderPointHalo(dot, halo, dot.r + MARK_HALO_RADIUS)(g, ui);
    }
  };
};

// each interval stops the string a share of its length down from the nut; that point drops square
// onto the fingerboard plane for its station, and the dot sits across the board there, its offset
// scaled by the board's width. A mark past the board's end is left out and said so, the rest drawn
export function solvePositionMarks(p: ViolinFamilyParams, s: StringSetupSolve, m: PositionMarksSettings): PositionMarksSolve {
  let out: PositionMarksSolve = { marks: [], failures: [] };
  let fail = (message: string, unsolved: PositionMarksFailure['unsolved']): PositionMarksFailure => ({ message, unsolved, circles: [], segments: [], points: [] });
  let neckTop = s.neck.neckTop;
  solveSection(out.failures, 'Position Marks', ['marks'], () => {
    if (!neckTop || !s.nutTop || !s.bridgeTop || !s.fingerboardEnd) return fail('Position marks: the nut, the bridge and the board have to solve first; they\'re laid out between them.', ['marks']);
    if (!m.semitones.every(n => Number.isInteger(n) && n > 0)) return fail('Position marks: each interval is a whole number of semitones above the open string, 1 or more.', ['marks']);
    if (!(m.diameter > 0)) return fail('Position marks: the diameter needs a value above 0.', ['marks']);
    // a dot may hang over the edge, inlaid as the part that lands on the board, but has to reach it
    let halfAtNut = neckHalfWidthAt(p, s.neck, neckTop.y);
    if (!Number.isFinite(m.offset) || Math.abs(m.offset) - m.diameter / 2 >= halfAtNut) {
      return fail(`Position marks: the dot has to reach the board, which is ${(2 * halfAtNut).toFixed(1)} mm wide at the nut.`, ['marks']);
    }
    let stringLength = dist(s.nutTop, s.bridgeTop);
    let boardLength = dist(neckTop, s.fingerboardEnd);
    let board: Vect2D = { a: (s.fingerboardEnd.x - neckTop.x) / boardLength, b: (s.fingerboardEnd.y - neckTop.y) / boardLength, mag: 1 };
    let past: number[] = [];
    for (let semitone of [...new Set(m.semitones)].sort((a, b) => a - b)) {
      let alongString = semitoneStop(semitone, stringLength);
      let onString = pointAtDistanceToward(s.nutTop, s.bridgeTop, alongString);
      let alongBoard = (onString.x - neckTop.x) * board.a + (onString.y - neckTop.y) * board.b;
      if (alongBoard > boardLength) { past.push(semitone); continue; }
      let station = moveInVectorSpace(neckTop, [{ ...board, mag: alongBoard }]);
      // the share of the board scales with its width; an overhang past the edge is carried as is
      let half = neckHalfWidthAt(p, s.neck, station.y);
      let x = Math.sign(m.offset) * (Math.min(Math.abs(m.offset), halfAtNut) * half / halfAtNut + Math.max(0, Math.abs(m.offset) - halfAtNut));
      out.marks.push({ semitone, alongString, station, dots: [new Circle(x, station.y, m.diameter / 2)] });
    }
    if (past.length) return fail(`Position marks: semitone${past.length > 1 ? 's' : ''} ${past.join(', ')} fall${past.length > 1 ? '' : 's'} past the board's end.`, []);
    return null;
  });
  return out;
}
