import { Circle, Pt, Rectangle, ReferenceImage } from '../models/types';

export interface KellyParams {
	height: number;
	width: number;
	inset: number;
	bitDiameter: number;
	boutUpR: number;
	boutUpY: number;
	boutLowR: number;
	boutLowY: number;
	boutCenR: number;
	vesaciUpR: number;
	joinArcUpR: number | null;
	vesaciLowR: number;
	joinArcLowR: number | null;
	violNeckR: number | null;
	violNeckH: number | null;
	violNeckW: number | null;
	cornerR: number;
	cornerGuideLowY: number;
	cornerGuideLowXOff: number;
	cornerGuideUpY: number;
	cornerGuideUpXOff: number;
	cornerCircUpBoutR: number;
	cornerCircUpCBoutR: number;
	cornerCircLowCBoutR: number;
	cornerCircLowBoutR: number;
	blockCornerUpH: number;
	blockCornerUpW: number;
	blockCornerUpPad: number;
	blockCornerLowH: number;
	blockCornerLowW: number;
	blockCornerLowPad: number;
	blockLowH: number;
	blowLowW: number;
	blockUpH: number;
	blockUpW: number;
	clampChannelWidth: number;
	cornerCircDubLowCBoutR: number;
	cornerCircDubLowCBoutTheta: number;
	cornerCircDubLowBoutR: number;
	cornerCircDubLowBoutTheta: number;
	cornerCircleDubLowCBoutTheta: number;
	cornerCircleDubLowBoutTheta: number;
	cornerCircDubUpBoutR: number;
	cornerCircDubUpBoutTheta: number;
	cornerCircDubUpCBoutR: number;
	cornerCircDubUpCBoutTheta: number;
	cornerCircDubUpBoutCutoffTheta: number;
	cornerCircleDubUpCBoutCutoffTheta: number;
}

export type KellyParamOverrides = Partial<KellyParams>;

export interface KellyOptions {
	lockUpperJoinArc: boolean;
	lockLowerJoinArc: boolean;
	useViolNeck: boolean;
}

export interface KellyRatios {
	boutUpYToUBR: number;
	boutLowYToLBR: number;
	vesicaLowRToLBR: number;
	boutUpToLBR: number;
	boutCToLBR: number;
	vesicaUpRToUBR: number;
	cornerRToCBR: number;
	cornerCircUpBoutRToLBR: number;
	cornerCircUpCBoutRToLBR: number;
	cornerCircLowCBoutRToLBR: number;
	cornerCircLowBoutRToLBR: number;
	cornerCircDubUpBoutRRatio: number;
	cornerCircDubUpCBoutRRatio: number;
	cornerCircDubLowCboutRRatio: number;
	cornerCircDubLowBoutRRatio: number;
	topTraceUpperBoutTheta: number;
	topTraceUpperCBoutTheta: number;
	topTraceLowerCBoutTheta: number;
	topTraceLowerBoutTheta: number;
	topTraceUpperBoutCutoffTheta: number;
	topTraceUpperCBoutCutoffTheta: number;
	topTraceLowerCBoutCutoffTheta: number;
	topTraceLowerBoutCutoffTheta: number;
}

