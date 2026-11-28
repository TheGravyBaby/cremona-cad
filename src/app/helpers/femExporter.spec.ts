// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildCalculixDeck, buildTriangleMesh, FemDeck } from './femExporter';
import { Pt } from '../models/types';

const square = (half: number, cx = 0, cy = 0): Pt[] => [
  new Pt(cx - half, cy - half), new Pt(cx + half, cy - half), new Pt(cx + half, cy + half), new Pt(cx - half, cy + half),
];
const area = (a: Pt, b: Pt, c: Pt): number => ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

describe('the triangle mesh', () => {
  const outer = square(50);
  const hole = square(8, 20, 10);
  const line: Pt[] = [new Pt(-30, -35), new Pt(-30, 35)];
  const mesh = buildTriangleMesh(outer, [hole], [line], 5, 2.5);

  it('covers the region and nothing else, every triangle counterclockwise', () => {
    let covered = 0;
    for (const [a, b, c] of mesh.triangles) {
      const each = area(mesh.nodes[a], mesh.nodes[b], mesh.nodes[c]);
      expect(each).toBeGreaterThan(0);
      covered += each;
    }
    expect(covered).toBeCloseTo(100 * 100 - 16 * 16, 6);
  });

  it('is one sheet with one hole in it', () => {
    const edges = new Set<string>();
    for (const [a, b, c] of mesh.triangles) {
      for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.add(`${Math.min(u, v)} ${Math.max(u, v)}`);
    }
    expect(mesh.corners - edges.size + mesh.triangles.length).toBe(0);
    expect(mesh.nodes.length).toBe(mesh.corners + edges.size);
  });

  it('keeps every edge and line as element edges, each midside halfway along its own', () => {
    expect(mesh.lost).toEqual([]);
    for (const [a, b, c, ab, bc, ca] of mesh.triangles) {
      for (const [u, v, mid] of [[a, b, ab], [b, c, bc], [c, a, ca]]) {
        expect(mesh.nodes[mid].x).toBeCloseTo((mesh.nodes[u].x + mesh.nodes[v].x) / 2, 9);
        expect(mesh.nodes[mid].y).toBeCloseTo((mesh.nodes[u].y + mesh.nodes[v].y) / 2, 9);
      }
    }
    const along = mesh.lineNodes[0].map(n => mesh.nodes[n]);
    expect(along.length % 2).toBe(1);
    expect(along[0].y).toBeCloseTo(-35, 9);
    expect(along[along.length - 1].y).toBeCloseTo(35, 9);
    for (let i = 0; i < along.length; i++) {
      expect(along[i].x).toBeCloseTo(-30, 9);
      if (i) expect(along[i].y).toBeGreaterThan(along[i - 1].y);
    }
  });

  it('follows the outline and the hole round once each, corner and midside alternating', () => {
    expect(mesh.loopNodes.length).toBe(2);
    for (const [ring, half, cx, cy] of [[mesh.loopNodes[0], 50, 0, 0], [mesh.loopNodes[1], 8, 20, 10]] as const) {
      expect(ring.length).toBeGreaterThan(0);
      expect(new Set(ring).size).toBe(ring.length);
      ring.forEach((n, k) => {
        expect(n < mesh.corners).toBe(k % 2 === 0);
        expect(Math.max(Math.abs(mesh.nodes[n].x - cx), Math.abs(mesh.nodes[n].y - cy))).toBeCloseTo(half, 9);
      });
    }
  });

  it('reports an edge it could not keep', () => {
    // a line run through the hole has nothing to be an edge of there
    const through: Pt[] = [new Pt(0, 10), new Pt(40, 10)];
    expect(buildTriangleMesh(outer, [hole], [through], 5).lost.length).toBeGreaterThan(0);
  });
});

