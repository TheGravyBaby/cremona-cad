import { DraftToolHost } from './draft-tool';
import { DraftShape } from './toolbox-shape';

export type FakeToolHost = DraftToolHost & { added: DraftShape[] };

// for specs: nothing snapped, nothing selected, no modifier held, and 1 px to the mm so a
// click-versus-drag threshold reads in mm. `added` collects what the tool commits.
export function fakeToolHost(overrides: Partial<DraftToolHost> = {}): FakeToolHost {
  const added: DraftShape[] = [];
  return {
    added,
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
    returnToSelect: () => { },
    ...overrides,
  };
}
