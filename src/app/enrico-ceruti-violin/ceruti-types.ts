import { Arc, Circle, ReferenceImage, Pt, Rectangle, Vect2D } from "../models/types";

export interface EnricoCerutiParams {
  height: number;
  width: number;
  overhang: number;
  rib: number;
  bitDiameter: number;
  purflingOffset: number | null;
  purflingChannelDepth: number | null;
  innerFlutingDepth: number | null;
  outerFlutingDepth: number | null;
  button: ButtonParams | null,
  bouts: {
    UBW: number | null;
    U0: Arc | null;
    U1: Arc | null;
    U2: Arc | null;
    U3: Arc | null;
    U31: Arc | null;
    U4?: Arc | null;
    CBW: number | null;
    C2: Arc | null;
    C21?: Arc | null;
    C0: Arc | null;
    C1: Arc | null;
    C11: Arc | null;
    LBW: number | null;
    L4?: Arc | null;
    L3: Arc | null;
    L31: Arc | null;
    L2: Arc | null;
    L1: Arc | null;
    L0: Arc | null;
    UCr: Pt | null;
    LCr: Pt | null;
  },
  outerCorners: {
    U3 : Arc | null,
    U31: Arc | null,
    C2: Arc | null,
    C21: Arc | null,
    C1: Arc | null,
    C11: Arc | null,
    L3: Arc | null,
    L31: Arc | null
  },
  blocks: {
    U: Rectangle | null;
    CU: Rectangle | null;
    CUPad: number | null;
    CL: Rectangle | null;
    CLPad: number | null;
    L: Rectangle | null;
  },
  viol: {
    width: number | null;
    V0: Arc | null;
    neckRadius?: number | null;
  },
  options: {
    useViolNeck: boolean,
    useViolCornerUC: boolean,
    useViolCornerLC: boolean,
    useKellyC0: boolean // four circles based theory of clean intersection along center bout,
    U31DoubleArc: boolean;
    C21DoubleArc: boolean;
    C11DoubleArc: boolean;
    L31DoubleArc: boolean;
    U21DoubleArc?: boolean;
    L21DoubleArc?: boolean;
    stemArcsIndependent?: boolean;
    ucCornerSharpness?: number;
    lcCornerSharpness?: number;
  },
  ratios: {
    HtoW: number;
    UBtoLB: number;
    U0toUBW: number;
    U1toUBW: number;
    U2toUBW: number;
    U3toLBW: number;
    U31toLBW: number;
    CBWtoLBW: number;
    C0toLBW: number;
    C0YtoH: number;
    C2toLBW: number;
    C21toLBW: number;
    C1toLBW: number;
    C11toLBW: number;
    LBtoH: number;
    L0toLBW: number;
    L1toLBW: number;
    L2toLBW: number;
    L3toLBW: number;
    L31toLBW: number;
    UCYtoH: number;
    LCYtoH: number;

    FLtoW: number;
    FUtoL: number;
  },
  fHoles?: FholeParams;
  arching?: ArchingParams;
  neck?: NeckParams;
  stringSetup?: StringSetup;
  scroll?: ScrollParams;
}


export interface FholeParams {
  UEye: Circle | null;
  LEye: Circle | null;
  URise: number | null;
  LRise: number | null;
  UCut: FholeCut | null;
  LCut: FholeCut | null;
  /** Derived each pass from the eye + its own cut; not a free field. */
  UTip: Pt | null;
  LTip: Pt | null;

  stem: FholeStem;

  U1: Arc | null;
  U2: Arc | null;
  U21?: Arc | null;
  U3: Arc | null;

  L1: Arc | null;
  L2: Arc | null;
  L21?: Arc | null;
  L3: Arc | null;

  S1: Arc | null;
  S2: Arc | null;
  S3: Arc | null;
  S4: Arc | null;
}

export interface FholeCut {
  angleOnEye: number | null;
  slope: number | null;
  length: number | null;
}