export interface KellyShapes {
	upperBout: Circle | null;
	lowerBout: Circle | null;
	centerBoutLeft: Circle | null;
	centerBoutRight: Circle | null;
	lowerRightVesaci: Circle | null;
	lowerLeftVesaci: Circle | null;
	upperRightVesaci: Circle | null;
	upperLeftVesaci: Circle | null;
	upperJoiningCircle: Circle | null;
	lowerJoiningCircle: Circle | null;
	lowerLeftCornerC1: Circle | null;
	lowerLeftCornerC2: Circle | null;
	lowerRightCornerC1: Circle | null;
	lowerRightCornerC2: Circle | null;
	upperLeftCornerC1: Circle | null;
	upperLeftCornerC2: Circle | null;
	upperRightCornerC1: Circle | null;
	upperRightCornerC2: Circle | null;
	lowerLeftBlock: Rectangle | null;
	lowerRightBlock: Rectangle | null;
	upperRightBlock: Rectangle | null;
	upperLeftBlock: Rectangle | null;
	lowerBlock: Rectangle | null;
	upperBlock: Rectangle | null;
	upperClampCutout: Rectangle | null;
	lowerClampCutout: Rectangle | null;
	leftClampCutout: Rectangle | null;
	rightClampCutout: Rectangle | null;
	lowerRightC1Offset: Circle | null;
	lowerRightC2Offset: Circle | null;
	lowerRightCornerDoubleC1: Circle | null;
	lowerRightCornerDoubleC2: Circle | null;
	lowerLeftC1Offset: Circle | null;
	lowerLeftC2Offset: Circle | null;
	lowerLeftCornerDoubleC1: Circle | null;
	lowerLeftCornerDoubleC2: Circle | null;
	upperRightC1Offset: Circle | null;
	upperRightC2Offset: Circle | null;
	upperRightCornerDoubleC1: Circle | null;
	upperRightCornerDoubleC2: Circle | null;
	upperLeftC1Offset: Circle | null;
	upperLeftC2Offset: Circle | null;
	upperLeftCornerDoubleC1: Circle | null;
	upperLeftCornerDoubleC2: Circle | null;
	lowerRightCutoff1: Pt | null;
	lowerRightCutoff2: Pt | null;
	lowerLeftCutoff1: Pt | null;
	lowerLeftCutoff2: Pt | null;
	upperRightCutoff1: Pt | null;
	upperRightCutoff2: Pt | null;
	upperLeftCutoff1: Pt | null;
	upperLeftCutoff2: Pt | null;
	violLeftNeckCircle?: Circle | null;
	violRightNeckCircle?: Circle | null;
}

export interface KellyMajorBoutIntersects {
	upperRight: Pt;
	upperLeft: Pt;
	lowerRight: Pt;
	lowerLeft: Pt;
}

export interface KellyMinorBoutIntersects {
	lowerRightVesicaUpper: Pt;
	lowerRightVesicaLower: Pt;
	lowerLeftVesicaUpper: Pt;
	lowerLeftVesicaLower: Pt;
	upperRightVesicaUpper: Pt;
	upperRightVesicaLower: Pt;
	upperLeftVesicaUpper: Pt;
	upperLeftVesicaLower: Pt;
	violNeckTopLeft?: Pt;
	violNeckTopRight?: Pt;
	violNeckBodyLeft?: Pt;
	violNeckBodyRight?: Pt;
}

export interface KellyCornerIntersects {
	lowerRight: Pt | null;
	lowerLeft: Pt | null;
	upperRight: Pt | null;
	upperLeft: Pt | null;
	lowerLeftCornerTopBodyIntersection: Pt | null;
	lowerLeftCornerBottomBodyIntersection: Pt | null;
	lowerRightCornerTopBodyIntersection: Pt | null;
	lowerRightCornerBottomBodyIntersection: Pt | null;
	upperLeftCornerTopBodyIntersection: Pt | null;
	upperLeftCornerBottomBodyIntersection: Pt | null;
	upperRightCornerTopBodyIntersection: Pt | null;
	upperRightCornerBottomBodyIntersection: Pt | null;
}

export interface KellyBlockIntersects {
	lowerLeftBlockP1: Pt;
	lowerLeftBlockP2: Pt;
	lowerLeftBlockP3: Pt;
	lowerRightBlockP1: Pt;
	lowerRightBlockP2: Pt;
	lowerRightBlockP3: Pt;
	upperRightBlockP1: Pt;
	upperRightBlockP2: Pt;
	upperRightBlockP3: Pt;
	upperLeftBlockP1: Pt;
	upperLeftBlockP2: Pt;
	upperLeftBlockP3: Pt;
}

export interface KellyIntersects {
	majorBouts: KellyMajorBoutIntersects;
	minorBouts: KellyMinorBoutIntersects;
	corners: KellyCornerIntersects;
	blocks: KellyBlockIntersects;
}


export interface KellyCalcEntry {
	name: string;
	paths: string[];
}

// =============================================================================
// Top-level data interface
// =============================================================================

export interface KellyViolinData {
	recipeName: string;
	fileName: string;
	description?: string;
	version: string;
	params: KellyParams;
	shapes: KellyShapes;
	intersects: KellyIntersects;
	paths: KellyCalcEntry[];
	ratios: KellyRatios;
	options: KellyOptions;
	referenceImage?: ReferenceImage;
}

