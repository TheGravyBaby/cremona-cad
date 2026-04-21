import { Circle, Pt, Rectangle } from '../models/types';
import {
	arcPathFrom3Points,
	calculateOffset,
	circleCircleIntersections,
	differenceFromTwoPaths,
	dist,
	findClosestPointOnPathToCircle,
	findJoiningCircleFromCircleAndPoint,
	inscribeCircleWithinCircle,
	interceptCirclesAndPoint,
	lineCircleIntersection,
	pathFromCircle,
	pathFromLine,
	pathFromRect,
	pathFromRoundedRect,
	pointOnCircle,
	unifyConnectedSvgPaths,
} from '../helpers/draftMath';
import { KellyCalcEntry, KellyViolinData } from './kellyTypes';

function upsertCalc(data: KellyViolinData, calc: KellyCalcEntry): void {
	const existingIndex = data.paths.findIndex(c => c.name === calc.name);
	if (existingIndex !== -1) {
		data.paths[existingIndex] = calc;
		return;
	}

	data.paths.push(calc);
}

function requireCorners(data: KellyViolinData): {
	lowerRight: Pt;
	lowerLeft: Pt;
	upperRight: Pt;
	upperLeft: Pt;
} | null {
	const { lowerRight, lowerLeft, upperRight, upperLeft } = data.intersects.corners;
	if (!lowerRight || !lowerLeft || !upperRight || !upperLeft) {
		return null;
	}

	return { lowerRight, lowerLeft, upperRight, upperLeft };
}

