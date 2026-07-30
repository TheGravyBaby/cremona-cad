import { imageShapesFromRecipe, imageShapesToRecipe } from './reference-image-schema';
import { ImageAssetStore } from './image-asset-store';
import { CERUTI_TEMPLATES } from '../../enrico-ceruti-violin/ceruti-templates';
import { NamedReferenceImage } from '../../models/types';

/** The store has no Angular dependencies of its own, so a plain instance is enough here. */
function store(): ImageAssetStore {
  return new ImageAssetStore();
}

describe('imageShapesFromRecipe', () => {
  it('reads the multi-image array, interning each href', () => {
    const assets = store();
    const shapes = imageShapesFromRecipe({
      referenceImages: [
        { id: 'r1', label: 'Plan', href: '/plan.jpg', x: -10, y: 0, width: 200, height: 300, rotationDeg: 4 },
        { id: 'r2', label: 'Long arch', href: '/long.jpg', x: 5, y: 1, width: 100, height: 20 },
      ],
    }, assets);

    expect(shapes.length).toBe(2);
    expect(shapes[0].id).toBe('r1');
    expect(shapes[0].label).toBe('Plan');
    expect(shapes[0].rotationDeg).toBe(4);
    expect(assets.href(shapes[0].imageRef)).toBe('/plan.jpg');
    expect(assets.href(shapes[1].imageRef)).toBe('/long.jpg');
  });

  it('folds the deprecated singular field into a one-element list', () => {
    const assets = store();
    const shapes = imageShapesFromRecipe({
      referenceImage: { href: '/old.jpg', x: 0, y: 0, width: 50, height: 60 },
    }, assets);

    expect(shapes.length).toBe(1);
    expect(shapes[0].label).toBe('Img 1');
    expect(assets.href(shapes[0].imageRef)).toBe('/old.jpg');
  });

  it('drops a blank legacy placeholder rather than placing an invisible image', () => {
    expect(imageShapesFromRecipe(
      { referenceImage: { href: '', x: 0, y: 0, width: 0, height: 0 } }, store()).length).toBe(0);
  });

  it('prefers the array when a file somehow carries both fields', () => {
    const shapes = imageShapesFromRecipe({
      referenceImages: [{ id: 'a', label: 'New', href: '/new.jpg', x: 0, y: 0, width: 1, height: 1 }],
      referenceImage: { href: '/old.jpg', x: 0, y: 0, width: 1, height: 1 },
    }, store());
    expect(shapes.map(s => s.label)).toEqual(['New']);
  });

  it('handles a recipe with no reference images at all', () => {
    expect(imageShapesFromRecipe({}, store()).length).toBe(0);
    expect(imageShapesFromRecipe(null, store()).length).toBe(0);
    expect(imageShapesFromRecipe({ referenceImages: [] }, store()).length).toBe(0);
  });

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

  it('mutates neither the source array nor its entries', () => {
    const entry: NamedReferenceImage = {
      id: 'r1', label: 'Plan', href: '/plan.jpg', x: -10, y: 0, width: 200, height: 300,
    };
    const source = { referenceImages: [entry] };
    imageShapesFromRecipe(source, store());
    expect(source.referenceImages).toEqual([entry]);
  });
});

describe('round-trip through the recipe field', () => {
  it('preserves geometry, identity and the new per-image settings', () => {
    const assets = store();
    const original: NamedReferenceImage[] = [{
      id: 'r1', label: 'Plan', href: 'data:image/png;base64,AAAA',
      x: -157.7, y: -31.4, width: 319, height: 448.55, rotationDeg: 359.6,
      opacity: 0.4, suppressWhite: false, layerId: 'layer-default',
    }];

    const out = imageShapesToRecipe(imageShapesFromRecipe({ referenceImages: original }, assets), assets);
    expect(out).toEqual(original.map(e => ({ ...e, 'xlink:href': e.href })));
  });

  it('emits xlink:href alongside href, as every previous version of the format did', () => {
    const assets = store();
    const out = imageShapesToRecipe(imageShapesFromRecipe({
      referenceImage: { href: '/old.jpg', x: 0, y: 0, width: 10, height: 10 },
    }, assets), assets);
    expect(out[0]['xlink:href']).toBe('/old.jpg');
    expect(out[0].href).toBe('/old.jpg');
  });

  it('defaults a missing rotation to 0 rather than writing undefined', () => {
    const assets = store();
    const out = imageShapesToRecipe(imageShapesFromRecipe({
      referenceImages: [{ id: 'a', label: 'A', href: '/a.jpg', x: 0, y: 0, width: 1, height: 1 }],
    }, assets), assets);
    expect(out[0].rotationDeg).toBe(0);
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

// The built-in templates are the compatibility contract this module exists to hold: they carry
// reference images in the pre-refactor format and must keep loading untouched.
describe('the built-in Ceruti templates', () => {
  it('every template loads without error, and every image in one gets usable geometry', () => {
    // Collected rather than asserted per-image so a failure names which template broke.
    const bad: string[] = [];
    for (const template of CERUTI_TEMPLATES) {
      const assets = store();
      for (const shape of imageShapesFromRecipe(template, assets)) {
        if (!assets.href(shape.imageRef)) bad.push(`${template.key}/${shape.label}: no href`);
        if (!(shape.width > 0)) bad.push(`${template.key}/${shape.label}: bad width`);
        if (!(shape.height > 0)) bad.push(`${template.key}/${shape.label}: bad height`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('loads the reference image shipped with each template that has one', () => {
    const withImages = CERUTI_TEMPLATES.filter(t => t.referenceImage?.href || t.referenceImages?.length);
    // Guards the assertion below against silently passing if the templates ever lose their images.
    expect(withImages.length).toBeGreaterThan(0);
    const empty = withImages
      .filter(t => imageShapesFromRecipe(t, store()).length === 0)
      .map(t => t.key);
    expect(empty).toEqual([]);
  });

  it('round-trips a template through save and load unchanged', () => {
    const template = CERUTI_TEMPLATES.find(t => t.referenceImage?.href)!;
    const assets = store();
    const saved = imageShapesToRecipe(imageShapesFromRecipe(template, assets), assets);
    const reloaded = imageShapesToRecipe(imageShapesFromRecipe({ referenceImages: saved }, assets), assets);
    expect(reloaded).toEqual(saved);
  });
});
