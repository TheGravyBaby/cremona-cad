// Finite element export: a plan-view triangle mesh of a region with holes, and a CalculiX input deck
// (.inp, Abaqus syntax) of shell and wedge elements for a frequency step. Neither knows what is being meshed:
// the caller lifts the plan mesh onto its own surface and names the materials. Mesh, then deck.

import { Delaunay } from 'd3';
import { Pt, Pt3D, Vec3 } from '../models/types';
import { pointInPolygon, signedPolygonArea } from './math/simpleGeometry';
import { buildPolylineIndex, distPointToPolylineIndexed, pointAtPolylineLength, polylineCumulativeLengths } from './math/vibeMath';

// six-node triangles over a region in plan. The corner nodes come first, `corners` of them, then one
// midside node per edge. A triangle lists its corners counterclockwise, then the midsides of the
// edges 1-2, 2-3 and 3-1, which is the order an S6 element takes them in. `lineNodes` follows each
// line end to end, corner and midside alternating, and `loopNodes` the outline and then each hole
// the same way, round once with no repeat; `lost` holds every stretch of the outline, a
// hole or a line that the triangulation did not keep as an element edge, and is empty on a sound mesh
export interface TriangleMesh {
  nodes: Pt[];
  corners: number;
  triangles: number[][];
  lineNodes: number[][];
  loopNodes: number[][];
  lost: [Pt, Pt][];
  minAngle: number;
}

// a lattice node stands at least this share of the spacing off every edge and line, which keeps
// each of their stretches clear of other nodes, so the triangulation keeps it as an edge
const EDGE_CLEARANCE = 0.6;
// an outline turning more than this at one point has a corner there
const CORNER_TURN = Math.PI / 6;
// a triangle flatter than this share of its spacing squared is three nodes in a row along a
// straight edge, not an element
const FLAT_AREA = 1e-4;