export function calculatePrimaryOutline(data: KellyViolinData): void {
	if (data.params.boutUpY && data.params.boutLowY && data.params.boutUpR && data.params.boutLowR && data.params.boutCenR) {
		data.shapes.upperBout = { x: 0, y: data.params.boutUpY, r: data.params.boutUpR };
		data.shapes.lowerBout = { x: 0, y: data.params.boutLowY, r: data.params.boutLowR };

		const upperLowerDelta = data.params.boutUpY - data.params.boutLowY;
		const upperCenterDistance = data.params.boutCenR + data.params.boutUpR;
		const lowerCenterDistance = data.params.boutCenR + data.params.boutLowR;

		const cosTheta = (upperLowerDelta * upperLowerDelta + upperCenterDistance * upperCenterDistance - lowerCenterDistance * lowerCenterDistance) / (2 * upperLowerDelta * upperCenterDistance);
		const theta = Math.acos(cosTheta);

		const centerX = upperCenterDistance * Math.sin(theta);
		const centerY = data.params.boutUpY - upperCenterDistance * Math.cos(theta);

		data.shapes.centerBoutLeft = { x: -centerX, y: centerY, r: data.params.boutCenR };
		data.shapes.centerBoutRight = { x: centerX, y: centerY, r: data.params.boutCenR };

		const upperRight = circleCircleIntersections(data.shapes.upperBout, data.shapes.centerBoutRight)[0];
		const upperLeft = circleCircleIntersections(data.shapes.upperBout, data.shapes.centerBoutLeft)[0];
		const lowerRight = circleCircleIntersections(data.shapes.lowerBout, data.shapes.centerBoutRight)[0];
		const lowerLeft = circleCircleIntersections(data.shapes.lowerBout, data.shapes.centerBoutLeft)[0];

		data.intersects.majorBouts = { upperRight, upperLeft, lowerRight, lowerLeft };
	}

	if (data.params.boutLowR && data.params.vesaciLowR && data.params.boutUpR && data.params.vesaciUpR) {
		const lowerRightVesica = { x: data.params.boutLowR - data.params.vesaciLowR, y: data.params.boutLowY, r: data.params.vesaciLowR };
		const lowerLeftVesica = { x: -data.params.boutLowR + data.params.vesaciLowR, y: data.params.boutLowY, r: data.params.vesaciLowR };
		const upperRightVesica = { x: data.params.boutUpR - data.params.vesaciUpR, y: data.params.boutUpY, r: data.params.vesaciUpR };
		const upperLeftVesica = { x: -data.params.boutUpR + data.params.vesaciUpR, y: data.params.boutUpY, r: data.params.vesaciUpR };
		const upperJoiningCircle = findJoiningCircleFromCircleAndPoint(upperRightVesica, { x: 0, y: data.params.height - data.params.inset });
		const lowerJoiningCircle = findJoiningCircleFromCircleAndPoint(lowerRightVesica, { x: 0, y: data.params.inset });

		data.shapes.lowerRightVesaci = lowerRightVesica;
		data.shapes.lowerLeftVesaci = lowerLeftVesica;
		data.shapes.upperRightVesaci = upperRightVesica;
		data.shapes.upperLeftVesaci = upperLeftVesica;
		data.shapes.upperJoiningCircle = upperJoiningCircle;
		data.shapes.lowerJoiningCircle = lowerJoiningCircle;

		data.intersects.minorBouts = {
			lowerRightVesicaUpper: circleCircleIntersections(lowerRightVesica, data.shapes.lowerBout)[0],
			lowerRightVesicaLower: circleCircleIntersections(lowerRightVesica, lowerJoiningCircle)[0],
			lowerLeftVesicaUpper: circleCircleIntersections(lowerLeftVesica, data.shapes.lowerBout)[0],
			lowerLeftVesicaLower: circleCircleIntersections(lowerLeftVesica, lowerJoiningCircle)[0],
			upperRightVesicaUpper: circleCircleIntersections(upperRightVesica, upperJoiningCircle)[0],
			upperRightVesicaLower: circleCircleIntersections(upperRightVesica, data.shapes.upperBout)[0],
			upperLeftVesicaUpper: circleCircleIntersections(upperLeftVesica, upperJoiningCircle)[0],
			upperLeftVesicaLower: circleCircleIntersections(upperLeftVesica, data.shapes.upperBout)[0],
		};
	}

	if (data.params.cornerR && data.params.cornerGuideUpY) {
		const rightTargetCircle: Circle = { x: data.shapes.centerBoutRight.x, y: data.shapes.centerBoutRight.y, r: data.params.cornerR };
		const leftTargetCircle: Circle = { x: data.shapes.centerBoutLeft.x, y: data.shapes.centerBoutLeft.y, r: data.params.cornerR };

		const lowerRightCornerTarget: Circle = { x: rightTargetCircle.x + data.params.cornerGuideLowXOff, y: rightTargetCircle.y, r: rightTargetCircle.r };
		const lowerLeftCornerTarget: Circle = { x: leftTargetCircle.x - data.params.cornerGuideLowXOff, y: leftTargetCircle.y, r: leftTargetCircle.r };
		const upperRightCornerTarget: Circle = { x: rightTargetCircle.x + data.params.cornerGuideUpXOff, y: rightTargetCircle.y, r: rightTargetCircle.r };
		const upperLeftCornerTarget: Circle = { x: leftTargetCircle.x - data.params.cornerGuideUpXOff, y: leftTargetCircle.y, r: leftTargetCircle.r };

		data.intersects.corners.lowerRight = lineCircleIntersection({ x: 0, y: data.params.cornerGuideLowY }, lowerRightCornerTarget, rightTargetCircle)[1];
		data.intersects.corners.lowerLeft = lineCircleIntersection({ x: 0, y: data.params.cornerGuideLowY }, lowerLeftCornerTarget, leftTargetCircle)[1];
		data.intersects.corners.upperRight = lineCircleIntersection({ x: 0, y: data.params.cornerGuideUpY }, upperRightCornerTarget, rightTargetCircle)[1];
		data.intersects.corners.upperLeft = lineCircleIntersection({ x: 0, y: data.params.cornerGuideUpY }, upperLeftCornerTarget, leftTargetCircle)[1];
	}

	const corners = requireCorners(data);
	if (corners && data.params.cornerCircUpBoutR && data.params.cornerCircUpCBoutR && data.params.cornerCircLowCBoutR && data.params.cornerCircLowBoutR) {
		const lowerTopRightCornerCircle = interceptCirclesAndPoint(data.shapes.centerBoutRight, corners.lowerRight, data.params.cornerCircLowCBoutR).sort((a, b) => b.y - a.y)[0];
		const lowerBottomRightCornerCircle = interceptCirclesAndPoint(data.shapes.lowerBout, corners.lowerRight, data.params.cornerCircLowBoutR).sort((a, b) => b.y - a.y)[1];
		const lowerTopLeftCornerCircle = interceptCirclesAndPoint(data.shapes.centerBoutLeft, corners.lowerLeft, data.params.cornerCircLowCBoutR).sort((a, b) => b.y - a.y)[0];
		const lowerBottomLeftCornerCircle = interceptCirclesAndPoint(data.shapes.lowerBout, corners.lowerLeft, data.params.cornerCircLowBoutR).sort((a, b) => b.y - a.y)[1];
		const upperTopRightCornerCircle = interceptCirclesAndPoint(data.shapes.upperBout, corners.upperRight, data.params.cornerCircUpBoutR).sort((a, b) => b.y - a.y)[0];
		const upperBottomRightCornerCircle = interceptCirclesAndPoint(data.shapes.centerBoutRight, corners.upperRight, data.params.cornerCircUpCBoutR).sort((a, b) => b.y - a.y)[1];
		const upperTopLeftCornerCircle = interceptCirclesAndPoint(data.shapes.upperBout, corners.upperLeft, data.params.cornerCircUpBoutR).sort((a, b) => b.y - a.y)[0];
		const upperBottomLeftCornerCircle = interceptCirclesAndPoint(data.shapes.centerBoutLeft, corners.upperLeft, data.params.cornerCircUpCBoutR).sort((a, b) => b.y - a.y)[1];

		data.shapes.lowerLeftCornerC1 = lowerTopLeftCornerCircle;
		data.shapes.lowerLeftCornerC2 = lowerBottomLeftCornerCircle;
		data.shapes.lowerRightCornerC1 = lowerTopRightCornerCircle;
		data.shapes.lowerRightCornerC2 = lowerBottomRightCornerCircle;
		data.shapes.upperRightCornerC1 = upperTopRightCornerCircle;
		data.shapes.upperRightCornerC2 = upperBottomRightCornerCircle;
		data.shapes.upperLeftCornerC1 = upperTopLeftCornerCircle;
		data.shapes.upperLeftCornerC2 = upperBottomLeftCornerCircle;

		data.intersects.corners.lowerLeftCornerTopBodyIntersection = circleCircleIntersections(lowerTopLeftCornerCircle, data.shapes.centerBoutLeft)[0];
		data.intersects.corners.lowerLeftCornerBottomBodyIntersection = circleCircleIntersections(lowerBottomLeftCornerCircle, data.shapes.lowerBout)[1];
		data.intersects.corners.lowerRightCornerTopBodyIntersection = circleCircleIntersections(lowerTopRightCornerCircle, data.shapes.centerBoutRight)[0];
		data.intersects.corners.lowerRightCornerBottomBodyIntersection = circleCircleIntersections(lowerBottomRightCornerCircle, data.shapes.lowerBout)[1];
		data.intersects.corners.upperLeftCornerTopBodyIntersection = circleCircleIntersections(upperTopLeftCornerCircle, data.shapes.upperBout)[0];
		data.intersects.corners.upperLeftCornerBottomBodyIntersection = circleCircleIntersections(upperBottomLeftCornerCircle, data.shapes.centerBoutLeft)[1];
		data.intersects.corners.upperRightCornerTopBodyIntersection = circleCircleIntersections(upperTopRightCornerCircle, data.shapes.upperBout)[0];
		data.intersects.corners.upperRightCornerBottomBodyIntersection = circleCircleIntersections(upperBottomRightCornerCircle, data.shapes.centerBoutRight)[1];
	}

	if (corners) {
		const pad = data.params.blockCornerPad;
		data.shapes.lowerRightBlock = new Rectangle(new Pt(corners.lowerRight.x + pad, corners.lowerRight.y + pad), new Pt(corners.lowerRight.x - (data.params.blockCornerW - pad), corners.lowerRight.y - (data.params.blockCornerH - pad)));
		data.shapes.lowerLeftBlock = new Rectangle(new Pt(corners.lowerLeft.x - pad, corners.lowerLeft.y + pad), new Pt(corners.lowerLeft.x + (data.params.blockCornerW - pad), corners.lowerLeft.y - (data.params.blockCornerH - pad)));
		data.shapes.upperRightBlock = new Rectangle(new Pt(corners.upperRight.x + pad, corners.upperRight.y - pad), new Pt(corners.upperRight.x - (data.params.blockCornerW - pad), corners.upperRight.y + (data.params.blockCornerH - pad)));
		data.shapes.upperLeftBlock = new Rectangle(new Pt(corners.upperLeft.x - pad, corners.upperLeft.y - pad), new Pt(corners.upperLeft.x + (data.params.blockCornerW - pad), corners.upperLeft.y + (data.params.blockCornerH - pad)));

		const lowerBlockP1 = new Pt(-0.5 * data.params.blowLowW, data.params.inset);
		const lowerBlockP2 = new Pt(0.5 * data.params.blowLowW, lowerBlockP1.y + data.params.blockLowH);
		data.shapes.lowerBlock = new Rectangle(lowerBlockP1, lowerBlockP2);

		const upperBlockP1 = new Pt(-0.5 * data.params.blockUpW, data.params.height - data.params.inset);
		const upperBlockP2 = new Pt(0.5 * data.params.blockUpW, upperBlockP1.y - data.params.blockUpH);
		data.shapes.upperBlock = new Rectangle(upperBlockP1, upperBlockP2);

		const blockInset = 20;
		const clampChannelWidth = 25;

		const lowerBlockClampingCutoutP1 = new Pt(data.shapes.lowerBlock.Pt1.x * 1.2, data.shapes.lowerBlock.Pt2.y + blockInset);
		const lowerBlockClampingCutoutP2 = new Pt(data.shapes.lowerBlock.Pt2.x * 1.2, data.shapes.lowerBlock.Pt2.y + blockInset + clampChannelWidth);
		const upperBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP1.x, data.shapes.upperBlock.Pt2.y - blockInset);
		const upperBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP2.x, data.shapes.upperBlock.Pt2.y - (blockInset + clampChannelWidth));
		const leftCornerBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP1.x, lowerBlockClampingCutoutP2.y + blockInset);
		const leftCornerBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP1.x + clampChannelWidth, upperBlockClampingCutoutP2.y - blockInset);
		const rightCornerBlockClampingCutoutP1 = new Pt(lowerBlockClampingCutoutP2.x, lowerBlockClampingCutoutP2.y + blockInset);
		const rightCornerBlockClampingCutoutP2 = new Pt(lowerBlockClampingCutoutP2.x - clampChannelWidth, upperBlockClampingCutoutP2.y - blockInset);

		data.shapes.lowerClampCutout = { Pt1: lowerBlockClampingCutoutP1, Pt2: lowerBlockClampingCutoutP2 };
		data.shapes.upperClampCutout = { Pt1: upperBlockClampingCutoutP1, Pt2: upperBlockClampingCutoutP2 };
		data.shapes.leftClampCutout = { Pt1: leftCornerBlockClampingCutoutP1, Pt2: leftCornerBlockClampingCutoutP2 };
		data.shapes.rightClampCutout = { Pt1: rightCornerBlockClampingCutoutP1, Pt2: rightCornerBlockClampingCutoutP2 };
	}

	calculateMainPath(data);
}

