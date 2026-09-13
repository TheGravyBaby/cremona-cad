import { stepAmountForKey } from './stepSize';

describe('stepAmountForKey', () => {
  it('is 1 with no modifiers', () => {
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe(1);
  });

  it('is 10 with shift', () => {
    expect(stepAmountForKey({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe(10);
  });

  it('is 0.1 with ctrl or meta', () => {
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe(0.1);
    expect(stepAmountForKey({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe(0.1);
  });

  it('shift wins if somehow held alongside ctrl/meta', () => {
    expect(stepAmountForKey({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe(10);
  });
});