export interface FholeStem {
  center: Pt | null;
  width: number | null;
  angle: number | null;
  arcR: number | null;
}

export interface ButtonParams {
  width: number;
  height: number;
}

export interface ArchingParams {
  surfaceMethod: 'proportional';
  ribHeightLower: number;
  ribHeightUpper: number;
  top: ArchPlate;
  bottom: ArchPlate;
}

export interface ArchSplinePoint {
  t: number; 
  z: number; 
  mirror?: boolean;
}

export interface CrossArchPoint {
  x: number;
  z: number;
  mirror?: boolean;
}

export interface ArchSpline {
  type: 'spline';
  archHeight: number;
  peak?: number;
  points: ArchSplinePoint[]; 
  peakRow?: number;
}

export type ArchCurve =
  | { type: 'catenary'; archHeight: number }
  | { type: 'cycloid'; archHeight: number; d: number }
  | ArchSpline;

export interface FlutingParams {
  sweepRadius: number;
  depth: number;
  sweepRadius_cBout: number | null;
  cornerGouge: boolean;
}

export interface CrossArchSpline {
  type: 'spline';
  points: CrossArchPoint[];
  peak?: number;
  peakRow?: number;
  y?: number;
  stations?: CrossArchSpline[];
}

export interface CrossArchCycloid {
  type: 'cycloid';
  d: number;
  pct: number;
  y?: number;
  stations?: CrossArchCycloid[];
}

export type CrossArchShape = CrossArchSpline | CrossArchCycloid | { type: 'catenary'; y?: never; stations?: never };

export interface ArchPlate {
  arch: ArchCurve;
  thickness: number;
  fluting?: FlutingParams;
  cross?: CrossArchShape;
}

export interface NeckParams {
  mortiseDepth: number;
  overstand: number;
  angle: number;
  length: number;
  thickness: number;
  topWidth: number;
  rootWidth: number;
  heel: Arc; // r is entered, the rest derived

  root: Pt | null; // derived
  neckTop: Pt | null; // derived
  backRoot: Pt | null; // derived
  backNut: Pt | null; // derived
}

export interface StringSetup {
  bodyStop: number;
  bridgeHeight: number;
  nutThickness: number;
  nutHeight: number; // along the neck, up to where the pegbox's flat starts
  nutWidth: number; // across, which the scroll's path starts at
  fingerboardLength: number;
  fingerboardThickness: number;
  fingerboardRadius: number;

  bridgeFoot: Pt | null; // derived
  bridgeTop: Pt | null; // derived
  nutTop: Pt | null; // derived
}

export type VoluteStyle = 'fourPoint' | 'archimedean' | 'serlio' | 'salviati' | 'goldmann' | 'kelly';

// full widths, cheek to cheek. The pegbox tapers straight from the nut's width to `throat`, where F1
// meets the spiral; the volute's run on a curve through the rest, each at a place the side view fixes
export interface ScrollWidths {
  throat: number;
  crown: number;
  turn1Bottom: number;
  turn2Top: number;
  turn2Bottom: number;
  turn3Top: number;
  eye: number;
}

export interface ScrollParams {
  style: VoluteStyle;
  eye: Circle;
  flushWithNeck: boolean;
  pitch: number; // archemedean spiral: distance between successive turns (mm)
  seedLength: number; // kelly volute allows for variable seed size relative to the eye
  arcRadii: number[];

  spiral: Arc[] | null;
  S0: Arc;
  S1: Arc;
  S2: Arc;
  S3: Arc;
  nape: Arc;
  backStraight: number;

  F0: Arc;
  F1: Arc;
  flat: number;
  frontStraight: number;

  widths: ScrollWidths;
  pegboxWall: number; // each cheek, at the pegbox's front edge
  pegboxFloor: number; // the wood left between the hollow and the back
  pegboxStraight: number; // above the nut's top, as wide as the nut, before the taper to the throat starts
}

