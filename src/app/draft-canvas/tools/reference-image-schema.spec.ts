// @vitest-environment node
import { imageShapesFromRecipe, imageShapesToRecipe } from './reference-image-schema';
import { ImageAssetStore } from './image-asset-store';
import { ReferenceImage } from '../../models/types';

/** The store has no Angular dependencies of its own, so a plain instance is enough here. */
function store(): ImageAssetStore {
  return new ImageAssetStore();
}

describe('imageShapesFromRecipe', () => {
  it('shares one asset between two shapes pointing at the same image', () => {
    const assets = store();
    const shapes = imageShapesFromRecipe({
      referenceImages: [
        { id: 'a', label: 'A', href: '/same.jpg', x: 0, y: 0, width: 1, height: 1 },
        { id: 'b', label: 'B', href: '/same.jpg', x: 5, y: 5, width: 1, height: 1 },
      ],
    }, assets);
    expect(shapes[0].imageRef).toBe(shapes[1].imageRef);
    expect(assets.all().length).toBe(1);
  });
});

describe('lock defaults', () => {
  it('writes locked out explicitly, so absent-means-locked cannot silently re-lock it', () => {
    const assets = store();
    const shapes = imageShapesFromRecipe({
      referenceImages: [
        { id: 'a', label: 'A', href: '/a.jpg', x: 0, y: 0, width: 1, height: 1, locked: false },
      ],
    }, assets);
    expect(imageShapesToRecipe(shapes, assets)[0].locked).toBe(false);
  });
});

describe('round-trip through the recipe field', () => {
  it('preserves geometry, identity and the new per-image settings', () => {
    const assets = store();
    const original: ReferenceImage[] = [{
      id: 'r1', label: 'Plan', href: 'data:image/png;base64,AAAA',
      x: -157.7, y: -31.4, width: 319, height: 448.55, rotationDeg: 359.6,
      opacity: 0.4, suppressWhite: false, mirrored: true, locked: false,
    }];

    const out = imageShapesToRecipe(imageShapesFromRecipe({ referenceImages: original }, assets), assets);
    expect(out).toEqual(original);
  });

  it('preserves panel scoping and image credit, which nothing on the canvas ever rewrites', () => {
    const assets = store();
    const original: ReferenceImage[] = [{
      id: 'r1', label: 'Cross section', href: '/section.jpg',
      x: 0, y: 0, width: 100, height: 200, rotationDeg: 0, locked: true,
      scope: { only: ['longArching', 'crossArching'] },
      credit: {
        source: 'The Metropolitan Museum of Art',
        imageId: 'DP-1234-001',
        licence: 'CC0',
        attribution: 'The Metropolitan Museum of Art, Public Domain',
        url: 'https://www.metmuseum.org/art/collection/search/898377',
      },
    }];

    const shapes = imageShapesFromRecipe({ referenceImages: original }, assets);
    expect(shapes[0].scope).toEqual({ only: ['longArching', 'crossArching'] });
    expect(shapes[0].credit?.licence).toBe('CC0');

    const out = imageShapesToRecipe(shapes, assets);
    expect(out).toEqual(original);
  });

  it('copies the arrays rather than sharing them with the template constant', () => {
    const assets = store();
    const original: ReferenceImage[] = [{
      id: 'r1', label: 'A', href: '/a.jpg', x: 0, y: 0, width: 1, height: 1,
      scope: { only: ['base'] }, credit: { source: 'Met', licence: 'CC0', attribution: 'Met' },
    }];
    const shapes = imageShapesFromRecipe({ referenceImages: original }, assets);

    (shapes[0].scope as { only: string[] }).only.push('mould');
    shapes[0].credit!.licence = 'changed';

    expect(original[0].scope).toEqual({ only: ['base'] });
    expect(original[0].credit!.licence).toBe('CC0');
  });

  it('preserves the panels an image is kept off', () => {
    const assets = store();
    const original: ReferenceImage[] = [{
      id: 'r1', label: 'Plan', href: '/plan.jpg',
      x: 0, y: 0, width: 100, height: 200, scope: { except: ['crossArching'] },
    }];

    const shapes = imageShapesFromRecipe({ referenceImages: original }, assets);
    expect(shapes[0].scope).toEqual({ except: ['crossArching'] });
    // copied, not shared: editing the shape must not reach back into a template constant
    expect(shapes[0].scope).not.toBe(original[0].scope);

    expect(imageShapesToRecipe(shapes, assets)[0].scope).toEqual({ except: ['crossArching'] });
  });

  it('skips a shape whose asset has gone missing instead of writing an empty href', () => {
    const assets = store();
    const shapes = imageShapesFromRecipe({
      referenceImages: [{ id: 'a', label: 'A', href: '/a.jpg', x: 0, y: 0, width: 1, height: 1 }],
    }, assets);
    assets.resetAll();
    expect(imageShapesToRecipe(shapes, assets)).toEqual([]);
  });
});