// `outer` and `holes` are closed loops, `lines` open polylines that
// element edges must follow (a stiffener's foot). The loops and lines are stepped off evenly, the
// outline and lines at `step` and the holes at `holeStep`; a triangular lattice fills between; a
// Delaunay triangulation joins the lot, and the triangles off the region are dropped. `keep` names
// points of the outline that stay nodes however close they stand to a corner or to one another
export function buildTriangleMesh(outer: Pt[], holes: Pt[][], lines: Pt[][], step: number, holeStep = step, keep: Pt[] = []): TriangleMesh {
  outer = openLoop(outer);
  holes = holes.map(openLoop);
  let chains: { nodes: Pt[]; closed: boolean }[] = [
    { nodes: stepAlongLoop(outer, step, keep), closed: true },
    ...holes.map(hole => ({ nodes: stepAlongLoop(hole, holeStep), closed: true })),
    ...lines.map(line => ({ nodes: stepAlongLine(line, step), closed: false })),
  ];
  let pts: Pt[] = chains.flatMap(c => c.nodes);
  let chainStart: number[] = [];
  chains.reduce((at, c) => { chainStart.push(at); return at + c.nodes.length; }, 0);

  let guards = [
    { idx: buildPolylineIndex([...outer, outer[0]]), clear: EDGE_CLEARANCE * step },
    ...holes.map(hole => ({ idx: buildPolylineIndex([...hole, hole[0]]), clear: EDGE_CLEARANCE * holeStep })),
    ...lines.map(line => ({ idx: buildPolylineIndex(line), clear: EDGE_CLEARANCE * step })),
  ];
  let minX = Math.min(...outer.map(q => q.x)), maxX = Math.max(...outer.map(q => q.x));
  let minY = Math.min(...outer.map(q => q.y)), maxY = Math.max(...outer.map(q => q.y));
  let rise = step * Math.sqrt(3) / 2;
  // the lattice stands on x = 0, so a region mirrored about it is filled alike on both sides
  for (let k = 0; minY + k * rise <= maxY; k++) {
    let y = minY + k * rise;
    let shift = k % 2 ? step / 2 : 0;
    for (let i = Math.ceil((minX - shift) / step); i * step + shift <= maxX; i++) {
      let q = { x: i * step + shift, y };
      if (!pointInPolygon(q, outer) || holes.some(hole => pointInPolygon(q, hole))) continue;
      if (guards.some(g => distPointToPolylineIndexed(q, g.idx) < g.clear)) continue;
      pts.push(q);
    }
  }

  let found = Delaunay.from(pts, q => q.x, q => q.y).triangles;
  let kept: number[][] = [];
  for (let t = 0; t < found.length; t += 3) {
    let [a, b, c] = [found[t], found[t + 1], found[t + 2]];
    let area = ((pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[c].x - pts[a].x) * (pts[b].y - pts[a].y)) / 2;
    if (Math.abs(area) < FLAT_AREA * step * step) continue;
    let centre = { x: (pts[a].x + pts[b].x + pts[c].x) / 3, y: (pts[a].y + pts[b].y + pts[c].y) / 3 };
    if (!pointInPolygon(centre, outer) || holes.some(hole => pointInPolygon(centre, hole))) continue;
    kept.push(area > 0 ? [a, b, c] : [a, c, b]);
  }

  // a node left on no triangle is dropped, and the rest numbered again
  let renumber = new Map<number, number>();
  let nodes: Pt[] = [];
  for (let tri of kept) {
    for (let n of tri) {
      if (!renumber.has(n)) { renumber.set(n, nodes.length); nodes.push(pts[n]); }
    }
  }
  let corners = nodes.length;
  let { triangles, midsides } = addMidsides(nodes, kept.map(tri => tri.map(n => renumber.get(n)!)));
  let edgeKey = (a: number, b: number): number => Math.min(a, b) * corners + Math.max(a, b);

  let lost: [Pt, Pt][] = [];
  let lineNodes: number[][] = [];
  let loopNodes: number[][] = [];
  chains.forEach((chain, ci) => {
    let along: number[] = [];
    let whole = true;
    let count = chain.closed ? chain.nodes.length : chain.nodes.length - 1;
    for (let i = 0; i < count; i++) {
      let a = renumber.get(chainStart[ci] + i), b = renumber.get(chainStart[ci] + (i + 1) % chain.nodes.length);
      let mid = a !== undefined && b !== undefined ? midsides.get(edgeKey(a, b)) : undefined;
      if (mid === undefined) {
        lost.push([chain.nodes[i], chain.nodes[(i + 1) % chain.nodes.length]]);
        whole = false;
      } else {
        along.push(a!, mid);
        if (i === count - 1) along.push(b!);
      }
    }
    if (chain.closed) loopNodes.push(whole ? along.slice(0, -1) : []);
    else lineNodes.push(whole ? along : []);
  });

  let minAngle = Math.PI;
  for (let [a, b, c] of triangles) {
    for (let [o, u, v] of [[a, b, c], [b, c, a], [c, a, b]]) {
      let ux = nodes[u].x - nodes[o].x, uy = nodes[u].y - nodes[o].y, vx = nodes[v].x - nodes[o].x, vy = nodes[v].y - nodes[o].y;
      minAngle = Math.min(minAngle, Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy));
    }
  }
  return { nodes, corners, triangles, lineNodes, loopNodes, lost, minAngle };
}

// three-node triangles made six-node: a midside node pushed onto `nodes` halfway along every edge,
// one to an edge however many triangles share it. `midsides` finds an edge's by its two corners,
// the lower times the number of corners plus the higher
export function addMidsides(nodes: Pt[], corners: number[][]): { triangles: number[][]; midsides: Map<number, number> } {
  let count = nodes.length;
  let midsides = new Map<number, number>();
  let triangles = corners.map(([a, b, c]) => {
    let mids = [[a, b], [b, c], [c, a]].map(([u, v]) => {
      let key = Math.min(u, v) * count + Math.max(u, v);
      let mid = midsides.get(key);
      if (mid === undefined) {
        midsides.set(key, mid = nodes.length);
        nodes.push({ x: (nodes[u].x + nodes[v].x) / 2, y: (nodes[u].y + nodes[v].y) / 2 });
      }
      return mid;
    });
    return [a, b, c, ...mids];
  });
  return { triangles, midsides };
}

