import { TestBed } from '@angular/core/testing';
import { ToolboxStore } from './toolbox-store';
import { ImageShape } from './toolbox-shape';

/**
 * Panel-scoped reference images. An instrument's set can hold a plan view for the outline steps
 * and a section photograph for the arching ones; the recipe pushes whichever panel is open and the
 * store shows the images that belong to it.
 *
 * What's pinned here is the pair of things that make it safe: scoping is separate from the user's
 * own `hidden` switch, and an unpushed panel filters nothing rather than hiding everything.
 */
describe('ToolboxStore panel-scoped images', () => {
  let toolbox: ToolboxStore;

  const image = (id: string, panels?: string[], isDefault?: boolean): ImageShape => ({
    id, type: 'image', x: 0, y: 0, width: 10, height: 10,
    imageRef: `ref-${id}`, label: id, panels, isDefault,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    toolbox = TestBed.inject(ToolboxStore);
    toolbox.resetAll();
    toolbox.setActivePanel(null);
  });

  const visible = () => toolbox.getVisibleImages().map(s => s.id);

  const excluding = (id: string, excludePanels: string[], isDefault?: boolean): ImageShape => ({
    ...image(id, undefined, isDefault), excludePanels,
  });

  it('shows an unscoped image on every panel', () => {
    toolbox.loadImages([image('plan')]);
    toolbox.setActivePanel('base');
    expect(visible()).toEqual(['plan']);
    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual(['plan']);
  });

  it('shows a scoped image only on the panels it names', () => {
    toolbox.loadImages([image('plan'), image('section', ['crossArching', 'longArching'])]);

    toolbox.setActivePanel('base');
    expect(visible()).toEqual(['plan']);

    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual(['plan', 'section']);

    toolbox.setActivePanel('longArching');
    expect(visible()).toEqual(['plan', 'section']);
  });

  it('filters nothing until a panel has been pushed, so a missed push shows too much rather than too little', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    expect(visible()).toEqual(['section']);
  });

  it('treats an empty panels list as unscoped', () => {
    toolbox.loadImages([image('plan', [])]);
    toolbox.setActivePanel('mould');
    expect(visible()).toEqual(['plan']);
  });

  // Two different switches: `hidden` is the user parking an image, `panels` is the recipe saying
  // where it belongs. Scoping must not write through to `hidden`, or returning to the right panel
  // would leave the image still parked.
  it('leaves the user\'s own hide switch alone', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    toolbox.setActivePanel('base');
    expect(visible()).toEqual([]);

    toolbox.setActivePanel('crossArching');
    expect(visible()).toEqual(['section']);
    expect(toolbox.getImageShapes()[0].hidden).toBeUndefined();
  });

  it('still honours hidden and the master switch on the panel an image belongs to', () => {
    toolbox.loadImages([image('section', ['crossArching'])]);
    toolbox.setActivePanel('crossArching');

    toolbox.setImageHidden('section', true);
    expect(visible()).toEqual([]);

    toolbox.setImageHidden('section', false);
    toolbox.setShowImages(false);
    expect(visible()).toEqual([]);
    toolbox.setShowImages(true);
  });

  // getEditableShapes derives from getVisibleImages, so this comes for free — pinned because the
  // alternative is a selectable, draggable image the user cannot see.
  it('makes an off-panel image unselectable', () => {
    toolbox.loadImages([{ ...image('section', ['crossArching']), locked: false }]);
    toolbox.setActivePanel('base');
    expect(toolbox.getEditableShapes().map(s => s.id)).not.toContain('section');
  });

  it('keeps off-panel images in the list the image panel shows, and in what gets saved', () => {
    toolbox.loadImages([image('plan'), image('section', ['crossArching'])]);
    toolbox.setActivePanel('base');
    expect(toolbox.getImageShapes().map(s => s.id)).toEqual(['plan', 'section']);
  });

  // A default image is the set's general view: shown wherever nothing more specific is, and
  // stepped aside from where something is. The point is that adding a scoped image is enough on
  // its own — the general image never has to enumerate the panels it's still wanted on, so
  // neither adding a panel nor adding an instrument view means revisiting it.
  describe('a default image', () => {
    it('shows on panels no other image claims, and steps aside on the ones that do', () => {
      toolbox.loadImages([image('plan', undefined, true), image('section', ['crossArching'])]);

      toolbox.setActivePanel('base');
      expect(visible()).toEqual(['plan']);

      toolbox.setActivePanel('crossArching');
      expect(visible()).toEqual(['section']);
    });

    it('is displaced by any image naming the panel, not only by one that names it alone', () => {
      toolbox.loadImages([
        image('plan', undefined, true),
        image('sectionA', ['crossArching', 'longArching']),
        image('sectionB', ['crossArching']),
      ]);

      toolbox.setActivePanel('crossArching');
      expect(visible()).toEqual(['sectionA', 'sectionB']);

      toolbox.setActivePanel('longArching');
      expect(visible()).toEqual(['sectionA']);
    });

    it('comes back when the image that displaced it is hidden, rather than leaving the panel bare', () => {
      toolbox.loadImages([image('plan', undefined, true), image('section', ['mould'])]);
      toolbox.setActivePanel('mould');
      expect(visible()).toEqual(['section']);

      toolbox.setImageHidden('section', true);
      expect(visible()).toEqual(['plan']);
    });

    it('still filters nothing before a panel has been pushed', () => {
      toolbox.loadImages([image('plan', undefined, true), image('section', ['mould'])]);
      expect(visible()).toEqual(['plan', 'section']);
    });

    it('leaves an unflagged unscoped image showing everywhere, so hand-placed images are untouched', () => {
      toolbox.loadImages([image('handPlaced'), image('section', ['mould'])]);
      toolbox.setActivePanel('mould');
      expect(visible()).toEqual(['handPlaced', 'section']);
    });
  });

  // Picking an image out of the image list, or clicking it, shows it here whatever its scoping
  // says. Without this the list has a row you can click that appears to do nothing, and editing
  // the scoping of the image you have selected takes the image and its own controls away.
  // A panel with no good reference for it should show nothing, rather than the general view of
  // the instrument — which would be traced by mistake. Before excludePanels the format had no way
  // to say that: a panel nothing claimed fell through to the default.
  describe('a panel kept deliberately blank', () => {
    it('keeps an excluded image off that panel and nowhere else', () => {
      toolbox.loadImages([excluding('plan', ['crossArching'], true)]);

      toolbox.setActivePanel('crossArching');
      expect(visible()).toEqual([]);

      toolbox.setActivePanel('longArching');
      expect(visible()).toEqual(['plan']);
    });

    it('leaves the panel showing nothing when it is the only image', () => {
      toolbox.loadImages([excluding('plan', ['crossArching'], true), image('flute', ['fluting'])]);
      toolbox.setActivePanel('crossArching');
      expect(visible()).toEqual([]);
    });

    it('still shows an image that names the panel outright', () => {
      // excluding the general view is about the general view, not about the panel: adding a real
      // reference for it later has to just work, with nothing to undo on the other entry
      toolbox.loadImages([excluding('plan', ['crossArching'], true), image('section', ['crossArching'])]);
      toolbox.setActivePanel('crossArching');
      expect(visible()).toEqual(['section']);
    });

    it('beats the default flag rather than being overruled by it', () => {
      // isDefault would otherwise claim this panel, since nothing else names it
      toolbox.loadImages([excluding('plan', ['crossArching'], true)]);
      toolbox.setActivePanel('crossArching');
      expect(toolbox.imageMatchesActivePanel(toolbox.getImageShapes()[0])).toBe(false);
    });

    it('still gives way to the selection, so an excluded image can be edited', () => {
      toolbox.loadImages([excluding('plan', ['crossArching'], true)]);
      toolbox.setActivePanel('crossArching');
      toolbox.setRevealedImage('plan');
      expect(visible()).toEqual(['plan']);
    });
  });

  describe('the revealed image', () => {
    it('shows an off-panel image, without touching its scoping', () => {
      toolbox.loadImages([image('section', ['crossArching'])]);
      toolbox.setActivePanel('base');
      expect(visible()).toEqual([]);

      toolbox.setRevealedImage('section');
      expect(visible()).toEqual(['section']);
      expect(toolbox.getImageShapes()[0].panels).toEqual(['crossArching']);
    });

    it('makes that image selectable, so the settings bar has something to edit', () => {
      toolbox.loadImages([{ ...image('section', ['crossArching']), locked: false }]);
      toolbox.setActivePanel('base');
      toolbox.setRevealedImage('section');
      expect(toolbox.getEditableShapes().map(s => s.id)).toContain('section');
    });

    it('does not stop a default image stepping aside for the one revealed', () => {
      toolbox.loadImages([image('plan', undefined, true), image('section', ['mould'])]);
      toolbox.setActivePanel('mould');
      toolbox.setRevealedImage('section');
      expect(visible()).toEqual(['section']);
    });

    it('ends when the panel changes, so it never looks like scoping quietly stopped working', () => {
      toolbox.loadImages([image('section', ['crossArching'])]);
      toolbox.setActivePanel('base');
      toolbox.setRevealedImage('section');
      expect(visible()).toEqual(['section']);

      toolbox.setActivePanel('mould');
      expect(toolbox.revealedImageId).toBeNull();
      expect(visible()).toEqual([]);
    });

    it('still obeys the hide switch — revealing is about scoping, not about parking', () => {
      toolbox.loadImages([image('section', ['crossArching'])]);
      toolbox.setActivePanel('base');
      toolbox.setRevealedImage('section');
      toolbox.setImageHidden('section', true);
      expect(visible()).toEqual([]);
    });
  });
});