/** Resolved palette from CerutiViolin's `colors` getter, threaded into every panel and render fn. */
export interface CerutiColors {
  upperBout: string;
  upperBoutOff: string;
  upperBoutOff2: string;
  centerBoutUp: string;
  centerBoutUpOff: string;
  centerBoutUpOff2: string;
  centerBout: string;
  centerBoutOff: string;
  centerBoutOff2: string;
  centerBoutLow: string;
  centerBoutLowOff: string;
  centerBoutLowOff2: string;
  lowerBout: string;
  lowerBoutOff: string;
  lowerBoutOff2: string;
  violNeck: string;
  innerTrace: string;
  outerTrace: string;
  mouldTrace: string;
  fluting: string;
  archTop: string;
  archBack: string;
  fHoleUpperDark: string;
  fHoleUpper: string;
  fHoleUpperMuted: string;
  fHoleUpperLight: string;
  fHoleLowerDark: string;
  fHoleLower: string;
  fHoleLowerMuted: string;
  fHoleLowerLight: string;
  fHoleStem: string;
  fHoleStemOff: string;
  fHoleCut: string;
  pathError: string;
  neck: string;
  neckOff: string;
  scrollBack: string;
  scrollBackLight: string;
  scrollNape: string;
  scrollFront: string;
  scrollFrontLight: string;
  scrollPathStart: string;
  scrollPathMid: string;
  scrollPathEnd: string;
  voluteTurn1: string;
  voluteTurn1Alt: string;
  voluteTurn2: string;
  voluteTurn2Alt: string;
  voluteTurn3: string;
  voluteTurn3Alt: string;
  neckRoot: string;
  fingerboard: string;
  nut: string;
  bridge: string;
}

export type PlateViewMode = 'none' | 'contours' | 'wireframe';

export interface CerutiViewFlags {
  showModuleArcs: boolean;
  showModuleCircles: boolean;
  showAllArcs: boolean;
  showAllCircles: boolean;
  showModuleGuides: boolean;
  showFingerboard: boolean;
  showFretMarks: boolean;
  showFholeBounds: boolean;
  showFholeArcs: boolean;
  showFholePlacementGuides: boolean;
  showVoluteConstruction: boolean;
  renderOuterPath: boolean;
  showBlocks: boolean;
  showInnerPath: boolean;
  simpleClampBox: boolean;
  crossSectionY: number | null;
  topPlateView: PlateViewMode;
  backPlateView: PlateViewMode;
  plateRotXDeg: number;
  plateRotYDeg: number;
  plateRotZDeg: number;
}

export type RenderToggleKey = 'showModuleArcs' | 'showAllArcs' | 'showModuleCircles'
  | 'showAllCircles' | 'showModuleGuides' | 'showFingerboard' | 'showFretMarks' | 'showFholeBounds' | 'showFholeArcs' | 'showFholePlacementGuides'
  | 'showVoluteConstruction' | 'showBlocks' | 'showInnerPath' | 'renderOuterPath';

export const DEFAULT_CERUTI_VIEW_FLAGS: CerutiViewFlags = {
  showModuleArcs: true,
  showModuleCircles: false,
  showAllArcs: false,
  showAllCircles: false,
  showModuleGuides: false,
  showFingerboard: true,
  showFretMarks: false,
  showFholeBounds: true,
  showFholeArcs: false,
  showFholePlacementGuides: false,
  showVoluteConstruction: true,
  renderOuterPath: true,
  showBlocks: true,
  showInnerPath: false,
  simpleClampBox: false,
  crossSectionY: null,
  topPlateView: 'none',
  backPlateView: 'none',
  plateRotXDeg: -30,
  plateRotYDeg: -10,
  plateRotZDeg: 0,
};

export interface PanelRenderRequest {
  immediate?: boolean;
  coalesce?: boolean;
  refreshEnabledPanels?: boolean;
  persistSession?: boolean;
  run: () => Array<(g: any, ui: any) => void>;
}


export type PathKey = 'inner' | 'top' | 'back' | 'purfling' | 'outerPurfling' | 'fHole' | 'neck';

