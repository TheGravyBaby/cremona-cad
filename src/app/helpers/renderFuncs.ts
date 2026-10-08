import { Pt, Circle, Line, Rectangle, Arc } from "../models/types";
import { normalizeRadians, pointOnCircle, TURN } from "./math/simpleGeometry";
import { SolveFailure } from "./validators";
import { DASH, STROKE_WEIGHT } from "../theme/palettes";

// - number[] => segment weights (e.g. [3,4,3])
export const renderBoxLine = (
    start: Pt,
    end: Pt,
    partsOrSegments: number | number[],
    color1: string,
    color2: string,
    label: boolean,
    opts?: {
        thickness?: number;          // px
        outline?: boolean;
        tickMode?: "boundaries" | "none";
        labelMode?: "segmentIndex" | "segmentWeight";
        labelOffset?: number;        // multiplier of thickness
    }
) => (g: any, ui: any) => {
    const thickness = opts?.thickness ?? 10;
    const outlineOn = opts?.outline ?? true;
    const tickMode = opts?.tickMode ?? "boundaries";
    const labelMode = opts?.labelMode ?? "segmentIndex";
    const labelOffsetMul = opts?.labelOffset ?? 0.9;

    // Build "weights"
    let weights: number[];
    if (Array.isArray(partsOrSegments)) {
        weights = partsOrSegments.slice();
    } else {
        const n = Math.floor(partsOrSegments);
        if (!n || n <= 0) return;
        weights = new Array(n).fill(1);
    }

    // sanitize weights
    weights = weights.map(w => (Number.isFinite(w) ? w : 0)).filter(w => w > 0);
    if (weights.length === 0) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;

    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;

    const halfT = thickness / 2;

    const total = weights.reduce((a, b) => a + b, 0);
    const unit = len / total; // length per "part"

    if (outlineOn) {
        const outline = g.append("g").attr("class", "boxline-outline").attr("data-decoration", "");
        outline.append("line")
            .attr("x1", start.x + nx * halfT)
            .attr("y1", start.y + ny * halfT)
            .attr("x2", end.x + nx * halfT)
            .attr("y2", end.y + ny * halfT)
            .attr("stroke", "rgba(0,0,0,0.25)")
            .attr("stroke-width", 1)
            .attr("vector-effect", "non-scaling-stroke");

        outline.append("line")
            .attr("x1", start.x - nx * halfT)
            .attr("y1", start.y - ny * halfT)
            .attr("x2", end.x - nx * halfT)
            .attr("y2", end.y - ny * halfT)
            .attr("stroke", "rgba(0,0,0,0.25)")
            .attr("stroke-width", 1)
            .attr("vector-effect", "non-scaling-stroke");
    }

    const segGroup = g.append("g").attr("class", "boxline-segments").attr("data-decoration", "");
    const textGroup = ui.append("g").attr("class", "boxline-labels");

    // running distance along the line
    let cursor = 0;

    for (let i = 0; i < weights.length; i++) {
        const w = weights[i];
        const segLen = w * unit;

        const a = cursor;
        const b = cursor + segLen;

        const ax = start.x + ux * a;
        const ay = start.y + uy * a;
        const bx = start.x + ux * b;
        const by = start.y + uy * b;

        const p1 = { x: ax + nx * halfT, y: ay + ny * halfT };
        const p2 = { x: bx + nx * halfT, y: by + ny * halfT };
        const p3 = { x: bx - nx * halfT, y: by - ny * halfT };
        const p4 = { x: ax - nx * halfT, y: ay - ny * halfT };

        const fill = (i % 2 === 0) ? color1 : color2;

        segGroup.append("path")
            .attr("d", `M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} Z`)
            .attr("fill", fill)
            .attr("stroke", "rgba(0,0,0,0.15)")
            .attr("stroke-width", 1)
            .attr("vector-effect", "non-scaling-stroke")
            .attr('opacity', 0.25);;

        if (tickMode === "boundaries") {
            // boundary tick at start of segment (skip i=0 if you don't want it)
            const tx = ax;
            const ty = ay;
            segGroup.append("line")
                .attr("x1", tx + nx * halfT)
                .attr("y1", ty + ny * halfT)
                .attr("x2", tx - nx * halfT)
                .attr("y2", ty - ny * halfT)
                .attr("stroke", "rgba(0,0,0,0.35)")
                .attr("stroke-width", 1)
                .attr("vector-effect", "non-scaling-stroke");
        }

        if (label) {
            const cx = (ax + bx) / 2;
            const cy = (ay + by) / 2;
            const lx = cx + nx * (thickness * labelOffsetMul);
            const ly = cy + ny * (thickness * labelOffsetMul);

            const txt =
                labelMode === "segmentWeight"
                    ? String(w)           // shows 3,4,3
                    : String(i + 1);      // shows 1,2,3

            textGroup.append("text")
                .attr("x", lx)
                .attr("y", -ly)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("font-size", 12)
                .attr("fill", "rgba(0,0,0,0.75)")
                .style("user-select", "none")
                .text(txt);
        }

        cursor = b;
    }

    // final tick at end
    if (tickMode === "boundaries") {
        segGroup.append("line")
            .attr("x1", end.x + nx * halfT)
            .attr("y1", end.y + ny * halfT)
            .attr("x2", end.x - nx * halfT)
            .attr("y2", end.y - ny * halfT)
            .attr("stroke", "rgba(0,0,0,0.35)")
            .attr("stroke-width", 1)
            .attr("vector-effect", "non-scaling-stroke");
    }
}

