import { describe, it, expect } from 'vitest';
import { CERUTI_TEMPLATES } from './ceruti-templates';
import { CORPUS_TEMPLATES } from './corpus';
import { CERUTI_PANEL_IDS } from './ceruti-types';

// A template's `recipeName` is its identity: RecipeComponentBase.loadMatchingStoredRecipe compares
// it to decide whether stored working state belongs to the open recipe, and saveToDisk writes it
// into the file. A blank one fails that check on every refresh — the design silently reverts to
// the default template — and travels on to disk in anything saved from it. The pasted-JSON
// workflow has now dropped it twice, hence a test rather than a third hand-edit.
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

  // A reference image scoped to a panel that doesn't exist is never drawn, on any panel, with
  // nothing to say why — the corpus is hand-pasted JSON, so a mistyped id is the likely mistake
  // and it fails silently. Checked across every template, not just the corpus, since a saved
  // recipe pasted in from anywhere can carry the field.
  it('scopes every reference image to panels that exist', () => {
    const valid = new Set<string>(CERUTI_PANEL_IDS);
    const bad = CERUTI_TEMPLATES.flatMap(t =>
      (t.referenceImages ?? []).flatMap(img =>
        (img.panels ?? []).filter(p => !valid.has(p)).map(p => `${t.key}: ${p}`)));
    expect(bad).toEqual([]);
  });
});

/**
 * The open-licence corpus. Empty until the first instrument lands, and these hold from the first
 * one on: what makes a corpus template different from the older bundled ones is that its numbers
 * can be rechecked against a public record and its images say what may be done with them.
 */
describe('CORPUS_TEMPLATES', () => {
  it('is part of the bundled set', () => {
    const keys = new Set(CERUTI_TEMPLATES.map(t => t.key));
    expect(CORPUS_TEMPLATES.every(t => keys.has(t.key))).toBe(true);
  });

  it('names the record every instrument was traced from', () => {
    for (const t of CORPUS_TEMPLATES) {
      expect(t.meta, `${t.key} has no meta`).toBeDefined();
      expect(t.meta!.maker.length).toBeGreaterThan(0);
      expect(t.meta!.record.objectId.length).toBeGreaterThan(0);
      expect(t.meta!.record.url).toMatch(/^https?:\/\//);
    }
  });

  it('states the licence on every reference image it ships', () => {
    for (const t of CORPUS_TEMPLATES) {
      for (const img of t.referenceImages ?? []) {
        expect(img.credit, `${t.key} / ${img.label} has no credit`).toBeDefined();
        expect(img.credit!.licence.length).toBeGreaterThan(0);
        expect(img.credit!.attribution.length).toBeGreaterThan(0);
      }
    }
  });

  // Published arching data for these instruments is scarce and mostly paywalled, and a
  // plausible-looking crown on a named instrument is an invented measurement of a real object.
  // The older templates carry no arching for the same reason.
  it('invents no arching for a real instrument', () => {
    for (const t of CORPUS_TEMPLATES) {
      expect((t.params as { arching?: unknown }).arching, `${t.key} carries arching`).toBeUndefined();
    }
  });
});