export function calculateMainPath(data: KellyViolinData): void {
	const pathsCorners: string[] = [];
    const pathsCornerless: string[] = [];
	const cornersCalculated = !!(data.shapes.lowerLeftCornerC1 && data.intersects.corners.lowerLeftCornerBottomBodyIntersection);

	if (cornersCalculated) {
        let pc1 = arcPathFrom3Points(data.shapes.lowerLeftCornerC2!, data.intersects.corners.lowerLeftCornerBottomBodyIntersection!, data.intersects.corners.lowerLeft!)
        let pc2 = arcPathFrom3Points(data.shapes.lowerBout, data.intersects.corners.lowerLeftCornerBottomBodyIntersection!, data.intersects.minorBouts.lowerLeftVesicaUpper)
		pathsCorners.push(pc1, pc2);
	} 

    let p1 = arcPathFrom3Points(data.shapes.lowerBout, data.intersects.majorBouts.lowerLeft, data.intersects.minorBouts.lowerLeftVesicaUpper);
    let p2 = arcPathFrom3Points(data.shapes.centerBoutLeft, data.intersects.majorBouts.lowerLeft, data.intersects.majorBouts.upperLeft);
    pathsCornerless.push(p1, p2);
    
        
    let p3 = arcPathFrom3Points(data.shapes.lowerLeftVesaci, data.intersects.minorBouts.lowerLeftVesicaUpper, data.intersects.minorBouts.lowerLeftVesicaLower)
    let p4 = arcPathFrom3Points(data.shapes.lowerJoiningCircle, data.intersects.minorBouts.lowerLeftVesicaLower, data.intersects.minorBouts.lowerRightVesicaLower)
    let p5 = arcPathFrom3Points(data.shapes.lowerRightVesaci, data.intersects.minorBouts.lowerRightVesicaLower, data.intersects.minorBouts.lowerRightVesicaUpper)
    pathsCorners.push(p3, p4, p5);
    pathsCornerless.push(p3, p4, p5);

    if (cornersCalculated) {
        let pc3 = arcPathFrom3Points(data.shapes.lowerBout, data.intersects.minorBouts.lowerRightVesicaUpper, data.intersects.corners.lowerRightCornerBottomBodyIntersection!);
        let pc4 = arcPathFrom3Points(data.shapes.lowerRightCornerC2!, data.intersects.corners.lowerRight!, data.intersects.corners.lowerRightCornerBottomBodyIntersection!);
        let pc5 = arcPathFrom3Points(data.shapes.lowerRightCornerC1!, data.intersects.corners.lowerRightCornerTopBodyIntersection!, data.intersects.corners.lowerRight!);
        let pc6 = arcPathFrom3Points(data.shapes.centerBoutRight, data.intersects.corners.upperRightCornerBottomBodyIntersection!, data.intersects.corners.lowerRightCornerTopBodyIntersection!);
        let pc7 = arcPathFrom3Points(data.shapes.upperRightCornerC2!, data.intersects.corners.upperRight!, data.intersects.corners.upperRightCornerBottomBodyIntersection!);
        pathsCorners.push(pc3, pc4, pc5, pc6, pc7);
    } 
    
    let p55 = arcPathFrom3Points(data.shapes.lowerBout, data.intersects.minorBouts.lowerRightVesicaUpper, data.intersects.majorBouts.lowerRight)
    let p6 = arcPathFrom3Points(data.shapes.centerBoutLeft, data.intersects.majorBouts.lowerLeft, data.intersects.majorBouts.upperLeft);
    let p7 = arcPathFrom3Points(data.shapes.centerBoutRight, data.intersects.majorBouts.upperRight, data.intersects.majorBouts.lowerRight);
    pathsCornerless.push(p55, p6, p7);
    

	if (cornersCalculated) {
        let pc8 = arcPathFrom3Points(data.shapes.upperRightCornerC1!, data.intersects.corners.upperRightCornerTopBodyIntersection!, data.intersects.corners.upperRight!);
        let pc9 = arcPathFrom3Points(data.shapes.upperBout, data.intersects.corners.upperRightCornerTopBodyIntersection!, data.intersects.minorBouts.upperRightVesicaLower);
        pathsCorners.push(pc8, pc9);
	} 

    let p8 = arcPathFrom3Points(data.shapes.upperBout, data.intersects.majorBouts.upperRight, data.intersects.minorBouts.upperRightVesicaLower)
    let p9 = arcPathFrom3Points(data.shapes.upperBout, data.intersects.minorBouts.upperLeftVesicaLower, data.intersects.majorBouts.upperLeft)
    pathsCornerless.push(p8, p9);


	let p10 = arcPathFrom3Points(data.shapes.upperRightVesaci, data.intersects.minorBouts.upperRightVesicaLower, data.intersects.minorBouts.upperRightVesicaUpper)
	let p11 = arcPathFrom3Points(data.shapes.upperJoiningCircle, data.intersects.minorBouts.upperRightVesicaUpper, data.intersects.minorBouts.upperLeftVesicaUpper)
	let p12 = arcPathFrom3Points(data.shapes.upperLeftVesaci, data.intersects.minorBouts.upperLeftVesicaUpper, data.intersects.minorBouts.upperLeftVesicaLower)
    pathsCorners.push(p10, p11, p12);
    pathsCornerless.push(p10, p11, p12);
	

	if (cornersCalculated) {
	    let pc10 = 	arcPathFrom3Points(data.shapes.upperBout, data.intersects.minorBouts.upperLeftVesicaLower, data.intersects.corners.upperLeftCornerTopBodyIntersection!)
		let pc11 =	arcPathFrom3Points(data.shapes.upperLeftCornerC1!, data.intersects.corners.upperLeft!, data.intersects.corners.upperLeftCornerTopBodyIntersection!)
		let pc12 =	arcPathFrom3Points(data.shapes.upperLeftCornerC2!, data.intersects.corners.upperLeftCornerBottomBodyIntersection!, data.intersects.corners.upperLeft!)
		let pc13 =  arcPathFrom3Points(data.shapes.lowerLeftCornerC1!, data.intersects.corners.lowerLeft!, data.intersects.corners.lowerLeftCornerTopBodyIntersection!)
		let pc14 = 	arcPathFrom3Points(data.shapes.centerBoutLeft, data.intersects.corners.lowerLeftCornerTopBodyIntersection!, data.intersects.corners.upperLeftCornerBottomBodyIntersection!)

        pathsCorners.push(pc10, pc11, pc12, pc13, pc14);	
	}

	upsertCalc(data, { name: 'innerPath', paths: pathsCorners });
    upsertCalc(data, { name: 'innerPathCornerless', paths: pathsCornerless });
}