// the band between a closed chain of nodes that already stand and the outline round them: the
// outline is stepped off, and triangles zipped between the two, each step taking whichever side's
// next node makes the shorter edge across. A triangle names the chain's nodes by their place in
// it and the outline's by theirs after the chain's count, its corners counterclockwise
export function buildEdgeBand(chain: Pt[], outline: Pt[], step: number): { outer: Pt[]; triangles: number[][] } {
  let outer = stepAlongLoop(openLoop(outline), step);
  let n = chain.length, m = outer.length;
  let wayIn = Math.sign(signedPolygonArea(chain)), wayOut = Math.sign(signedPolygonArea(outer));
  let i = 0;
  let j = outer.reduce((best, q, k) => Math.hypot(q.x - chain[0].x, q.y - chain[0].y) < Math.hypot(outer[best].x - chain[0].x, outer[best].y - chain[0].y) ? k : best, 0);
  let triangles: number[][] = [];
  for (let onChain = 0, onOuter = 0; onChain < n || onOuter < m;) {
    let nextI = ((i + wayIn) % n + n) % n, nextJ = ((j + wayOut) % m + m) % m;
    let across = Math.hypot(chain[nextI].x - outer[j].x, chain[nextI].y - outer[j].y);
    let along = Math.hypot(chain[i].x - outer[nextJ].x, chain[i].y - outer[nextJ].y);
    if (onOuter >= m || (onChain < n && across <= along)) {
      triangles.push([i, n + j, nextI]);
      i = nextI;
      onChain++;
    } else {
      triangles.push([i, n + j, n + nextJ]);
      j = nextJ;
      onOuter++;
    }
  }
  let all = [...chain, ...outer];
  return {
    outer,
    triangles: triangles.map(([a, b, c]) => (all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[c].x - all[a].x) * (all[b].y - all[a].y) > 0 ? [a, b, c] : [a, c, b]),
  };
}

// a loop that repeats its first point at its end, without the repeat
function openLoop(loop: Pt[]): Pt[] {
  let first = loop[0], end = loop[loop.length - 1];
  return Math.hypot(end.x - first.x, end.y - first.y) < 1e-6 ? loop.slice(0, -1) : loop;
}

// a loop stepped off evenly between its corners, so a corner stays a node and is not cut across. A
// corner within half a step of the one before it is passed over, as the two sides of a nick are,
// unless it is one of `keep`
function stepAlongLoop(loop: Pt[], step: number, keep: Pt[] = []): Pt[] {
  let n = loop.length;
  let corners: number[] = [];
  let since = Infinity;
  for (let i = 0; i < n; i++) {
    let before = loop[(i + n - 1) % n], at = loop[i], after = loop[(i + 1) % n];
    since += Math.hypot(at.x - before.x, at.y - before.y);
    let turn = Math.abs(Math.atan2(
      (at.x - before.x) * (after.y - at.y) - (at.y - before.y) * (after.x - at.x),
      (at.x - before.x) * (after.x - at.x) + (at.y - before.y) * (after.y - at.y),
    ));
    let kept = keep.some(q => Math.hypot(q.x - at.x, q.y - at.y) < 1e-6);
    if (kept || (turn > CORNER_TURN && since >= step / 2)) { corners.push(i); since = 0; }
  }
  if (corners.length < 2) {
    let closed = [...loop, loop[0]];
    let cum = polylineCumulativeLengths(closed);
    let perimeter = cum[cum.length - 1];
    let count = Math.max(3, Math.round(perimeter / step));
    return Array.from({ length: count }, (_, k) => pointAtPolylineLength(closed, cum, k * perimeter / count));
  }
  return corners.flatMap((from, c) => {
    let to = corners[(c + 1) % corners.length];
    let side = [loop[from]];
    for (let i = (from + 1) % n; ; i = (i + 1) % n) {
      side.push(loop[i]);
      if (i === to) break;
    }
    return stepAlongLine(side, step).slice(0, -1);
  });
}

