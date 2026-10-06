// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { CERUTI_PANEL_IDS } from '../ceruti-types';

// a blank recipeName fails the identity check on refresh and silently reverts to the default
// template — pasted-JSON has dropped it twice already, hence a test rather than a third fix.
describe('CERUTI_TEMPLATES', () => {
  it('agrees on one recipeName, so no template is a stranger to the others', () => {
    const names = new Set(CERUTI_TEMPLATES.map(t => t.recipeName));
    expect([...names]).toEqual(['enrico-ceruti-violin']);
  });

  it('keeps every template distinguishable by key', () => {
    const keys = CERUTI_TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(k => k.length > 0)).toBe(true);
  });

  // a mistyped panel id in hand-pasted JSON means the image is never drawn, silently.
  it('scopes every reference image to panels that exist', () => {
    const valid = new Set<string>(CERUTI_PANEL_IDS);
    const bad = CERUTI_TEMPLATES.flatMap(t =>
      (t.referenceImages ?? []).flatMap(img =>
        (img.panels ?? []).filter(p => !valid.has(p)).map(p => `${t.key}: ${p}`)));
    expect(bad).toEqual([]);
  });
});