// =============================================================================
// Default constants
// =============================================================================

export const DelGesu_Baltic_Params: KellyParams = {
	height: 348,
	width: 203,
	inset: 4,
	bitDiameter: 6.35,
	boutUpR: 78,
	boutUpY: 284,
	boutLowR: 97.5,
	boutLowY: 70,
	boutCenR: 85,
	vesaciUpR: 57,
	joinArcUpR: null,
	vesaciLowR: 62,
	joinArcLowR: null,
	violNeckR: null,
	violNeckH: null,
	violNeckW: null,
	cornerR: 74,
	cornerGuideLowY: 51,
	cornerGuideLowXOff: 0,
	cornerGuideUpY: 278,
	cornerGuideUpXOff: 0,
	cornerCircUpBoutR: 24,
	cornerCircUpCBoutR: 20,
	cornerCircLowCBoutR: 20,
	cornerCircLowBoutR: 24,
	blockCornerUpH: 24,
	blockCornerUpW: 20,
	blockCornerUpPad: 8,
	blockCornerLowH: 24,
	blockCornerLowW: 20,
	blockCornerLowPad: 8,
	blockLowH: 20,
	blowLowW: 55,
	blockUpH: 20,
	blockUpW: 40,
	clampChannelWidth: 22,
	cornerCircDubLowCBoutR: 10,
	cornerCircDubLowCBoutTheta: -70,
	cornerCircDubLowBoutR: 10,
	cornerCircDubLowBoutTheta: 165,
	cornerCircleDubLowCBoutTheta: 300,
	cornerCircleDubLowBoutTheta: 135,
	cornerCircDubUpBoutR: 10,
	cornerCircDubUpBoutTheta: 200,
	cornerCircDubUpCBoutR: 10,
	cornerCircDubUpCBoutTheta: 105,
	cornerCircDubUpBoutCutoffTheta: 225,
	cornerCircleDubUpCBoutCutoffTheta: 70
};

export const StradGoetz_Params: KellyParams = {
	height: 362,
	width: 201,
	inset: 4,
	bitDiameter: 6.35,
	boutUpR: 76,
	boutUpY: 293,
	boutLowR: 96.5,
	boutLowY: 76,
	boutCenR: 93,
	vesaciUpR: 64,
	joinArcUpR: 181,
	vesaciLowR: 64,
	joinArcLowR: null,
	violNeckR: null,
	violNeckH: null,
	violNeckW: null,
	cornerR: 79,
	cornerGuideLowY: 76,
	cornerGuideLowXOff: 4,
	cornerGuideUpY: 285,
	cornerGuideUpXOff: -15,
	cornerCircUpBoutR: 26,
	cornerCircUpCBoutR: 16,
	cornerCircLowCBoutR: 21,
	cornerCircLowBoutR: 26,
	blockCornerUpH: 24,
	blockCornerUpW: 20,
	blockCornerUpPad: 8,
	blockCornerLowH: 24,
	blockCornerLowW: 20,
	blockCornerLowPad: 8,
	blockLowH: 20,
	blowLowW: 55,
	blockUpH: 20,
	blockUpW: 40,
	clampChannelWidth: 22,
	cornerCircDubLowCBoutR: 16,
	cornerCircDubLowCBoutTheta: 270,
	cornerCircDubLowBoutR: 20,
	cornerCircDubLowBoutTheta: 180,
	cornerCircleDubLowCBoutTheta: 305,
	cornerCircleDubLowBoutTheta: 145,
	cornerCircDubUpBoutR: 20,
	cornerCircDubUpBoutTheta: 180,
	cornerCircDubUpCBoutR: 16,
	cornerCircDubUpCBoutTheta: 90,
	cornerCircDubUpBoutCutoffTheta: 218,
	cornerCircleDubUpCBoutCutoffTheta: 65,
}

