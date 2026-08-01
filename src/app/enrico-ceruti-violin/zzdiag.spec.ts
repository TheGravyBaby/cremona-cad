import { calculateCenterBout, calculateCorners, calculateMainBouts, calculateOuterArcs } from './ceruti-calcs';
import { defaultArchingParams } from './ceruti-arching';
import { buildPlateSurfaceModel, stationChordsAt, topSurfaceZAt } from './ceruti-surface';
import { defaultGougedFlutingParams } from './ceruti-gouged';
import { DefaultParams, EnricoCerutiParams } from './ceruti-types';

describe('cap diagnosis', () => {
  it('locates the worst jump per x column', () => {
    const p: EnricoCerutiParams = JSON.parse(JSON.stringify(DefaultParams));
    calculateMainBouts(p); calculateCorners(p); calculateCenterBout(p); calculateOuterArcs(p);
    p.arching = defaultArchingParams(p.height);
    for (const side of ['top', 'bottom'] as const) {
      p.arching[side].gougedFluting = defaultGougedFlutingParams(p);
      p.arching[side].gougedCross = { type: 'gouged', points: [{ x: -0.34, z: 0.5, mirror: true }] };
    }
    const model = buildPlateSurfaceModel(p, 'top')!;
    const xs = [0, 20, 40, 60];

    const worst = (step: number) => {
      const out = xs.map(() => ({ jump: 0, y: 0 }));
      const prev: (number | null)[] = xs.map(() => null);
      for (let y = 4; y <= p.height - 4; y += step) {
        const c = stationChordsAt(p, model, y);
        xs.forEach((x, i) => {
          const z = topSurfaceZAt(p, model, x, y, c);
          if (z === null) { prev[i] = null; return; }
          const b = prev[i];
          if (b !== null && Math.abs(z - b) > out[i].jump) out[i] = { jump: Math.abs(z - b), y };
          prev[i] = z;
        });
      }
      return out;
    };

    const coarse = worst(0.5);
    const fine = worst(0.125);
    const rows = xs.map((x, i) =>
      `x=${x}: coarse ${coarse[i].jump.toFixed(3)}@y=${coarse[i].y.toFixed(2)}` +
      ` | fine ${fine[i].jump.toFixed(3)}@y=${fine[i].y.toFixed(2)}` +
      ` | ratio ${(fine[i].jump / coarse[i].jump).toFixed(2)}${fine[i].jump < coarse[i].jump * 0.4 ? '' : '  <-- FAILS'}`);
    expect(rows.join('\n')).toBe('');
  }, 300_000);
});