export function calculateMainPathsUnified(data: KellyViolinData): void {
	const source = data.paths.find(c => c.name === 'innerPath');
	if (!source?.paths?.length) {
		return;
	}

	upsertCalc(data, { name: 'innerPathUnified', paths: [unifyConnectedSvgPaths(source.paths)] });
}

export function calculateMainPathsSegmented(data: KellyViolinData): void {
	const paths = data.paths.find(c => c.name === 'innerPath')?.paths;
	if (!paths) {
		return;
	}

	const lowerBoutPartial = paths.slice(1, 6);
	const rightCenterBoutPartial = paths.slice(8, 9);
	const upperCenterBoutPartial = paths.slice(11, 16);
	const upperBoutPartial = paths.slice(19, 20);

	const lowerBout = paths.slice(0, 7);
	const rightCenterBout = paths.slice(7, 10);
	const upperCenterBout = paths.slice(10, 17);
	const upperBout = paths.slice(17, 20);

	upsertCalc(data, {
		name: 'segmentedPartialPath',
		paths: [
			unifyConnectedSvgPaths(lowerBoutPartial),
			unifyConnectedSvgPaths(rightCenterBoutPartial),
			unifyConnectedSvgPaths(upperCenterBoutPartial),
			unifyConnectedSvgPaths(upperBoutPartial),
		],
	});

	upsertCalc(data, {
		name: 'segmentedTrace',
		paths: [
			unifyConnectedSvgPaths(lowerBout),
			unifyConnectedSvgPaths(rightCenterBout),
			unifyConnectedSvgPaths(upperCenterBout),
			unifyConnectedSvgPaths(upperBout),
		],
	});
}