export const renderDashLine = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    color = "black",
    width = 1,
    dash = "4,4",
    long = false
) => (g: any, ui: any) => {
    // deep copy the start and end arguments to prevent mutating the caller's data when extending the line
    start = { x: start.x, y: start.y };
    end = { x: end.x, y: end.y };


    if (long) {
        // extend line far beyond start and end points, 5000mm should be enough
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 1e-6) {
            const ux = dx / len;
            const uy = dy / len;
            start.x -= ux * 500;
            start.y -= uy * 500;
            end.x += ux * 500;
            end.y += uy * 500;
        }
    }


    g.append("line")
        .attr("x1", start.x)
        .attr("y1", start.y)
        .attr("x2", end.x)
        .attr("y2", end.y)
        .attr("stroke", color)
        .attr("stroke-width", width)
        .attr("stroke-dasharray", dash)
        .attr("vector-effect", "non-scaling-stroke");
}

export const renderDashLineMxB = (line: Line,  
    color = "black",
    width = 1,
    dash = "4,4", 
) => (g: any, ui: any) => {
    // pick start and end points that are very large along the line
    const starty = line.m * (-3000) + line.y;
    const endy = line.m * 3000 + line.y;
    const startx = (-3000 - line.y) / line.m;
    const endx = (3000 - line.y) / line.m;

    const startPt = { x: startx, y: starty };
    const endPt = { x: endx, y: endy };

    g.append("line")
        .attr("x1", startPt.x)
        .attr("y1", startPt.y)
        .attr("x2", endPt.x)
        .attr("y2", endPt.y)
        .attr("stroke", color)
        .attr("stroke-width", width)
        .attr("stroke-dasharray", dash)
        .attr("vector-effect", "non-scaling-stroke");
}

export const renderPath = (path: string, color: string, strokeWidth: number = 2, opacity: number = 1, dash?: string) => (g: any, ui: any) => {
    const el = g.append("path")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity)
        .attr('vector-effect', 'non-scaling-stroke');
    if (dash) el.attr("stroke-dasharray", dash);
};

/** A closed shape from its corners, in order — the drafting-table equivalent of connecting the
 * dots and closing back to the first one. Unfilled by default; pass `fill` for a solid shape. */
export const renderPolygon = (points: Pt[], color: string, strokeWidth: number = 2, opacity: number = 1, fill: string = "none") => (g: any, ui: any) => {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
    g.append("path")
        .attr("d", d)
        .attr("fill", fill)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity)
        .attr('vector-effect', 'non-scaling-stroke');
};

/** Plain centered label at a drafting point, upright regardless of the canvas Y-flip (and rotation, if given). */
export const renderText = (P: Pt, label: string, color: string = 'black', fontSize: number = 5, rotationDeg: number = 0) => (g: any, ui: any) => {
    ui.append("text")
        .text(label)
        .attr("transform", `translate(${P.x},${-P.y}) rotate(${-rotationDeg})`)
        .attr("fill", color)
        .attr("font-size", fontSize)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("vector-effect", "non-scaling-stroke");
};

export const renderFilledPath = (path: string, fill: string, opacity: number = 0.15, fillRule: 'evenodd' | 'nonzero' = 'evenodd') => (g: any, ui: any) => {
    g.append("path")
        .attr("d", path)
        .attr("fill", fill)
        .attr("fill-rule", fillRule)
        .attr("fill-opacity", opacity)
        .attr("stroke", "none")
        .attr("vector-effect", "non-scaling-stroke");
};

