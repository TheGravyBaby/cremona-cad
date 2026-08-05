import { computeStepSize, stepAmountForKey } from './stepSize';

describe('computeStepSize', () => {
  it('scales up to a round number for large values', () => {
    // 350mm height at 2% -> 7, rounds up to the next nice number
    expect(computeStepSize(350, 1, 2)).toBe(10);
  });

  it('never goes finer than the field floor', () => {
    // rib thickness ~2.5mm at 2% -> 0.05, floored at the field's tuned 0.1
    expect(computeStepSize(2.5, 0.1, 2)).toBe(0.1);
    // overhang ~4mm at 2% -> 0.08, still floored at 0.1
    expect(computeStepSize(4, 0.1, 2)).toBe(0.1);
  });

  it('snaps to a clean multiple of the floor', () => {
    expect(computeStepSize(100, 1, 2)).toBe(2);
    expect(computeStepSize(15, 0.1, 5)).toBe(1);
  });

  it('returns 0 for a non-positive floor', () => {
    expect(computeStepSize(100, 0)).toBe(0);
  });

  it('treats negative values the same as their magnitude', () => {
    expect(computeStepSize(-350, 1, 2)).toBe(10);
  });
});

describe('stepAmountForKey', () => {
  it('scales the base step up with shift', () => {
    expect(stepAmountForKey({ shiftKey: true, ctrlKey: false, metaKey: false }, 2)).toBe(10);
  });

  it('takes the fixed fine step with ctrl or meta, ignoring baseStep', () => {
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: true, metaKey: false }, 10, 0.25)).toBe(0.25);
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: false, metaKey: true }, 10, 0.25)).toBe(0.25);
  });

  it('defaults the fine step to 1', () => {
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: true, metaKey: false }, 10)).toBe(1);
  });

  it('shift wins if somehow held alongside ctrl/meta', () => {
    expect(stepAmountForKey({ shiftKey: true, ctrlKey: true, metaKey: false }, 2)).toBe(10);
  });

  it('is a no-op with no modifiers', () => {
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: false, metaKey: false }, 2)).toBe(2);
  });
});
