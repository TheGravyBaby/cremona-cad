import { Circle, Pt, Rectangle } from '../models/types';

export interface KellyViolinData {
	recipeName: string;
	fileName: string;
	version: string;
	params: KellyParams;
	shapes: KellyShapes;
	intersects: KellyIntersects;
	paths: KellyCalcEntry[];
	ratios: KellyRatios;
	options: KellyOptions;
}

export interface KellyOptions {
	lockUpperJoinArc: boolean;
	lockLowerJoinArc: boolean;
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

const KELLY_DEFAULT_RATIOS: KellyRatios = {
	boutUpYToUBR: 3/4,	// a bit arbitrary, but usually works
	boutLowYToLBR: 3/4,
	boutUpToLBR: 4/5,
	boutCToLBR: 4/5,
	vesicaUpRToUBR: 2/3,
	vesicaLowRToLBR: 2/3,
	cornerRToCBR: 5/6,
	cornerCircUpBoutRToLBR: 1/4,
	cornerCircUpCBoutRToLBR: 1/4 * 3/4,
	cornerCircLowCBoutRToLBR: 1/4 * 3/4,
	cornerCircLowBoutRToLBR: 1/4,

	cornerCircDubUpBoutRRatio: 3/5,
	cornerCircDubUpCBoutRRatio: 3/5,
	cornerCircDubLowCboutRRatio: 3/5,
	cornerCircDubLowBoutRRatio: 3/5,

	topTraceUpperBoutTheta: 180,
	topTraceUpperCBoutTheta: 90,
	topTraceUpperBoutCutoffTheta: 225,
	topTraceUpperCBoutCutoffTheta: 60,

	topTraceLowerCBoutTheta: 270,
	topTraceLowerBoutTheta: 180,
	topTraceLowerCBoutCutoffTheta: 310,
	topTraceLowerBoutCutoffTheta: 145,
}

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

	constructor(fileName = 'Kelly-Baltic', params: KellyParamOverrides = {}) {
		this.recipeName = 'Kelly Violin';
		this.fileName = fileName;
		this.version = '.1';

		this.params = { ...KELLY_DEFAULT_PARAMS, ...params };
		this.shapes = createKellyShapes();
		this.intersects = createKellyIntersects();
		this.ratios = {...KELLY_DEFAULT_RATIOS}

		this.paths = [];
		this.options = {
			lockUpperJoinArc: true,
			lockLowerJoinArc: true
		}
	}

	newFile(params: KellyParamOverrides = {}) {
		this.fileName = 'New Fiddle'
		this.params = { ...KELLY_BLANK_PARAMS, ...params };
		this.shapes = createKellyShapes();
		this.intersects = createKellyIntersects();
		this.paths = [];
		this.options = {
			lockUpperJoinArc: true,
			lockLowerJoinArc: true
		}
	}
}

function createKellyShapes(): KellyShapes {
	let shapes: KellyShapes = {
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
	}

    return shapes;
}

function createKellyIntersects(): KellyIntersects {
	let intersects: KellyIntersects = {
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

    return intersects;
}

export const KELLY_DEFAULT_PARAMS: KellyParams = {
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

export const KELLY_BLANK_PARAMS: KellyParams = {
	...KELLY_DEFAULT_PARAMS,
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

export type KellyParamOverrides = Partial<KellyParams>;