export const renderCircle = (C: Circle, color: string, mirrorY?: boolean, dash?: string) => (g: any, ui: any) => {
    g.append('circle')
        .attr('cx', C.x)
        .attr('cy', C.y)
        .attr('r', Math.abs(C.r))
        .attr('stroke', color)
        .attr('fill', 'none')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', dash ?? null)
        .attr('vector-effect', 'non-scaling-stroke');

    if (mirrorY) {
        g.append('circle')
            .attr('cx', -C.x)
            .attr('cy', C.y)
            .attr('r', Math.abs(C.r))
            .attr('stroke', color)
            .attr('fill', 'none')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', dash ?? null)
            .attr('vector-effect', 'non-scaling-stroke');
    }
}

export const renderSegment = (P: Pt, Q: Pt, color: string, strokeWidth: number = 1, opacity: boolean = false) => (g: any, ui: any) => {
    g.append("line")
        .attr("x1", Q.x)
        .attr("y1", Q.y)
        .attr("x2", P.x)
        .attr("y2", P.y)
        .attr("stroke", color)
        .attr('stroke-width', strokeWidth)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', opacity ? 0.25 : 1);
}

export const renderLine = (line: Line, color: string, strokeWidth: number = 1, opacity: boolean = false) => (g: any, ui: any) => {
    let lineStartAtHighValue: Pt = { x: line.x -1000, y: line.y - 1000 * line.m };
    let lineEndAtLowValue: Pt = { x: line.x + 1000, y: line.y + 1000 * line.m }; 
    g.append("line")
        .attr("x1", lineStartAtHighValue.x)
        .attr("y1", lineStartAtHighValue.y)
        .attr("x2", lineEndAtLowValue.x)
        .attr("y2", lineEndAtLowValue.y)
        .attr("stroke", color)
        .attr('stroke-width', strokeWidth)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', opacity ? 0.25 : 1);
}

// 1) Crosshair point marker (+ optional dot)
export const renderCrosshair = (
    P: Pt,
    color: string,
    size: number = 1.5,          // half-length of crosshair arms in px
    strokeWidth: number = 2,
    opacity: number = 1,
    showDot: boolean = false,
    dotR: number = 2
) => (g: any, ui: any) => {
    // data-decoration: not geometry — the scene index (draft-canvas/tools/scene-index.ts) skips
    // anything under it, so a crosshair or halo can't be selected as if it were a drawn shape
    const grp = g.append("g")
        .attr("class", "draft-crosshair")
        .attr("data-decoration", "")
        .attr("transform", `translate(${P.x},${P.y})`)
        .attr("opacity", opacity);

    // horizontal arm
    grp.append("line")
        .attr("x1", -size).attr("y1", 0)
        .attr("x2", size).attr("y2", 0)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("vector-effect", "non-scaling-stroke");

    // vertical arm
    grp.append("line")
        .attr("x1", 0).attr("y1", -size)
        .attr("x2", 0).attr("y2", size)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("vector-effect", "non-scaling-stroke");

    if (showDot) {
        grp.append("circle")
            .attr("cx", 0).attr("cy", 0).attr("r", dotR)
            .attr("fill", color)
            .attr("vector-effect", "non-scaling-stroke");
    }
};

// smaller than renderCrosshair's default 3mm, which dwarfs a feature like an f-hole eye
export const renderSmallCrosshair = (P: Pt, color: string, opacity: number = 1) =>
    renderCrosshair(P, color, 0.8, 1, opacity);

// 2) Labeled point (uses crosshair under the hood)
export const renderPointLabel = (
    P: Pt,
    label: string,
    color: string,
    offset: Pt = { x: 10, y: -10 },
    fontSize: number = 12,
    bg: boolean = true
) => (g: any, ui: any) => {
    // marker
    renderCrosshair(P, color, 7, 2, 1, true, 2)(g, ui);

    // draw label in UI layer (y is flipped there) so text remains rightside up
    const grp = ui.append("g")
        .attr("class", "draft-point-label")
        .attr("transform", `translate(${P.x + offset.x},${-(P.y + offset.y)})`);

    if (bg) {
        // crude background "pill" without measuring text: good enough for drafting UI
        grp.append("rect")
            .attr("x", -4).attr("y", -fontSize)
            .attr("width", Math.max(22, label.length * (fontSize * 0.62)))
            .attr("height", fontSize + 6)
            .attr("rx", 4).attr("ry", 4)
            .attr("fill", "black")
            .attr("opacity", 0.35);
    }

    grp.append("text")
        .text(label)
        .attr("x", 0)
        .attr("y", 0)
        .attr("fill", color)
        .attr("font-size", fontSize)
        .attr("dominant-baseline", "alphabetic")
        .attr("vector-effect", "non-scaling-stroke");
};

