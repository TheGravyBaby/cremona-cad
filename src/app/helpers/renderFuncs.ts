import { Pt, Circle, Line, Rectangle } from "../models/types";

export const renderDistanceMeasurementLine = (P: Pt, Q: Pt, label: string, color: string) => (g: any, ui: any) => {
    const dx = Q.x - P.x;
    const dy = Q.y - P.y;
    const len = Math.hypot(dx, dy) || 1;

    // unit direction + normal
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    // main line
    g.append("line")
        .attr("x1", P.x).attr("y1", P.y)
        .attr("x2", Q.x).attr("y2", Q.y)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke")
        .attr("opacity", 0.75);

    // ticks at ends (perpendicular)
    const tickSize = 4;
    const tick = (A: Pt) => {
        g.append("line")
            .attr("x1", A.x + nx * tickSize).attr("y1", A.y + ny * tickSize)
            .attr("x2", A.x - nx * tickSize).attr("y2", A.y - ny * tickSize)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("vector-effect", "non-scaling-stroke");
    };
    tick(P); tick(Q);

    // label at midpoint, nudged along normal
    const mx = (P.x + Q.x) / 2 + nx * -10;
    const my = (P.y + Q.y) / 2 + ny * -10;
    
    
    if (label) {
        ui.append("text")
            .text(label)
            .attr("x", mx)
            .attr("y", -my)
            .attr("fill", color)
            .attr("font-size", 12)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central");
        }

   
};

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
        const outline = g.append("g").attr("class", "boxline-outline");
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

    const segGroup = g.append("g").attr("class", "boxline-segments");
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
    const starty = line.m * (-3000) + line.b;
    const endy = line.m * 3000 + line.b;
    const startx = (-3000 - line.b) / line.m;
    const endx = (3000 - line.b) / line.m;

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

export const renderPath = (path: string, color: string, strokeWidth: number = 2, opacity: number = 1) => (g: any, ui: any) => {
    g.append("path")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", strokeWidth)
        .attr("opacity", opacity)
        .attr('vector-effect', 'non-scaling-stroke');;
};

export const renderCircle = (C: Circle, color: string) => (g: any, ui: any) => {
    g.append('circle')
        .attr('cx', C.x)
        .attr('cy', C.y)
        .attr('r', C.r)
        .attr('stroke', color)
        .attr('fill', 'none')
        .attr('stroke-width', 1)
        .attr('vector-effect', 'non-scaling-stroke');
}

export const renderLine = (P: Pt, Q: Pt, color: string, opacity: boolean = false) => (g: any, ui: any) => {
    g.append("line")
        .attr("x1", Q.x)
        .attr("y1", Q.y)
        .attr("x2", P.x)
        .attr("y2", P.y)
        .attr("stroke", color)
        .attr('stroke-width', 1)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', opacity ? 0.25 : 1);
}

// 1) Crosshair point marker (+ optional dot)
export const renderCrosshair = (
    P: Pt,
    color: string,
    size: number = 3,          // half-length of crosshair arms in px
    strokeWidth: number = 2,
    opacity: number = 1,
    showDot: boolean = false,
    dotR: number = 2
) => (g: any, ui: any) => {
    const grp = g.append("g")
        .attr("class", "draft-crosshair")
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

    const grp = g.append("g")
        .attr("class", "draft-point-label")
        .attr("transform", `translate(${P.x + offset.x},${P.y + offset.y})`);

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

// 4) Measurement between two points: end ticks + label at midpoint
export const renderMeasure = (
    P: Pt,
    Q: Pt,
    label: string,
    color: string,
    tickSize: number = 6,
    fontSize: number = 12,
    offset: number = -10 // offset label along the normal
) => (g: any, ui: any) => {
    const dx = Q.x - P.x;
    const dy = Q.y - P.y;
    const len = Math.hypot(dx, dy) || 1;

    // unit direction + normal
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    // main line
    g.append("line")
        .attr("x1", P.x).attr("y1", P.y)
        .attr("x2", Q.x).attr("y2", Q.y)
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("vector-effect", "non-scaling-stroke")
        .attr("opacity", 0.75);

    // ticks at ends (perpendicular)
    const tick = (A: Pt) => {
        g.append("line")
            .attr("x1", A.x + nx * tickSize).attr("y1", A.y + ny * tickSize)
            .attr("x2", A.x - nx * tickSize).attr("y2", A.y - ny * tickSize)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("vector-effect", "non-scaling-stroke");
    };
    tick(P); tick(Q);

    // label at midpoint, nudged along normal
    const mx = (P.x + Q.x) / 2 + nx * offset;
    const my = (P.y + Q.y) / 2 + ny * offset;

    g.append("text")
        .text(label)
        .attr("x", mx)
        .attr("y", my)
        .attr("fill", color)
        .attr("font-size", fontSize)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
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

export const renderRect = (rect: Rectangle, color: string, fill: string = "none", strokeWidth: number = 1) => (g: any, ui: any) => {
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
    // normalize angle to [0, 360)
    thetaDeg = ((thetaDeg % 360) + 360) % 360;

    const thetaRad = thetaDeg * Math.PI / 180;
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
    const textAngle = thetaRad  - Math.PI;
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

export function greyOutColor(color: string, degree: number): string {
    // clamp degree to [0,1]
    degree = Math.max(0, Math.min(1, Number.isFinite(degree) ? degree : 0.5));

    const s = color.trim();

    // helpers
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");

    // parse hex (#rgb or #rrggbb)
    const hexShort = /^#([0-9a-f]{3})$/i.exec(s);
    const hexLong = /^#([0-9a-f]{6})$/i.exec(s);
    if (hexShort || hexLong) {
        let r: number, g: number, b: number, a = 1;
        if (hexShort) {
            const [r1, g1, b1] = hexShort[1].split("");
            r = parseInt(r1 + r1, 16);
            g = parseInt(g1 + g1, 16);
            b = parseInt(b1 + b1, 16);
        } else {
            r = parseInt(hexLong![1].substr(0, 2), 16);
            g = parseInt(hexLong![1].substr(2, 2), 16);
            b = parseInt(hexLong![1].substr(4, 2), 16);
        }
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const nr = clamp(r * (1 - degree) + lum * degree);
        const ng = clamp(g * (1 - degree) + lum * degree);
        const nb = clamp(b * (1 - degree) + lum * degree);
        // preserve hex output when fully opaque
        return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    }

    // parse rgb/rgba()
    const rgbMatch = /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(s);
    if (rgbMatch) {
        const r = clamp(Number(rgbMatch[1]));
        const g = clamp(Number(rgbMatch[2]));
        const b = clamp(Number(rgbMatch[3]));
        const a = rgbMatch[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgbMatch[4]))) : 1;
        const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const nr = clamp(r * (1 - degree) + lum * degree);
        const ng = clamp(g * (1 - degree) + lum * degree);
        const nb = clamp(b * (1 - degree) + lum * degree);
        return a === 1 ? `rgb(${nr}, ${ng}, ${nb})` : `rgba(${nr}, ${ng}, ${nb}, ${a})`;
    }

    // fallback: unable to parse, return original color
    return color;
}
