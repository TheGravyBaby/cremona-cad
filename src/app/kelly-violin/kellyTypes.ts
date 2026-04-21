import { Circle, Pt, Rectangle } from '../models/types';

export class KellyViolinRecipe implements KellyViolinData {
	recipeName: string;
	fileName: string;
	version: string;
	params: KellyParams;
	shapes: Partial<KellyShapes>;
	intersects: Partial<KellyIntersects>;
	paths: KellyCalcEntry[];

	constructor(fileName = 'Kelly-Baltic', params: KellyParamOverrides = {}) {
		this.recipeName = 'Kelly Violin';
		this.fileName = fileName;
		this.version = '.1';

		this.params = { ...KELLY_DEFAULT_PARAMS, ...params };
		this.shapes = {};
		this.intersects = {};

		this.paths = [];
	}

	newFile(params: KellyParamOverrides = {}) {
		this.params = { ...KELLY_BLANK_PARAMS, ...params };
		this.shapes = {};
		this.intersects = {};
		this.paths = [];
	}
}

export const KELLY_DEFAULT_PARAMS: KellyParams = {
	h: 348,
	w: 203,
	inset: 4,
	bitDiameter: 6.35,
	upperBoutRadius: 78,
	upperBoutCenter: 284,
	lowerBoutRadius: 97.5,
	lowerBoutCenter: 70,
	centerBoutRadius: 85,
	upperVesaciRadius: 57,
	lowerVesaciRadius: 62,
	cornerTargetRadius: 74,
	lowerCornerGuideYIntercept: 51,
	lowerCornerGuideXOffset: 0,
	upperCornerGuideYIntercept: 278,
	upperCornerGuideXOffset: 0,
	upperTopCornerCircleRadius: 24,
	upperBottomCornerCircleRadius: 20,
	lowerTopCornerCircleRadius: 20,
	lowerBottomCornerCircleRadius: 24,
	cornerBlockHeight: 24,
	cornerBlockWidth: 20,
	cornerBlockPadding: 8,
	lowerBlockHeight: 20,
	lowerBlockWidth: 60,
	upperBlockHeight: 20,
	upperBlockWidth: 40,
	lowerTopCornerDubCircleRadius: 10,
	lowerTopCornerDubCircleTheta: -70,
	lowerBottomCornerDubCircleRadius: 10,
	lowerBottomCornerDubCircleTheta: 165,
	lowerTopCornerDubCircleCutoffTheta: 300,
	lowerBottomCornerDubCircleCutoffTheta: 135,
	upperTopCornerDubCircleRadius: 10,
	upperTopCornerDubCircleTheta: 200,
	upperBottomCornerDubCircleRadius: 10,
	upperBottomCornerDubCircleTheta: 105,
	upperTopCornerDubCircleCutoffTheta: 225,
	upperBottomCornerDubCircleCutoffTheta: 70
};

export const KELLY_BLANK_PARAMS: KellyParams = {
	...KELLY_DEFAULT_PARAMS,
	h: 350,
	w: 200,
	inset: 0,
	bitDiameter: 0,
	upperBoutRadius: 0,
	upperBoutCenter: 0,
	lowerBoutRadius: 0,
	lowerBoutCenter: 0,
	centerBoutRadius: 0,
	upperVesaciRadius: 0,
	lowerVesaciRadius: 0,
	cornerTargetRadius: 0,
	lowerCornerGuideYIntercept: 0,
	lowerCornerGuideXOffset: 0,
	upperCornerGuideYIntercept: 0,
	upperCornerGuideXOffset: 0,
	upperTopCornerCircleRadius: 0,
	upperBottomCornerCircleRadius: 0,
	lowerTopCornerCircleRadius: 0,
	lowerBottomCornerCircleRadius: 0,
	cornerBlockHeight: 0,
	cornerBlockWidth: 0,
	cornerBlockPadding: 0,
	lowerBlockHeight: 0,
	lowerBlockWidth: 0,
	upperBlockHeight: 0,
	upperBlockWidth: 0,
	lowerTopCornerDubCircleRadius: 0,
	lowerTopCornerDubCircleTheta: 0,
	lowerBottomCornerDubCircleRadius: 0,
	lowerBottomCornerDubCircleTheta: 0,
	lowerTopCornerDubCircleCutoffTheta: 0,
	lowerBottomCornerDubCircleCutoffTheta: 0,
	upperTopCornerDubCircleRadius: 0,
	upperTopCornerDubCircleTheta: 0,
	upperBottomCornerDubCircleRadius: 0,
	upperBottomCornerDubCircleTheta: 0,
	upperTopCornerDubCircleCutoffTheta: 0,
	upperBottomCornerDubCircleCutoffTheta: 0,
};

export interface KellyParams {
	h: number;
	w: number;
	inset: number;
	bitDiameter: number;
	upperBoutRadius: number;
	upperBoutCenter: number;
	lowerBoutRadius: number;
	lowerBoutCenter: number;
	centerBoutRadius: number;
	upperVesaciRadius: number;
	lowerVesaciRadius: number;
	cornerTargetRadius: number;
	lowerCornerGuideYIntercept: number;
	lowerCornerGuideXOffset: number;
	upperCornerGuideYIntercept: number;
	upperCornerGuideXOffset: number;
	upperTopCornerCircleRadius: number;
	upperBottomCornerCircleRadius: number;
	lowerTopCornerCircleRadius: number;
	lowerBottomCornerCircleRadius: number;
	cornerBlockHeight: number;
	cornerBlockWidth: number;
	cornerBlockPadding: number;
	lowerBlockHeight: number;
	lowerBlockWidth: number;
	upperBlockHeight: number;
	upperBlockWidth: number;
	lowerTopCornerDubCircleRadius: number;
	lowerTopCornerDubCircleTheta: number;
	lowerBottomCornerDubCircleRadius: number;
	lowerBottomCornerDubCircleTheta: number;
	lowerTopCornerDubCircleCutoffTheta: number;
	lowerBottomCornerDubCircleCutoffTheta: number;
	upperTopCornerDubCircleRadius: number;
	upperTopCornerDubCircleTheta: number;
	upperBottomCornerDubCircleRadius: number;
	upperBottomCornerDubCircleTheta: number;
	upperTopCornerDubCircleCutoffTheta: number;
	upperBottomCornerDubCircleCutoffTheta: number;
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

export interface KellyViolinData {
	recipeName: string;
	fileName: string;
	version: string;
	params: KellyParams;
	shapes: Partial<KellyShapes>;
	intersects: Partial<KellyIntersects>;
	paths: KellyCalcEntry[];
}

export type KellyParamOverrides = Partial<KellyParams>;
