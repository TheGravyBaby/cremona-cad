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
});