// 3) Dashed construction line (for guides)
export const renderDashedLine = (
    P: Pt,
    Q: Pt,
    color: string,
    dash: string = "6 6",
    strokeWidth: number = 2,
    opacity: number = 0.5
) => (g: any, ui: any) => {
    g.append("line")
        .attr("x1", Q.x).attr("y1", Q.y)
        .attr("x2", P.x).attr("y2", P.y)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("stroke-dasharray", dash)
        .attr("opacity", opacity)
        .attr("vector-effect", "non-scaling-stroke");
};

export const renderRectFromPt = (P1: Pt, P2: Pt , fill: string, stroke: string) => (g: any, ui: any) => {
    const x = Math.min(P1.x, P2.x);
    const y = Math.min(P1.y, P2.y);
    const w = Math.abs(P2.x - P1.x);
    const h = Math.abs(P2.y - P1.y);
    g.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', w)
        .attr('height', h)
        .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', 1)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', 0.25);
}

export const renderRect = (rect: Rectangle, color: string, fill: string = "none", strokeWidth: number = 1, dash?: string) => (g: any, ui: any) => {
    const x = Math.min(rect.Pt1.x, rect.Pt2.x);
    const y = Math.min(rect.Pt1.y, rect.Pt2.y);
    const w = Math.abs(rect.Pt2.x - rect.Pt1.x);
    const h = Math.abs(rect.Pt2.y - rect.Pt1.y);

    g.append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", w)
        .attr("height", h)
        .attr("fill", fill)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("stroke-dasharray", dash ?? null)
        .attr("vector-effect", "non-scaling-stroke");
}

/**
 * Renders an angle indicator on a circle showing the angle (theta) at which
 * an inner circle is inscribed within the outer circle.
 *
 * Draws:
 *   • A short reference ray from the center toward 0° (right)
 *   • An arc sweep from 0° to theta, radius = ~40% of the outer circle radius
 *   • A radial line from the center to the contact/tangent point on the circle edge
 *   • A dot at the contact point
 *   • A label at the midpoint of the arc showing the angle in degrees
 */
export const renderCircleAngleIndicator = (
    outerCircle: Circle,
    thetaDeg: number,
    color: string,
    label?: string
) => (g: any, ui: any) => {
    thetaDeg = ((thetaDeg % 360) + 360) % 360; // normalize to [0,360)

    const thetaRad = thetaDeg * TURN.degree;
    const cx = outerCircle.x;
    const cy = outerCircle.y;
    const R = outerCircle.r;
    const arcR = R * 0.1;   // radius of the angle-indicator arc

    // Contact point where the inner circle is tangent to the outer circle
    const contactX = cx + R * Math.cos(thetaRad);
    const contactY = cy + R * Math.sin(thetaRad);

    // Reference ray endpoint (toward 0° / east)
    const refX = cx + arcR;
    const refY = cy;

    // Arc endpoint at theta
    const arcEndX = cx + arcR * Math.cos(thetaRad);
    const arcEndY = cy + arcR * Math.sin(thetaRad);

    // Determine large-arc and sweep flags (SVG arc notation)
    const absDeg = ((thetaDeg % 360) + 360) % 360;
    const largeArc = absDeg > 180 ? 1 : 0;
    // thetaRad > 0 means counter-clockwise in math convention → sweep-flag 1 in SVG (positive direction)
    const sweep = thetaRad >= 0 ? 1 : 0;

    // Radial line from center to contact point
    g.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", contactX).attr("y2", contactY)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.8)
        .attr("vector-effect", "non-scaling-stroke");

    // Reference ray (0° direction)
    g.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", refX).attr("y2", refY)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.5)
        .attr("vector-effect", "non-scaling-stroke");

    // Arc sweep
    g.append("path")
        .attr("d", `M ${refX},${refY} A ${arcR},${arcR} 0 ${largeArc},${sweep} ${arcEndX},${arcEndY}`)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("opacity", 0.85)
        .attr("vector-effect", "non-scaling-stroke");

    // Dot at the contact point
    g.append("circle")
        .attr("cx", contactX).attr("cy", contactY).attr("r", .5)
        .attr("fill", color)
        .attr("vector-effect", "non-scaling-stroke");

    // Label at the arc midpoint (half the angle)
    const textAngle = thetaRad  - TURN.half;
    const labelR = arcR * 4;
    const lx = cx + labelR * Math.cos(textAngle);
    const ly = cy + labelR * Math.sin(textAngle);
    const displayLabel = label ?? `${thetaDeg}°`;

    ui.append("text")
        .text(displayLabel)
        .attr("x", lx)
        .attr("y", -ly)      // ui layer has y flipped
        .attr("fill", color)
        .attr("font-size", 3)
        .attr("font-weight", "bold")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .style("user-select", "none");
};