export function calculateOffsetPathsSegments(data: KellyViolinData): void {
	const segmentedPaths = data.paths.find(c => c.name === 'segmentedPartialPath');
	if (!segmentedPaths) {
		return;
	}

	upsertCalc(data, {
		name: 'offsetSegmentedPath',
		paths: [
			calculateOffset(segmentedPaths.paths[0], data.params.inset),
			calculateOffset(segmentedPaths.paths[1], -data.params.inset),
			calculateOffset(segmentedPaths.paths[2], data.params.inset),
			calculateOffset(segmentedPaths.paths[3], -data.params.inset),
		],
	});
}

export function calculateTopPath(data: KellyViolinData): void {
	const paths = data.paths.find(c => c.name === 'offsetSegmentedPath')?.paths;
	const {
		lowerRightCornerC1,
		lowerRightCornerC2,
		lowerLeftCornerC1,
		lowerLeftCornerC2,
		upperRightCornerC1,
		upperRightCornerC2,
		upperLeftCornerC1,
		upperLeftCornerC2,
	} = data.shapes;

	if (!paths || !lowerRightCornerC1 || !lowerRightCornerC2 || !lowerLeftCornerC1 || !lowerLeftCornerC2 || !upperRightCornerC1 || !upperRightCornerC2 || !upperLeftCornerC1 || !upperLeftCornerC2) {
		return;
	}

	data.shapes.lowerRightC1Offset = { ...lowerRightCornerC1, r: lowerRightCornerC1.r - data.params.inset };
	data.shapes.lowerRightC2Offset = { ...lowerRightCornerC2, r: lowerRightCornerC2.r - data.params.inset };

	const lowerRightC1ClosestPoint = findClosestPointOnPathToCircle(paths[1], data.shapes.lowerRightC1Offset);
	const lowerRightC2ClosestPoint = findClosestPointOnPathToCircle(paths[0], data.shapes.lowerRightC2Offset);
	const lowerRightC1Dist = dist(lowerRightC1ClosestPoint, data.shapes.lowerRightC1Offset);
	const lowerRightC2Dist = dist(lowerRightC2ClosestPoint, data.shapes.lowerRightC2Offset);
	data.shapes.lowerRightC1Offset.r = lowerRightC1Dist;
	data.shapes.lowerRightC2Offset.r = lowerRightC2Dist;

	const lowerTopTheta = data.params.cornerCircDubLowCBoutTheta * Math.PI / 180;
	const lowerBottomTheta = data.params.cornerCircDubLowBoutTheta * Math.PI / 180;
	const lowerTopCutoffTheta = data.params.cornerCircleDubLowCBoutTheta * Math.PI / 180;
	const lowerBottomCutoffTheta = data.params.cornerCircleDubLowBoutTheta * Math.PI / 180;

	data.shapes.lowerRightCornerDoubleC1 = inscribeCircleWithinCircle(data.shapes.lowerRightC1Offset, data.params.cornerCircDubLowCBoutR, lowerTopTheta);
	data.shapes.lowerRightCornerDoubleC2 = inscribeCircleWithinCircle(data.shapes.lowerRightC2Offset, data.params.cornerCircDubLowBoutR, lowerBottomTheta);

	const lowerRightC1Intercept = pointOnCircle(data.shapes.lowerRightC1Offset, lowerTopTheta);
	const lowerRightC2Intercept = pointOnCircle(data.shapes.lowerRightC2Offset, lowerBottomTheta);
	data.shapes.lowerRightCutoff1 = pointOnCircle(data.shapes.lowerRightCornerDoubleC1, lowerTopCutoffTheta);
	data.shapes.lowerRightCutoff2 = pointOnCircle(data.shapes.lowerRightCornerDoubleC2, lowerBottomCutoffTheta);

	const lowerRightCornerPath = unifyConnectedSvgPaths([
		arcPathFrom3Points(data.shapes.lowerRightC2Offset, lowerRightC2Intercept, lowerRightC2ClosestPoint),
		arcPathFrom3Points(data.shapes.lowerRightCornerDoubleC2, data.shapes.lowerRightCutoff2, lowerRightC2Intercept),
		pathFromLine(data.shapes.lowerRightCutoff1, data.shapes.lowerRightCutoff2),
		arcPathFrom3Points(data.shapes.lowerRightCornerDoubleC1, lowerRightC1Intercept, data.shapes.lowerRightCutoff1),
		arcPathFrom3Points(data.shapes.lowerRightC1Offset, lowerRightC1ClosestPoint, lowerRightC1Intercept),
	]);

	data.shapes.lowerLeftC1Offset = { ...lowerLeftCornerC1, r: lowerRightC1Dist };
	data.shapes.lowerLeftC2Offset = { ...lowerLeftCornerC2, r: lowerRightC2Dist };
	data.shapes.lowerLeftCornerDoubleC1 = inscribeCircleWithinCircle(data.shapes.lowerLeftC1Offset, data.params.cornerCircDubLowCBoutR, Math.PI - lowerTopTheta);
	data.shapes.lowerLeftCornerDoubleC2 = inscribeCircleWithinCircle(data.shapes.lowerLeftC2Offset, data.params.cornerCircDubLowBoutR, Math.PI - lowerBottomTheta);

	const lowerLeftC1Intercept = pointOnCircle(data.shapes.lowerLeftC1Offset, Math.PI - lowerTopTheta);
	const lowerLeftC2Intercept = pointOnCircle(data.shapes.lowerLeftC2Offset, Math.PI - lowerBottomTheta);
	data.shapes.lowerLeftCutoff1 = pointOnCircle(data.shapes.lowerLeftCornerDoubleC1, Math.PI - lowerTopCutoffTheta);
	data.shapes.lowerLeftCutoff2 = pointOnCircle(data.shapes.lowerLeftCornerDoubleC2, Math.PI - lowerBottomCutoffTheta);

	const lowerLeftCornerPath = unifyConnectedSvgPaths([
		arcPathFrom3Points(data.shapes.lowerLeftC2Offset, lowerLeftC2Intercept, findClosestPointOnPathToCircle(paths[0], data.shapes.lowerLeftC2Offset), { clockwise: false }),
		arcPathFrom3Points(data.shapes.lowerLeftCornerDoubleC2, data.shapes.lowerLeftCutoff2, lowerLeftC2Intercept, { clockwise: false }),
		pathFromLine(data.shapes.lowerLeftCutoff1, data.shapes.lowerLeftCutoff2),
		arcPathFrom3Points(data.shapes.lowerLeftCornerDoubleC1, lowerLeftC1Intercept, data.shapes.lowerLeftCutoff1, { clockwise: false }),
		arcPathFrom3Points(data.shapes.lowerLeftC1Offset, findClosestPointOnPathToCircle(paths[3], data.shapes.lowerLeftC1Offset), lowerLeftC1Intercept, { clockwise: false }),
	]);

	data.shapes.upperRightC1Offset = { ...upperRightCornerC1, r: upperRightCornerC1.r - data.params.inset };
	data.shapes.upperRightC2Offset = { ...upperRightCornerC2, r: upperRightCornerC2.r - data.params.inset };

	const upperRightC1ClosestPoint = findClosestPointOnPathToCircle(paths[2], data.shapes.upperRightC1Offset);
	const upperRightC2ClosestPoint = findClosestPointOnPathToCircle(paths[1], data.shapes.upperRightC2Offset);
	const upperRightC1Dist = dist(upperRightC1ClosestPoint, data.shapes.upperRightC1Offset);
	const upperRightC2Dist = dist(upperRightC2ClosestPoint, data.shapes.upperRightC2Offset);
	data.shapes.upperRightC1Offset.r = upperRightC1Dist;
	data.shapes.upperRightC2Offset.r = upperRightC2Dist;

	const upperTopTheta = data.params.cornerCircDubUpBoutTheta * Math.PI / 180;
	const upperBottomTheta = data.params.cornerCircDubUpCBoutTheta * Math.PI / 180;
	const upperTopCutoffTheta = data.params.cornerCircDubUpBoutCutoffTheta * Math.PI / 180;
	const upperBottomCutoffTheta = data.params.cornerCircleDubUpCBoutCutoffTheta * Math.PI / 180;

	data.shapes.upperRightCornerDoubleC1 = inscribeCircleWithinCircle(data.shapes.upperRightC1Offset, data.params.cornerCircDubUpBoutR, upperTopTheta);
	data.shapes.upperRightCornerDoubleC2 = inscribeCircleWithinCircle(data.shapes.upperRightC2Offset, data.params.cornerCircDubUpCBoutR, upperBottomTheta);

	const upperRightC1Intercept = pointOnCircle(data.shapes.upperRightC1Offset, upperTopTheta);
	const upperRightC2Intercept = pointOnCircle(data.shapes.upperRightC2Offset, upperBottomTheta);
	data.shapes.upperRightCutoff1 = pointOnCircle(data.shapes.upperRightCornerDoubleC1, upperTopCutoffTheta);
	data.shapes.upperRightCutoff2 = pointOnCircle(data.shapes.upperRightCornerDoubleC2, upperBottomCutoffTheta);

	const upperRightCornerPath = unifyConnectedSvgPaths([
		arcPathFrom3Points(data.shapes.upperRightC2Offset, upperRightC2Intercept, upperRightC2ClosestPoint),
		arcPathFrom3Points(data.shapes.upperRightCornerDoubleC2, data.shapes.upperRightCutoff2, upperRightC2Intercept),
		pathFromLine(data.shapes.upperRightCutoff1, data.shapes.upperRightCutoff2),
		arcPathFrom3Points(data.shapes.upperRightCornerDoubleC1, upperRightC1Intercept, data.shapes.upperRightCutoff1),
		arcPathFrom3Points(data.shapes.upperRightC1Offset, upperRightC1ClosestPoint, upperRightC1Intercept),
	]);

	data.shapes.upperLeftC1Offset = { ...upperLeftCornerC1, r: upperRightC1Dist };
	data.shapes.upperLeftC2Offset = { ...upperLeftCornerC2, r: upperRightC2Dist };
	data.shapes.upperLeftCornerDoubleC1 = inscribeCircleWithinCircle(data.shapes.upperLeftC1Offset, data.params.cornerCircDubUpBoutR, Math.PI - upperTopTheta);
	data.shapes.upperLeftCornerDoubleC2 = inscribeCircleWithinCircle(data.shapes.upperLeftC2Offset, data.params.cornerCircDubUpCBoutR, Math.PI - upperBottomTheta);

	const upperLeftC1Intercept = pointOnCircle(data.shapes.upperLeftC1Offset, Math.PI - upperTopTheta);
	const upperLeftC2Intercept = pointOnCircle(data.shapes.upperLeftC2Offset, Math.PI - upperBottomTheta);
	data.shapes.upperLeftCutoff1 = pointOnCircle(data.shapes.upperLeftCornerDoubleC1, Math.PI - upperTopCutoffTheta);
	data.shapes.upperLeftCutoff2 = pointOnCircle(data.shapes.upperLeftCornerDoubleC2, Math.PI - upperBottomCutoffTheta);

	const upperLeftCornerPath = unifyConnectedSvgPaths([
		arcPathFrom3Points(data.shapes.upperLeftC2Offset, upperLeftC2Intercept, findClosestPointOnPathToCircle(paths[3], data.shapes.upperLeftC2Offset), { clockwise: false }),
		arcPathFrom3Points(data.shapes.upperLeftCornerDoubleC2, data.shapes.upperLeftCutoff2, upperLeftC2Intercept, { clockwise: false }),
		pathFromLine(data.shapes.upperLeftCutoff1, data.shapes.upperLeftCutoff2),
		arcPathFrom3Points(data.shapes.upperLeftCornerDoubleC1, upperLeftC1Intercept, data.shapes.upperLeftCutoff1, { clockwise: false }),
		arcPathFrom3Points(data.shapes.upperLeftC1Offset, findClosestPointOnPathToCircle(paths[2], data.shapes.upperLeftC1Offset), upperLeftC1Intercept, { clockwise: false }),
	]);

	upsertCalc(data, {
		name: 'outerPath',
		paths: [...paths, upperRightCornerPath, upperLeftCornerPath, lowerRightCornerPath, lowerLeftCornerPath],
	});
}

