import { describe, it, expect } from 'vitest';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { CORPUS_TEMPLATES } from './corpus';
import { RESTRICTED_TEMPLATES } from './templates/restricted';
import { CERUTI_PANEL_IDS } from './ceruti-types';

// a blank recipeName fails the identity check on refresh and silently reverts to the default
// template — pasted-JSON has dropped it twice already, hence a test rather than a third fix.
describe('CERUTI_TEMPLATES', () => {
  it('gives every template a recipeName, so a design restores after a refresh', () => {
    const blank = CERUTI_TEMPLATES.filter(t => !t.recipeName).map(t => t.key);
    expect(blank).toEqual([]);
  });

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

// unlike the older bundled templates, these numbers can be rechecked against a public record and
// their images state what may be done with them. restricted/ is held to the same standard — it is
// separated by whether its images can ship, not by how well its provenance is documented.
const TRACED_TEMPLATES = [...CORPUS_TEMPLATES, ...RESTRICTED_TEMPLATES];

describe('TRACED_TEMPLATES', () => {
  it('is part of the bundled set', () => {
    const keys = new Set(CERUTI_TEMPLATES.map(t => t.key));
    expect(TRACED_TEMPLATES.every(t => keys.has(t.key))).toBe(true);
  });

  it('names the record every instrument was traced from', () => {
    for (const t of TRACED_TEMPLATES) {
      expect(t.meta, `${t.key} has no meta`).toBeDefined();
      expect(t.meta!.maker.length).toBeGreaterThan(0);
      expect(t.meta!.record.objectId.length).toBeGreaterThan(0);
      expect(t.meta!.record.url).toMatch(/^https?:\/\//);
    }
  });

  it('states the licence on every reference image it ships', () => {
    for (const t of TRACED_TEMPLATES) {
      for (const img of t.referenceImages ?? []) {
        expect(img.credit, `${t.key} / ${img.label} has no credit`).toBeDefined();
        expect(img.credit!.licence.length).toBeGreaterThan(0);
        expect(img.credit!.attribution.length).toBeGreaterThan(0);
      }
    }
  });

  // a plausible-looking crown on a named instrument is an invented measurement of a real object.
  it('invents no arching for a real instrument', () => {
    for (const t of TRACED_TEMPLATES) {
      expect((t.params as { arching?: unknown }).arching, `${t.key} carries arching`).toBeUndefined();
    }
  });
});