export const renderRectRoundedCorners = (rect: Rectangle, r: number, color: string, fill: string = "none", strokeWidth: number = 1) => (g: any, ui: any) => {
    const x = Math.min(rect.Pt1.x, rect.Pt2.x);
    const y = Math.min(rect.Pt1.y, rect.Pt2.y);
    const w = Math.abs(rect.Pt2.x - rect.Pt1.x);
    const h = Math.abs(rect.Pt2.y - rect.Pt1.y);

    g.append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", w)
        .attr("height", h)
        .attr("rx", r)
        .attr("ry", r)
        .attr("fill", fill)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("vector-effect", "non-scaling-stroke");
}   

export const renderArcFromArc = (arc: Arc, color: string, strokeWidth: number = 1, longArc = false) => (g: any, ui: any) => {
    const cx = arc.x;
    const cy = arc.y;
    const r = Math.abs(arc.r);

    if (!Number.isFinite(r) || r <= 1e-9) return;

    const start = normalizeRadians(arc.start);
    const end = normalizeRadians(arc.end);

    const deltaCCW = normalizeRadians(end - start);
    if (deltaCCW <= 1e-9) return;

    // Default behavior: draw shorter arc.
    // If longArc=true, draw the complementary (longer) arc instead.
    const useCCW = longArc ? deltaCCW > TURN.half : deltaCCW <= TURN.half;
    const span = useCCW ? deltaCCW : TURN.full - deltaCCW;
    const largeArcFlag = span > TURN.half ? 1 : 0;
    const sweepFlag = useCCW ? 1 : 0;

    const sx = cx + r * Math.cos(start);
    const sy = cy + r * Math.sin(start);
    const ex = cx + r * Math.cos(end);
    const ey = cy + r * Math.sin(end);

    g.append("path")
        .attr("d", `M ${sx},${sy} A ${r},${r} 0 ${largeArcFlag},${sweepFlag} ${ex},${ey}`)
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("fill", "none")
        .attr("vector-effect", "non-scaling-stroke");
}

// this just has some display features that will help the user understand what is going on
export const renderArcFromArcFancy = (arc: Arc, color: string, longArc = false) => (g: any, ui: any) => {
    let start: Pt = pointOnCircle(arc, arc.start);
    let end: Pt = pointOnCircle(arc, arc.end);

    // main arc
    renderArcFromArc(arc, color, 2, longArc)(g, ui);
    renderDashLine(arc, start, color)(g, ui);
    renderDashLine(arc, end, color)(g, ui);
    renderSmallCrosshair(arc, color)(g, ui);

}

export const renderArcHalo = (arc: Arc, color: string, haloWidth = 12, opacity = .33, longArc = false) => (g: any, ui: any) => {
    const group = g.append("g").attr("opacity", opacity).attr("data-decoration", "");
    renderArcFromArc(arc, color, haloWidth, longArc)(group, ui);
}

export const renderSegmentHalo = (P: Pt, Q: Pt, color: string, haloWidth = 12, opacity = .33) => (g: any, ui: any) => {
    const group = g.append("g").attr("opacity", opacity).attr("data-decoration", "");
    renderSegment(P, Q, color, haloWidth)(group, ui);
}

/**
 * Point counterpart of {@link renderArcHalo}: a soft disc marking a single
 * location rather than a traced curve. `haloR` is in user (mm) units, so the
 * halo scales with the drawing and stays proportionate to the crosshair it
 * sits behind.
 */