function stepAlongLine(line: Pt[], step: number): Pt[] {
  let cum = polylineCumulativeLengths(line);
  let length = cum[cum.length - 1];
  let n = Math.max(1, Math.round(length / step));
  return Array.from({ length: n + 1 }, (_, k) => pointAtPolylineLength(line, cum, k * length / n));
}

// an orthotropic material in the deck's units: mm, N, MPa, and so tonnes per cubic mm. The
// constants are in its own axes 1, 2, 3
export interface FemMaterial {
  name: string;
  density: number;
  E1: number; E2: number; E3: number;
  nu12: number; nu13: number; nu23: number;
  G12: number; G13: number; G23: number;
}

// a material's axes in the model: `x` is its 1 axis, `xy` any vector in its 1-2 plane
export interface FemOrientation {
  name: string;
  x: Vec3;
  xy: Vec3;
}

// one set of shell elements, S6 triangles or S8R quadrilaterals, each a list of indices into the
// deck's nodes in the element's own order. A null thickness reads each node's from the deck's
// `thickness`. `normals`, where a set has them, holds one for every node of the deck that the set
// stands on, and is written for every node of every element, so neighbours share one normal and
// the shell stays smooth across them, but for a node whose normal is all zeros, where each element
// keeps its own and the two are jointed. Two sets may give one node different normals, and are
// jointed there. Sets that share nodes under one normal must share a thickness there too:
// CalculiX fails on the step
export interface FemShellSet {
  name: string;
  type: 'S6' | 'S8R';
  elements: number[][];
  material: string;
  orientation: string;
  thickness: number | null;
  normals: Vec3[] | null;
}

// one set of solid elements. A C3D15 is a wedge: a six-node triangle below, its corners
// counterclockwise seen from above and then its midsides as a TriangleMesh lists them, the same
// six above, and the three nodes halfway up the corners' edges. A C3D20 is a brick: a face's four
// corners, counterclockwise seen from the face across, that face's four alike, each face's four
// midsides in turn, and the four nodes halfway between the faces' corners
export interface FemSolidSet {
  name: string;
  type: 'C3D15' | 'C3D20';
  elements: number[][];
  material: string;
  orientation: string;
}

// a glued joint between meshes that don't match: every one of `nodes` within `tolerance` of one
// of `faces` moves with the point of the face it stands over. A face is an element of a solid
// set, by its place in the set, and which of its faces as CalculiX numbers them
export interface FemTie {
  name: string;
  tolerance: number;
  nodes: number[];
  faces: { set: string; element: number; face: number }[];
}

export interface FemDeck {
  heading: string[];
  nodes: Pt3D[];
  thickness: number[];
  sets: FemShellSet[];
  solids: FemSolidSet[];
  ties: FemTie[];
  materials: FemMaterial[];
  orientations: FemOrientation[];
  // how many modes the frequency step asks for
  modes: number;
}

const num = (v: number): string => Number(v.toPrecision(8)).toString();