export const montagnana_sugia_params: KellyParams = {
  height: 743,
  width: 438,
  inset: 4,
  bitDiameter: 6.35,
  boutUpR: 176,
  boutUpY: 597,
  boutLowR: 215,
  boutLowY: 159,
  boutCenR: 162,
  vesaciUpR: 139,
  joinArcUpR: null,
  vesaciLowR: 136,
  joinArcLowR: null,
  violNeckR: 58,
  violNeckH: 58,
  violNeckW: 58,
  cornerR: 133,
  cornerGuideLowY: 117,
  cornerGuideLowXOff: 0,
  cornerGuideUpY: 592,
  cornerGuideUpXOff: -30,
  cornerCircUpBoutR: 54,
  cornerCircUpCBoutR: 38,
  cornerCircLowCBoutR: 42,
  cornerCircLowBoutR: 50,
  blockCornerUpH: 40,
  blockCornerUpW: 30,
  blockCornerUpPad: 8,
  blockCornerLowH: 40,
  blockCornerLowW: 30,
  blockCornerLowPad: 8,
  blockLowH: 40,
  blowLowW: 100,
  blockUpH: 40,
  blockUpW: 100,
  clampChannelWidth: 34,
  cornerCircDubLowCBoutR: 31,
  cornerCircDubLowCBoutTheta: 270,
  cornerCircDubLowBoutR: 42,
  cornerCircDubLowBoutTheta: 180,
  cornerCircleDubLowCBoutTheta: 300,
  cornerCircleDubLowBoutTheta: 145,
  cornerCircDubUpBoutR: 42,
  cornerCircDubUpBoutTheta: 180,
  cornerCircDubUpCBoutR: 23,
  cornerCircDubUpCBoutTheta: 90,
  cornerCircDubUpBoutCutoffTheta: 220,
  cornerCircleDubUpCBoutCutoffTheta: 70,
}

export const Maggini_Delmas_Params: KellyParams =
{
	height: 1036,
	width: 592,
	inset: 8,
	bitDiameter: 6.35,
	boutUpR: 208,
	boutUpY: 761,
	boutLowR: 288,
	boutLowY: 195,
	boutCenR: 218,
	vesaciUpR: 159,
	joinArcUpR: 101,
	vesaciLowR: 165,
	joinArcLowR: 514,
	violNeckR: 105,
	violNeckH: 104,
	violNeckW: 74,
	cornerR: 187,
	cornerGuideLowY: 254,
	cornerGuideLowXOff: 9,
	cornerGuideUpY: 761,
	cornerGuideUpXOff: 0,
	cornerCircUpBoutR: 66,
	cornerCircUpCBoutR: 48,
	cornerCircLowCBoutR: 55,
	cornerCircLowBoutR: 70,
	blockCornerUpH: 50,
	blockCornerUpW: 45,
	blockCornerUpPad: 12,
	blockCornerLowH: 50,
	blockCornerLowW: 50,
	blockCornerLowPad: 12,
	blockLowH: 50,
	blowLowW: 100,
	blockUpH: 100,
	blockUpW: 100,
	clampChannelWidth: 40,
	cornerCircDubLowCBoutR: 45,
	cornerCircDubLowCBoutTheta: 225,
	cornerCircDubLowBoutR: 43,
	cornerCircDubLowBoutTheta: 185,
	cornerCircleDubLowCBoutTheta: 290,
	cornerCircleDubLowBoutTheta: 150,
	cornerCircDubUpBoutR: 49,
	cornerCircDubUpBoutTheta: 180,
	cornerCircDubUpCBoutR: 41,
	cornerCircDubUpCBoutTheta: 110,
	cornerCircDubUpBoutCutoffTheta: 220,
	cornerCircleDubUpCBoutCutoffTheta: 80,
}