export interface PathEntry {
  key: PathKey;
  path: string;
}

export const CERUTI_PANEL_IDS = [
  'base', 'mainBouts', 'corners', 'centerBout', 'outerTrace',
  'fluting', 'longArching', 'crossArching', 'fHolePlacement', 'fHoleContours', 'neck', 'volute', 'scroll', 'scrollWidths', 'mould', 'export',
] as const;

export type CerutiPanelId = typeof CERUTI_PANEL_IDS[number];

export const RECIPE_SCHEMA_VERSION = '1';

export interface TemplateMeta {
  maker: string;
  /** named as the record names it — 'Violin "Ole Bull"', 'Viola'. */
  instrument: string;
  /** as published: '1669', 'c.1730', '1610-20' — a string, not a year, since most are ranges. */
  date: string;
  record: {
    /** The institution's own object id — Met 898377, SI nmah_833906, LoC ihas.200154811. */
    objectId: string;
    url: string;
  };
  notes?: string;
}

export interface EnricoCerutiTemplate {
  key: string;
  label: string;
  recipeName: string;
  fileName: string;
  version: string;
  description?: string;
  meta?: TemplateMeta;
  params: EnricoCerutiParams;
  paths: PathEntry[];
  referenceImages?: ReferenceImage[];
}

export const DefaultParams: EnricoCerutiParams = {
  height: 350,
  width: 200,
  overhang: 3,
  rib: 1,
  bitDiameter: 6.35,
  purflingOffset: null,
  purflingChannelDepth: null,
  innerFlutingDepth: null,
  outerFlutingDepth: null,
  ratios: {
    HtoW: 7 / 4,

    UBtoLB: 4 / 5,
    U0toUBW: 5 / 8,
    U1toUBW: 1 / 3,
    U2toUBW: 1 / 2,
    U3toLBW: 1 / 8,
    U31toLBW: 1 / 16,

    CBWtoLBW: 1 / 2,
    C0YtoH: 9 / 16,
    C0toLBW: 4/9,
    C2toLBW: 1 / 12,
    C21toLBW: 1 / 16,
    C1toLBW: 1 / 8,
    C11toLBW: 1 / 16,

    LBtoH: 4 / 7,
    L0toLBW: 7 / 8,
    L1toLBW: 1 / 3,
    L2toLBW: 1 / 2,
    L3toLBW: 1 / 8,
    L31toLBW: 1 / 16,

    UCYtoH: 2 / 3,
    LCYtoH: 6 / 15,

    FLtoW: 1/50,
    FUtoL: 3/4,
  },
  bouts: {
    UBW: undefined,
    U0: undefined,
    U1: undefined,
    U2: undefined,
    U3: undefined,
    U31: undefined,
    U4: undefined,
    CBW: undefined,
    C2: undefined,
    C21: undefined,
    C0: undefined,
    C1: undefined,
    C11: undefined,
    LBW: undefined,
    L4: undefined,
    L3: undefined,
    L31: undefined,
    L2: undefined,
    L1: undefined,
    L0: undefined,
    UCr: undefined,
    LCr: undefined,
  },
  viol: {
    width: null,
    V0: null,
    neckRadius: null
  },
  button: null,
  outerCorners: {
    U3: null,
    U31: null,
    C2: null,
    C21: null,
    C1: null,
    C11: null,
    L3: null,
    L31: null
  },
  blocks: {
    U: undefined,
    CU: undefined,
    CUPad: undefined,
    CL: undefined,
    CLPad: undefined,
    L: undefined,
  },
  options: {
    useViolNeck: false,
    useViolCornerUC: false,
    useViolCornerLC: false,
    useKellyC0: false,
    U31DoubleArc: false,
    C21DoubleArc: false,
    C11DoubleArc: false,
    L31DoubleArc: false,
    U21DoubleArc: false,
    L21DoubleArc: false,
    stemArcsIndependent: false,
    ucCornerSharpness: 0,
    lcCornerSharpness: 0,
  }
}