describe('the CalculiX deck', () => {
  const deck: FemDeck = {
    heading: ['a patch'],
    nodes: [0, 1, 2, 3, 4, 5].map(i => ({ x: i, y: i * i, z: 0 })),
    thickness: [3, 3, 3, 3, 3, 3],
    normals: [0, 1, 2, 3, 4, 5].map(() => ({ x: 0, y: 0, z: 1 })),
    sets: [{ name: 'PATCH', type: 'S6', elements: [[0, 2, 4, 1, 3, 5]], material: 'WOOD', orientation: 'GRAIN', thickness: null, ownNormals: true }],
    solids: [],
    materials: [{ name: 'WOOD', density: 4e-10, E1: 12000, E2: 900, E3: 500, nu12: 0.37, nu13: 0.47, nu23: 0.43, G12: 760, G13: 730, G23: 36 }],
    orientations: [{ name: 'GRAIN', x: { x: 0, y: 1, z: 0 }, xy: { x: -1, y: 0, z: 0 } }],
    modes: 10,
  };
  const lines = buildCalculixDeck(deck).split('\n');
  const block = (keyword: string): string[] => {
    const from = lines.findIndex(l => l.startsWith(keyword));
    const rest = lines.slice(from + 1);
    const to = rest.findIndex(l => l.startsWith('*'));
    return rest.slice(0, to < 0 ? rest.length : to);
  };

  it('numbers from one, and gives every node of a nodal-thickness set a thickness and a normal', () => {
    expect(block('*NODE,').length).toBe(6);
    expect(block('*ELEMENT')).toEqual(['1, 1, 3, 5, 2, 4, 6']);
    expect(block('*NODAL THICKNESS').map(l => l.split(',')[0])).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(block('*NORMAL').length).toBe(6);
  });

  it('names a material and an orientation for every section it writes', () => {
    const section = lines.find(l => l.startsWith('*SHELL SECTION'))!;
    expect(section).toContain('NODAL THICKNESS');
    expect(lines).toContain('*MATERIAL, NAME=WOOD');
    expect(lines.some(l => l.startsWith('*ORIENTATION, NAME=GRAIN'))).toBe(true);
    expect(block('*ELASTIC').join(' ').split(',').map(Number).filter(Number.isFinite).length).toBe(9);
    expect(block('*FREQUENCY')).toEqual(['10']);
  });

  it('leaves a node with no normal to its elements, and numbers the solids on after the shells', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i * i, z: i % 3 }));
    const jointed: FemDeck = {
      ...deck,
      nodes,
      thickness: [],
      normals: nodes.map((_, i) => ({ x: 0, y: 0, z: i === 2 ? 0 : 1 })),
      sets: [{ name: 'PATCH', type: 'S6', elements: [[0, 2, 4, 1, 3, 5]], material: 'WOOD', orientation: 'GRAIN', thickness: 2, ownNormals: true }],
      solids: [
        { name: 'WEDGE', type: 'C3D15', elements: [nodes.slice(0, 15).map((_, i) => i)], material: 'WOOD', orientation: 'GRAIN' },
        { name: 'BRICK', type: 'C3D20', elements: [nodes.map((_, i) => i)], material: 'WOOD', orientation: 'GRAIN' },
      ],
    };
    const text = buildCalculixDeck(jointed).split('\n');
    const from = text.indexOf('*NORMAL');
    const normals = text.slice(from + 1, text.findIndex((l, i) => i > from && l.startsWith('*')));
    expect(normals.map(l => l.split(',')[1].trim())).toEqual(['1', '5', '2', '4', '6']);
    for (const [name, id, count] of [['WEDGE', 2, 15], ['BRICK', 3, 20]] as const) {
      const at = text.findIndex(l => l.startsWith('*ELEMENT') && l.endsWith(`ELSET=${name}`));
      const entries = `${text[at + 1]} ${text[at + 2]}`.split(',').map(Number);
      expect(entries[0]).toBe(id);
      expect(entries.slice(1)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      expect(text[at + 1].split(',').length).toBeLessThanOrEqual(16);
      expect(text[at + 2].split(',').length).toBeLessThanOrEqual(16);
      expect(text.some(l => l.startsWith(`*SOLID SECTION, ELSET=${name}, MATERIAL=WOOD`))).toBe(true);
    }
  });
});
