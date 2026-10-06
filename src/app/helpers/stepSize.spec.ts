import { stepAmountForKey } from './stepSize';

describe('stepAmountForKey', () => {
  it('shift wins if somehow held alongside ctrl/meta', () => {
    expect(stepAmountForKey({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe(10);
  });
});