export const Strad_Davidoff_Params: KellyParams = {
  height: 758,
  width: 437,
  inset: 4,
  bitDiameter: 6.35,
  boutUpR: 172,
  boutUpY: 614,
  boutLowR: 214.5,
  boutLowY: 153,
  boutCenR: 177,
  vesaciUpR: 135,
  joinArcUpR: 288,
  vesaciLowR: 143,
  joinArcLowR: null,
  violNeckR: null,
  violNeckH: null,
  violNeckW: null,
  cornerR: 145,
  cornerGuideLowY: 165,
  cornerGuideLowXOff: 26,
  cornerGuideUpY: 581,
  cornerGuideUpXOff: 0,
  cornerCircUpBoutR: 54,
  cornerCircUpCBoutR: 40,
  cornerCircLowCBoutR: 40,
  cornerCircLowBoutR: 66,
  blockCornerUpH: 30,
  blockCornerUpW: 30,
  blockCornerUpPad: 8,
  blockCornerLowH: 30,
  blockCornerLowW: 30,
  blockCornerLowPad: 8,
  blockLowH: 30,
  blowLowW: 80,
  blockUpH: 30,
  blockUpW: 60,
  clampChannelWidth: 22,
  cornerCircDubLowCBoutR: 24,
  cornerCircDubLowCBoutTheta: 270,
  cornerCircDubLowBoutR: 54,
  cornerCircDubLowBoutTheta: 180,
  cornerCircleDubLowCBoutTheta: 315,
  cornerCircleDubLowBoutTheta: 150,
  cornerCircDubUpBoutR: 51,
  cornerCircDubUpBoutTheta: 180,
  cornerCircDubUpCBoutR: 36,
  cornerCircDubUpCBoutTheta: 110,
  cornerCircDubUpBoutCutoffTheta: 218,
  cornerCircleDubUpCBoutCutoffTheta: 78,
}

export const BLANK_PARAMS: KellyParams = {
	height: 350,
	width: 200,
	inset: 4,
	bitDiameter: 0,
	boutUpR: 0,
	boutUpY: 0,
	boutLowR: 0,
	boutLowY: 0,
	boutCenR: 0,
	vesaciUpR: 0,
	joinArcUpR: null,
	vesaciLowR: 0,
	joinArcLowR: null,
	violNeckR: null,
	violNeckH: null,
	violNeckW: null,
	cornerR: 0,
	cornerGuideLowY: 0,
	cornerGuideLowXOff: 0,
	cornerGuideUpY: 0,
	cornerGuideUpXOff: 0,
	cornerCircUpBoutR: 0,
	cornerCircUpCBoutR: 0,
	cornerCircLowCBoutR: 0,
	cornerCircLowBoutR: 0,
	blockCornerUpH: 24,
	blockCornerUpW: 20,
	blockCornerUpPad: 8,
	blockCornerLowH: 24,
	blockCornerLowW: 20,
	blockCornerLowPad: 8,
	blockLowH: 20,
	blowLowW: 55,
	blockUpH: 20,
	blockUpW: 40,
	clampChannelWidth: 22,
	cornerCircDubLowCBoutR: 0,
	cornerCircDubLowCBoutTheta: 0,
	cornerCircDubLowBoutR: 0,
	cornerCircDubLowBoutTheta: 0,
	cornerCircleDubLowCBoutTheta: 0,
	cornerCircleDubLowBoutTheta: 0,
	cornerCircDubUpBoutR: 0,
	cornerCircDubUpBoutTheta: 0,
	cornerCircDubUpCBoutR: 0,
	cornerCircDubUpCBoutTheta: 0,
	cornerCircDubUpBoutCutoffTheta: 0,
	cornerCircleDubUpCBoutCutoffTheta: 0,
};

const KELLY_DEFAULT_RATIOS: KellyRatios = {
	boutUpYToUBR: 3 / 4,// a bit arbitrary, but usually works
	boutLowYToLBR: 3 / 4,
	boutUpToLBR: 4 / 5,
	boutCToLBR: 4 / 5,
	vesicaUpRToUBR: 2 / 3,
	vesicaLowRToLBR: 2 / 3,
	cornerRToCBR: 5 / 6,
	cornerCircUpBoutRToLBR: 1 / 4,
	cornerCircUpCBoutRToLBR: 1 / 4 * 3 / 4,
	cornerCircLowCBoutRToLBR: 1 / 4 * 3 / 4,
	cornerCircLowBoutRToLBR: 1 / 4,

	cornerCircDubUpBoutRRatio: 3 / 5,
	cornerCircDubUpCBoutRRatio: 3 / 5,
	cornerCircDubLowCboutRRatio: 3 / 5,
	cornerCircDubLowBoutRRatio: 3 / 5,

	topTraceUpperBoutTheta: 180,
	topTraceUpperCBoutTheta: 90,
	topTraceUpperBoutCutoffTheta: 225,
	topTraceUpperCBoutCutoffTheta: 60,

	topTraceLowerCBoutTheta: 270,
	topTraceLowerBoutTheta: 180,
	topTraceLowerCBoutCutoffTheta: 310,
	topTraceLowerBoutCutoffTheta: 145,
};

