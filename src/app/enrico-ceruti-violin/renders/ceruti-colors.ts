import { Theme } from '../../theme/palette';
import { CerutiColors } from '../ceruti-types';

// where the violin meets the palette: each part names the ink it draws in and how far up or down
// that ink's ramp it sits. Tone tells sibling arcs apart (the f-hole's dark, mid and light; the
// scroll's deep and light down its arcs); a part another panel owns draws in the trace grey, not
// a dimmed version of its own colour
export function cerutiColors({ inks: [warm, green, blue, violet, ivory], neutral, alert }: Theme): CerutiColors {
  const backStations = { duckTail: -0.6, foot: 0.75, backHip: -0.2, poll: 0.5, crown: -0.4 };
  const turnStations = { turn1Bottom: -0.5, turn2Top: 0.6, turn2Bottom: -0.1, eye: 0.85 };
  const station = (ink: typeof blue, t: number) => ink.lightness(t).css;
  return {
    upperBout: green.css,
    upperBoutSide: green.lightness(0.45).css,
    centerBoutUp: warm.css,
    centerBout: warm.saturation(-0.5).lightness(-0.2).css,
    centerBoutLow: warm.lightness(0.5).css,
    lowerBout: blue.css,
    lowerBoutSide: blue.lightness(0.45).css,
    violNeck: green.saturation(0.4).lightness(-0.25).css,
    trace: neutral.css,
    fluting: green.lightness(-0.15).css,
    archTop: warm.css,
    archBack: blue.css,
    fHoleUpperDark: green.lightness(-0.6).css,
    fHoleUpper: green.css,
    fHoleUpperLight: green.lightness(0.6).css,
    fHoleLowerDark: violet.lightness(-0.5).css,
    fHoleLower: violet.css,
    fHoleLowerLight: violet.lightness(0.6).css,
    fHoleStem: neutral.lightness(0.15).css,
    // the cut is the only warm thing in the f-hole drawing, and the only straight line the maker
    // actually cuts; everything either side of it is an arc
    fHoleCut: warm.saturation(0.6).lightness(0.15).css,
    guideFaint: neutral.fade(0.5).css,
    guideAccent: alert.saturation(-0.45).lightness(0.15).css,
    pathError: alert.css,
    neck: warm.saturation(-0.25).css,
    neckRoot: warm.saturation(0.5).lightness(-0.1).css,
    neckGround: neutral.lightness(-0.3).css,
    // the scroll's back cool and its front warm, as the plates' archBack and archTop are, each
    // alternating a deep and a light tone down its arcs; no red, which is the solve-failure colour
    scrollBack: blue.lightness(0.2).css,
    scrollBackLight: blue.lightness(0.6).css,
    scrollNape: blue.lightness(-0.3).css,
    scrollFront: warm.saturation(0.4).lightness(0.15).css,
    scrollFrontLight: warm.lightness(0.55).css,
    // the volute's turns past the crown, the same in the back and front views: a green neither the
    // back's blue nor the front's orange, for the panel's own Turns section
    scrollTurns: green.lightness(0.1).css,
    // the scroll widths' points: the front's warm like scrollFront, the back's a walk through the blues
    // from the duck tail to the crown, the turns' greens like scrollTurns, deep and light in turn so
    // neighbours differ in tone
    scrollWidthNut: station(warm, 0.25),
    scrollWidthHip: station(warm, 0.6),
    scrollWidthThroat: station(warm, -0.25),
    scrollWidthDuckTail: station(blue, backStations.duckTail),
    scrollWidthFoot: station(blue, backStations.foot),
    scrollWidthBackHip: station(blue, backStations.backHip),
    scrollWidthPoll: station(blue, backStations.poll),
    scrollWidthCrown: station(blue, backStations.crown),
    scrollWidthTurn1Bottom: station(green, turnStations.turn1Bottom),
    scrollWidthTurn2Top: station(green, turnStations.turn2Top),
    scrollWidthTurn2Bottom: station(green, turnStations.turn2Bottom),
    scrollWidthEye: station(green, turnStations.eye),
    // the spiral a turn at a time from the eye out, its arcs alternating ivory and tan, far enough
    // apart to follow one arc round in the four point's fields
    voluteTurn1: ivory.lightness(0.8).css,
    voluteTurn1Alt: ivory.lightness(-0.5).css,
    voluteTurn2: ivory.lightness(0.55).css,
    voluteTurn2Alt: ivory.lightness(-0.6).css,
    voluteTurn3: ivory.lightness(0.3).css,
    voluteTurn3Alt: ivory.lightness(-0.7).css,
    voluteEye: ivory.lightness(-0.4).css,
    fingerboard: violet.lightness(0.15).css,
    nut: violet.lightness(-0.3).css,
    bridge: ivory.lightness(0.5).css,
    fretMark: green.saturation(0.3).css,
    fretFourth: warm.lightness(-0.1).css,
    fretFifth: alert.saturation(-0.3).css,
    fretOctave: blue.css,
  };
}