export function calculateMouldPath(data: KellyViolinData, useHighAccuracy = false): void {
	calculateMainPathsUnified(data);

	const pathObj = data.paths.find(c => c.name === 'innerPathUnified')?.paths[0];
	const {
		lowerLeftBlock,
		lowerRightBlock,
		upperRightBlock,
		upperLeftBlock,
		lowerBlock,
		upperBlock,
		lowerClampCutout,
		upperClampCutout,
		leftClampCutout,
		rightClampCutout,
	} = data.shapes;

	if (!pathObj || !lowerLeftBlock || !lowerRightBlock || !upperRightBlock || !upperLeftBlock || !lowerBlock || !upperBlock || !lowerClampCutout || !upperClampCutout || !leftClampCutout || !rightClampCutout) {
		return;
	}

	const renderDensity = useHighAccuracy ? 0.1 : 1;
	let mouldPath = differenceFromTwoPaths(pathObj, pathFromRect(lowerLeftBlock), renderDensity);
	mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(lowerRightBlock), renderDensity);
	mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(upperRightBlock), renderDensity);
	mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(upperLeftBlock), renderDensity);
	mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(lowerBlock), renderDensity);
	mouldPath = differenceFromTwoPaths(mouldPath, pathFromRect(upperBlock), renderDensity);

	const bitRadius = data.params.bitDiameter ? data.params.bitDiameter / 2 : 0;
	if (bitRadius > 0) {
		const tolerance = 0.5;
		const bitOffset = (bitRadius * Math.sqrt(2) / 2) - tolerance;
		const lowerLeftBlockCornerCircle = { x: lowerLeftBlock.Pt2.x - bitOffset, y: lowerLeftBlock.Pt2.y + bitOffset, r: bitRadius };
		const lowerRightBlockCornerCircle = { x: lowerRightBlock.Pt2.x + bitOffset, y: lowerRightBlock.Pt2.y + bitOffset, r: bitRadius };
		const upperLeftBlockCornerCircle = { x: upperLeftBlock.Pt2.x - bitOffset, y: upperLeftBlock.Pt2.y - bitOffset, r: bitRadius };
		const upperRightBlockCornerCircle = { x: upperRightBlock.Pt2.x + bitOffset, y: upperRightBlock.Pt2.y - bitOffset, r: bitRadius };
		const lowerBlockCornerCircle1 = { x: lowerBlock.Pt2.x - bitOffset, y: lowerBlock.Pt2.y - bitOffset, r: bitRadius };
		const lowerBlockCornerCircle2 = { x: lowerBlock.Pt1.x + bitOffset, y: lowerBlock.Pt2.y - bitOffset, r: bitRadius };
		const upperBlockCornerCircle1 = { x: upperBlock.Pt2.x - bitOffset, y: upperBlock.Pt2.y + bitOffset, r: bitRadius };
		const upperBlockCornerCircle2 = { x: upperBlock.Pt1.x + bitOffset, y: upperBlock.Pt2.y + bitOffset, r: bitRadius };

		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerLeftBlockCornerCircle));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerRightBlockCornerCircle));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperLeftBlockCornerCircle));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperRightBlockCornerCircle));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerBlockCornerCircle1));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(lowerBlockCornerCircle2));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperBlockCornerCircle1));
		mouldPath = differenceFromTwoPaths(mouldPath, pathFromCircle(upperBlockCornerCircle2));
	}

	upsertCalc(data, {
		name: 'mouldPath',
		paths: [
			mouldPath,
			pathFromRoundedRect(lowerClampCutout, bitRadius),
			pathFromRoundedRect(upperClampCutout, bitRadius),
			pathFromRoundedRect(leftClampCutout, bitRadius),
			pathFromRoundedRect(rightClampCutout, bitRadius),
		],
	});
}