export const renderPointHalo = (P: Pt, color: string, haloR = 3, opacity = .33) => (g: any, ui: any) => {
    g.append("circle")
        .attr("data-decoration", "")
        .attr("cx", P.x)
        .attr("cy", P.y)
        .attr("r", haloR)
        .attr("fill", color)
        .attr("opacity", opacity);
}
export const renderSolveFailures = (failures: SolveFailure[], color: string, mirrorY = false) => (g: any, ui: any) => {
    for (let failure of failures) {
        for (let circle of failure.circles) {
            renderCircle(circle, color, mirrorY, DASH.hidden)(g, ui);
        }
        for (let [a, b] of failure.segments) {
            renderDashedLine(a, b, color, DASH.hidden, 2, 1)(g, ui);
            if (mirrorY) renderDashedLine({ x: -a.x, y: a.y }, { x: -b.x, y: b.y }, color, DASH.hidden, 2, 1)(g, ui);
        }
        for (let point of failure.points ?? []) {
            renderCrosshair(point, color, 4)(g, ui);
            if (mirrorY) renderCrosshair({ x: -point.x, y: point.y }, color, 4)(g, ui);
        }
    }
}

// guide marks: a datum line, a knot crosshair and a capped dimension. Sized in mm so they zoom with
// the drawing; small, against an arch 10-17mm over a plate several hundred long
const CROSS_MM = 0.8;
const TICK_MM = 0.8;
const LABEL_MM = 2.6;
const LABEL_GAP_MM = CROSS_MM + LABEL_MM * 0.75;

// the level a run of measures counts from. Dotted: a datum, not an edge
export const renderGuideBaseline = (from: Pt, to: Pt, color: string) =>
  renderDashedLine(from, to, color, '1 3', STROKE_WEIGHT.guide, 0.55);

export const renderGuideKnot = (at: Pt, color: string) =>
  renderCrosshair(at, color, CROSS_MM, STROKE_WEIGHT.guide, 0.9);

// a capped dimension from `base` to `at`, labelled with the distance between them unless `value` is
// given. `offset` parks the dimension line that far off the measurement along its perpendicular,
// with extension lines back to the points, for measures that sit on top of an edge
export const renderGuideMeasure = (base: Pt, at: Pt, color: string, offset = 0, value?: number) => (g: any, ui: any): void => {
  const dx = at.x - base.x;
  const dy = at.y - base.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;

  const line = (a: Pt, b: Pt, opacity: number) => g.append('line')
    .attr('x1', a.x).attr('y1', a.y).attr('x2', b.x).attr('y2', b.y)
    .attr('stroke', color)
    .attr('stroke-width', STROKE_WEIGHT.guide)
    .attr('opacity', opacity)
    .attr('vector-effect', 'non-scaling-stroke');

  const from = { x: base.x + nx * offset, y: base.y + ny * offset };
  const to = { x: at.x + nx * offset, y: at.y + ny * offset };

  if (offset) {
    line(base, from, 0.3);
    line(at, to, 0.3);
  }
  line(from, to, 0.5);

  for (const P of [from, to]) {
    g.append('line')
      .attr('x1', P.x + nx * TICK_MM).attr('y1', P.y + ny * TICK_MM)
      .attr('x2', P.x - nx * TICK_MM).attr('y2', P.y - ny * TICK_MM)
      .attr('stroke', color)
      .attr('stroke-width', STROKE_WEIGHT.guide)
      .attr('opacity', 0.5)
      .attr('vector-effect', 'non-scaling-stroke');
  }

  // the label sits past the far end on the measure's own axis, clear of the curve and the next
  // knot's label. The ui layer is not Y-flipped, so the text stays upright
  const alongX = Math.abs(ux) > Math.abs(uy);
  ui.append('text')
    .text(`${(value ?? len).toFixed(1)}mm`)
    .attr('x', to.x + ux * LABEL_GAP_MM)
    .attr('y', -(to.y + uy * LABEL_GAP_MM))
    .attr('fill', color)
    .attr('font-size', LABEL_MM)
    .attr('text-anchor', alongX ? (ux > 0 ? 'start' : 'end') : 'middle')
    .attr('dominant-baseline', 'central')
    .attr('opacity', 0.9);
};

export type StrokeShape = { d: string } | { line: [Pt, Pt] } | { polygon: Pt[] };

export const renderStroke = (stroke: StrokeShape & { weight: number }, color: string) =>
    'line' in stroke ? renderSegment(stroke.line[0], stroke.line[1], color, stroke.weight)
        : 'polygon' in stroke ? renderPolygon(stroke.polygon, color, stroke.weight)
            : renderPath(stroke.d, color, stroke.weight);