// =============================================================================
// Factory helpers (private)
// =============================================================================

function createKellyShapes(): KellyShapes {
	return {
		upperBout: null,
		lowerBout: null,
		centerBoutLeft: null,
		centerBoutRight: null,
		lowerRightVesaci: null,
		lowerLeftVesaci: null,
		upperRightVesaci: null,
		upperLeftVesaci: null,
		upperJoiningCircle: null,
		lowerJoiningCircle: null,
		lowerLeftCornerC1: null,
		lowerLeftCornerC2: null,
		lowerRightCornerC1: null,
		lowerRightCornerC2: null,
		upperLeftCornerC1: null,
		upperLeftCornerC2: null,
		upperRightCornerC1: null,
		upperRightCornerC2: null,
		lowerLeftBlock: null,
		lowerRightBlock: null,
		upperRightBlock: null,
		upperLeftBlock: null,
		lowerBlock: null,
		upperBlock: null,
		upperClampCutout: null,
		lowerClampCutout: null,
		leftClampCutout: null,
		rightClampCutout: null,
		lowerRightC1Offset: null,
		lowerRightC2Offset: null,
		lowerRightCornerDoubleC1: null,
		lowerRightCornerDoubleC2: null,
		lowerLeftC1Offset: null,
		lowerLeftC2Offset: null,
		lowerLeftCornerDoubleC1: null,
		lowerLeftCornerDoubleC2: null,
		upperRightC1Offset: null,
		upperRightC2Offset: null,
		upperRightCornerDoubleC1: null,
		upperRightCornerDoubleC2: null,
		upperLeftC1Offset: null,
		upperLeftC2Offset: null,
		upperLeftCornerDoubleC1: null,
		upperLeftCornerDoubleC2: null,
		lowerRightCutoff1: null,
		lowerRightCutoff2: null,
		lowerLeftCutoff1: null,
		lowerLeftCutoff2: null,
		upperRightCutoff1: null,
		upperRightCutoff2: null,
		upperLeftCutoff1: null,
		upperLeftCutoff2: null,
	};
}

function createKellyIntersects(): KellyIntersects {
	return {
		majorBouts: {
			upperRight: new Pt(0, 0),
			upperLeft: new Pt(0, 0),
			lowerRight: new Pt(0, 0),
			lowerLeft: new Pt(0, 0)
		},
		minorBouts: {
			lowerRightVesicaUpper: new Pt(0, 0),
			lowerRightVesicaLower: new Pt(0, 0),
			lowerLeftVesicaUpper: new Pt(0, 0),
			lowerLeftVesicaLower: new Pt(0, 0),
			upperRightVesicaUpper: new Pt(0, 0),
			upperRightVesicaLower: new Pt(0, 0),
			upperLeftVesicaUpper: new Pt(0, 0),
			upperLeftVesicaLower: new Pt(0, 0)
		},
		corners: {
			lowerRight: null,
			lowerLeft: null,
			upperRight: null,
			upperLeft: null,
			lowerLeftCornerTopBodyIntersection: null,
			lowerLeftCornerBottomBodyIntersection: null,
			lowerRightCornerTopBodyIntersection: null,
			lowerRightCornerBottomBodyIntersection: null,
			upperLeftCornerTopBodyIntersection: null,
			upperLeftCornerBottomBodyIntersection: null,
			upperRightCornerTopBodyIntersection: null,
			upperRightCornerBottomBodyIntersection: null,
		},
		blocks: {
			lowerLeftBlockP1: new Pt(0, 0),
			lowerLeftBlockP2: new Pt(0, 0),
			lowerLeftBlockP3: new Pt(0, 0),
			lowerRightBlockP1: new Pt(0, 0),
			lowerRightBlockP2: new Pt(0, 0),
			lowerRightBlockP3: new Pt(0, 0),
			upperRightBlockP1: new Pt(0, 0),
			upperRightBlockP2: new Pt(0, 0),
			upperRightBlockP3: new Pt(0, 0),
			upperLeftBlockP1: new Pt(0, 0),
			upperLeftBlockP2: new Pt(0, 0),
			upperLeftBlockP3: new Pt(0, 0),
		}
	};
}

