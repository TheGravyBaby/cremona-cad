import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolPaletteComponent } from './tool-palette';
import { ToolRegistryService } from '../tools/tool-registry';
import { SelectionActions } from '../tools/selection-actions';

const OPEN_KEY = 'draft-canvas-tool-palette-open';

/** jsdom has no layout engine, so nothing here can assert the column break itself — that's checked
 * in a real browser. These cover the state the layout hangs off, and above all that a collapsed bar
 * can still be reopened: the floating dock it replaced could only be reopened by hovering, which a
 * touch device can't do, so collapsing it on a phone was a dead end. */
describe('ToolPaletteComponent', () => {
  let component: ToolPaletteComponent;
  let fixture: ComponentFixture<ToolPaletteComponent>;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ToolPaletteComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [ToolPaletteComponent] }).compileComponents();
  });

  afterEach(() => sessionStorage.clear());

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  it('starts open with nothing stored', async () => {
    await create();
    expect(component.open).toBe(true);
    expect(el('.tool-palette')?.classList.contains('collapsed')).toBe(false);
    expect(el('.tool-dock-body')).toBeTruthy();
  });

  it('starts collapsed on a viewport too short to hold the bar', async () => {
    const tall = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 393, configurable: true });
    try {
      await create();
      expect(component.open).toBe(false);
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: tall, configurable: true });
    }
  });

  it('lets a stored preference win over the short-viewport default', async () => {
    const tall = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 393, configurable: true });
    sessionStorage.setItem(OPEN_KEY, 'true');
    try {
      await create();
      expect(component.open).toBe(true);
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: tall, configurable: true });
    }
  });

  it('honours a stored collapsed state', async () => {
    sessionStorage.setItem(OPEN_KEY, 'false');
    await create();
    expect(component.open).toBe(false);
    expect(el('.tool-palette')?.classList.contains('collapsed')).toBe(true);
  });

  it('persists the collapsed state', async () => {
    await create();
    component.toggleOpen();
    expect(sessionStorage.getItem(OPEN_KEY)).toBe('false');
    component.toggleOpen();
    expect(sessionStorage.getItem(OPEN_KEY)).toBe('true');
  });

  it('reopens from the handle while collapsed', async () => {
    sessionStorage.setItem(OPEN_KEY, 'false');
    await create();

    const handle = el('.tool-dock-handle');
    expect(handle).toBeTruthy();

    handle!.click();
    fixture.detectChanges();

    expect(component.open).toBe(true);
    expect(el('.tool-dock-body')).toBeTruthy();
  });

  it('does not reopen on hover', async () => {
    sessionStorage.setItem(OPEN_KEY, 'false');
    await create();

    el('.tool-palette')!.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(component.open).toBe(false);
  });

  it('heads every open flyout with its group, draw and modify alike', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    const headings = () => {
      fixture.detectChanges();
      return [...fixture.nativeElement.querySelectorAll('.tool-flyout-caret')].map((caret: HTMLElement) => {
        caret.click();
        fixture.detectChanges();
        const title = el('.tool-flyout-title')?.textContent?.trim();
        caret.click();
        fixture.detectChanges();
        return title;
      });
    };

    expect(headings()).toEqual(registry.toolRows.flat().filter(s => registry.hasVariants(s)).map(s => registry.groupLabel(s)));
    el('.modify-handle')!.click();
    expect(headings()).toEqual(component.modifyLayout.filter(r => (r.commands?.length ?? 0) > 1).map(r => r.label));
  });

  it('closes an open flyout when collapsing', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    component.openFlyout = registry.toolRows.flat().find(s => registry.hasVariants(s))!;

    component.toggleOpen();

    expect(component.openFlyout).toBeNull();
  });

  // layoutColumns() measures the bar and writes the column break onto the grid. jsdom reports every
  // element as zero-height, which is the same shape as a collapsed bar: there is nothing to measure,
  // so it must write nothing and leave the stylesheet's single-column fallback in charge rather than
  // divide by a zero row height and break the bar into a column per tool.
  it('leaves the grid alone when there is no height to measure', async () => {
    await create();
    const body = el('.tool-dock-body')!;
    expect(body.style.gridTemplateRows).toBe('');
    expect(body.style.gridAutoFlow).toBe('');
  });

  // Guards the three deletions the docked layout depends on: the separator cost a whole extra
  // column once the bar wraps, the pin button was replaced by the handle, and Layers moved out to
  // the canvas bottom bar (layer-controls.ts) so that no row carries a sliver beside its button.
  it('renders one row per tool plus Select, and nothing else', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);

    expect(fixture.nativeElement.querySelectorAll('.tool-palette-sep').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.tool-view-toggle').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.tool-row').length)
      .toBe(registry.toolRows.length + 1);
  });

  it('switches tabs from the handles, and closes when the showing tab is clicked again', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    el('.modify-handle')!.click();
    fixture.detectChanges();

    expect(component.tab).toBe('modify');
    expect(el('.modify-handle')!.classList.contains('top')).toBe(true);
    expect(el('.tool-dock-handle:not(.modify-handle)')!.classList.contains('top')).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.tool-row').length).toBe(component.modifyLayout.length + 1);
    const laidOut = component.modifyLayout.flatMap(row => row.slot ? registry.variantsOf(row.slot) : row.commands!.flatMap(c => c.tool ?? []));
    expect(registry.modifyRows.flat().flatMap(slot => registry.variantsOf(slot)).every(tool => laidOut.includes(tool))).toBe(true);

    el('.modify-handle')!.click();
    fixture.detectChanges();
    expect(component.open).toBe(false);
  });

  it('shows the tab a hotkeyed tool lives on', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    registry.activateById('offset');
    expect(component.tab).toBe('modify');
    registry.activateById('line');
    expect(component.tab).toBe('draw');
    registry.selectTool(null);
    expect(component.tab).toBe('draw');
  });

  it('runs a command from its group and faces it out, greyed while nothing is selected', async () => {
    await create();
    el('.modify-handle')!.click();
    fixture.detectChanges();
    const actions = TestBed.inject(SelectionActions);
    const group = component.modifyLayout.find(row => row.commands?.some(c => c.id === 'align-top'))!.commands!;
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.tool-row .tool-btn')]
      .find(b => b.title.startsWith(component.commandFace(group).label))!;
    expect(button.disabled).toBe(true);

    const align = vi.spyOn(actions, 'align').mockReturnValue(true);
    component.runCommand(group, group.find(c => c.id === 'align-top')!);
    expect(align).toHaveBeenCalledWith('top');
    expect(component.commandFace(group).id).toBe('align-top');
  });

  it('closes an open flyout on Escape, and only the flyout', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    component.openFlyout = registry.toolRows.flat().find(s => registry.hasVariants(s))!;
    const later = vi.fn();
    document.addEventListener('keydown', later);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(component.openFlyout).toBeNull();
    expect(later).not.toHaveBeenCalled();
    document.removeEventListener('keydown', later);
  });

  it('files Rotate among the quarter turns and faces it out while it is active', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    const group = component.modifyLayout.find(row => row.commands?.some(c => c.id === 'rotate-cw'))!.commands!;
    expect(group.some(c => c.tool?.id === 'rotate')).toBe(true);
    component.runCommand(group, group.find(c => c.id === 'rotate-cw')!);
    registry.activateById('rotate');
    expect(component.commandFace(group).id).toBe('rotate');
  });

  it('faces a group button toward whichever of its commands applies', async () => {
    await create();
    const actions = TestBed.inject(SelectionActions);
    const group = component.modifyLayout.find(row => row.commands?.some(c => c.id === 'group'))!.commands!;
    vi.spyOn(actions, 'canGroup', 'get').mockReturnValue(false);
    vi.spyOn(actions, 'canUngroup', 'get').mockReturnValue(true);
    expect(component.commandFace(group).id).toBe('ungroup');
  });

  it('closes an open flyout on a press outside the bar, and not on one inside it', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);
    const slot = registry.toolRows.flat().find(s => registry.hasVariants(s))!;
    component.openFlyout = slot;
    el('.tool-dock-body')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(component.openFlyout).toBe(slot);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(component.openFlyout).toBeNull();
  });
});
