import { DraftToolHost } from './draft-tool';
import { DraftShape } from './toolbox-shape';

export type FakeToolHost = DraftToolHost & { added: DraftShape[]; replaced: DraftShape[] };

// for specs: nothing snapped, nothing selected, no modifier held, and 1 px to the mm so a
// click-versus-drag threshold reads in mm. `added` and `replaced` collect what the tool commits.
export function fakeToolHost(overrides: Partial<DraftToolHost> = {}): FakeToolHost {
  const added: DraftShape[] = [];
  const replaced: DraftShape[] = [];
  return {
    added,
    replaced,
    addShape: s => { added.push(s); },
    requestDraw: () => { },
    getSnapTangent: () => undefined,
    isAngleLockHeld: () => false,
    isTangentLockHeld: () => false,
    getSelectedShapes: () => [],
    getPxPerMm: () => 1,
    hitTestShape: () => null,
    curveAt: () => null,
    selectShape: () => { },
    removeShape: () => { },
    replaceShapes: (edits, extra) => { replaced.push(...edits); added.push(...extra); },
    returnToSelect: () => { },
    ...overrides,
  };
}