// =============================================================================
// Recipe class
// =============================================================================

export class KellyViolinRecipe implements KellyViolinData {
	recipeName: string;
	fileName: string;
	version: string;
	params: KellyParams;
	shapes: KellyShapes;
	intersects: KellyIntersects;
	paths: KellyCalcEntry[];
	ratios: KellyRatios;
	options: KellyOptions;

	constructor(fileName = 'New Violin', params?: KellyParams) {
		this.recipeName = 'Kelly Violin';
		this.fileName = fileName;
		this.version = '.1';

		this.params = params ?? BLANK_PARAMS
		this.shapes = createKellyShapes();
		this.intersects = createKellyIntersects();
		this.ratios = { ...KELLY_DEFAULT_RATIOS };

		this.paths = [];
		this.options = {
			lockUpperJoinArc: true,
			lockLowerJoinArc: true,
			useViolNeck: false
		};
	}
}

// =============================================================================
// Templates
// =============================================================================

export interface KellyTemplate extends KellyViolinData {
	key: string;
	label: string;
}

export const KELLY_TEMPLATES: KellyTemplate[] = [
	{
		key: 'New',
		label: 'New Fiddle',
		...new KellyViolinRecipe('New Fiddle', BLANK_PARAMS),
		description: 'Start from scratch with default parameters.'
	},
	{
		key: 'delGesu',
		label: 'Violin - Del Gesù - Baltic',
		description: 'C. 1731 \n\nhttps://tarisio.com/cozio-archive/property/?ID=40410',
		...new KellyViolinRecipe('Del Gesù - Baltic', DelGesu_Baltic_Params),
		referenceImage: {
			"href": "/DelGesuBaltic.png",
			"xlink:href": "/DelGesuBaltic.png",
			"x": -107,
			"y": -11.7,
			"width": 214,
			"height": 587,
		},
	},
	{
		key: 'stradivari',
		label: 'Violin - Stradivari - Goetz',
		description: 'C. 1695, Long Strad \n\nhttps://tarisio.com/cozio-archive/property/?ID=40785',
		...new KellyViolinRecipe('Stradivari - Goetz', StradGoetz_Params),
		referenceImage: {
			"href": "/StradGoetz.jpg",
			"xlink:href": "/StradGoetz.jpg",
			"x": -158.7095239572227,
			"y": -196.6448444843292,
			"width": 319,
			"height": 779,
		},
	},
	{
		key: 'montagnana',
		label: 'Cello - Montagnana - Sugia',
		description: '',
		...new KellyViolinRecipe('Montagnana - Sugia', montagnana_sugia_params),
		referenceImage: {
			"href": "/Montagnana_Sugia.png",
			"xlink:href": "/Montagnana_Sugia.png",
			"x": -217.7344970703125,
			"y": -5.551761627197266,
			"width": 442.29870327346663,
			"height": 775.951358795166,
		},
	},
	{
		key: "stradCello",
		label: "Cello - Stradavari - Davidoff",
		description: '',
		...new KellyViolinRecipe('Stradivari - Davidoff', Strad_Davidoff_Params),
		referenceImage: {
			"href": "/Strad_Davidoff.jpg",
			"xlink:href": "/Strad_Davidoff.jpg",
			"x": -242.87711143493652,
			"y": -45.01482009887695,
			"width": 485,
			"height": 851,
		}
	},
	{
		key: 'maggini',
		label: 'Bass - Maggini - Delmas',
		description: 'C. 1620 \n\nhttps://tarisio.com/cozio-archive/property/?ID=23195',
		...new KellyViolinRecipe('Maggini - Delmas', Maggini_Delmas_Params),
		referenceImage: {
			"href": "/Maggini_Delmas.png",
			"xlink:href": "/Maggini_Delmas.png",
			"x": -313.5491097340065,
			"y": -7.565528869628906,
			"width": 613.4617636308805,
			"height": 1677.2602310180664,
		},
		options: {		
			lockUpperJoinArc: true,
			lockLowerJoinArc: true,
			useViolNeck: true
		}
	}
	
];