export function buildCalculixDeck(deck: FemDeck): string {
  let out: string[] = ['*HEADING', ...deck.heading, '** units: mm, N, MPa, tonne, s'];
  out.push('*NODE, NSET=NALL');
  deck.nodes.forEach((n, i) => out.push(`${i + 1}, ${num(n.x)}, ${num(n.y)}, ${num(n.z)}`));

  let element = 0;
  let normals: string[] = [];
  let nodal = new Set<number>();
  for (let set of deck.sets) {
    out.push(`*ELEMENT, TYPE=${set.type}, ELSET=${set.name}`);
    for (let nodes of set.elements) {
      element++;
      out.push(`${element}, ${nodes.map(n => n + 1).join(', ')}`);
      for (let n of nodes) {
        if (set.thickness === null) nodal.add(n);
        let normal = set.normals?.[n];
        if (normal && (normal.x || normal.y || normal.z)) normals.push(`${element}, ${n + 1}, ${num(normal.x)}, ${num(normal.y)}, ${num(normal.z)}`);
      }
    }
  }
  let firstOf = new Map<string, number>();
  for (let set of deck.solids) {
    out.push(`*ELEMENT, TYPE=${set.type}, ELSET=${set.name}`);
    firstOf.set(set.name, element + 1);
    for (let nodes of set.elements) {
      element++;
      // a line holds sixteen entries at most
      out.push(`${element}, ${nodes.slice(0, 8).map(n => n + 1).join(', ')},`, nodes.slice(8).map(n => n + 1).join(', '));
    }
  }
  if (nodal.size) {
    out.push('*NODAL THICKNESS');
    for (let n of [...nodal].sort((a, b) => a - b)) out.push(`${n + 1}, ${num(deck.thickness[n])}`);
  }
  if (normals.length) out.push('*NORMAL', ...normals);

  for (let o of deck.orientations) {
    out.push(`*ORIENTATION, NAME=${o.name}, SYSTEM=RECTANGULAR`);
    out.push([o.x.x, o.x.y, o.x.z, o.xy.x, o.xy.y, o.xy.z].map(num).join(', '));
  }
  for (let m of deck.materials) {
    out.push(`*MATERIAL, NAME=${m.name}`);
    out.push('*ELASTIC, TYPE=ENGINEERING CONSTANTS');
    out.push([m.E1, m.E2, m.E3, m.nu12, m.nu13, m.nu23, m.G12, m.G13].map(num).join(', ') + ',');
    out.push(num(m.G23));
    out.push('*DENSITY');
    out.push(num(m.density));
  }
  for (let set of deck.sets) {
    let nodalFlag = set.thickness === null ? ', NODAL THICKNESS' : '';
    out.push(`*SHELL SECTION, ELSET=${set.name}, MATERIAL=${set.material}, ORIENTATION=${set.orientation}${nodalFlag}`);
    // read only without the flag, but the line has to be there
    out.push(num(set.thickness ?? deck.thickness[set.elements[0][0]]));
  }
  for (let set of deck.solids) out.push(`*SOLID SECTION, ELSET=${set.name}, MATERIAL=${set.material}, ORIENTATION=${set.orientation}`);
  for (let tie of deck.ties) {
    out.push(`*NSET, NSET=${tie.name}_NODES`);
    for (let k = 0; k < tie.nodes.length; k += 12) out.push(tie.nodes.slice(k, k + 12).map(n => n + 1).join(', '));
    out.push(`*SURFACE, NAME=${tie.name}_GLUED, TYPE=NODE`, `${tie.name}_NODES`);
    out.push(`*SURFACE, NAME=${tie.name}_FACES, TYPE=ELEMENT`);
    for (let face of tie.faces) out.push(`${firstOf.get(face.set)! + face.element}, S${face.face}`);
    out.push(`*TIE, NAME=${tie.name}, POSITION TOLERANCE=${num(tie.tolerance)}`, `${tie.name}_GLUED, ${tie.name}_FACES`);
  }

  out.push('*STEP', '*FREQUENCY', String(deck.modes), '*NODE FILE', 'U', '*END STEP');
  return out.join('\n') + '\n';
}

// asks where to save and under what name; a browser with no save dialog asks for the name alone
export async function saveDeckFile(suggested: string, text: string): Promise<void> {
  let win = window as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
  if (win.showSaveFilePicker) {
    try {
      let handle = await win.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'CalculiX deck', accept: { 'text/plain': ['.inp'] } }],
      });
      let writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
      console.error('Save dialog unavailable, falling back to a download:', e);
    }
  }
  let name = prompt('Save deck as', suggested)?.trim();
  if (!name) return;
  let blob = new Blob([text], { type: 'text/plain' });
  let url = URL.createObjectURL(blob);
  let link = document.createElement('a');
  link.href = url;
  link.download = /\.inp$/i.test(name) ? name : `${name}.inp`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
