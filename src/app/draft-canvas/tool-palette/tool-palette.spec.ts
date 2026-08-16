import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolPaletteComponent } from './tool-palette';
import { ToolRegistryService } from '../tools/tool-registry';

const OPEN_KEY = 'draft-canvas-tool-palette-open';

/** jsdom has no layout engine, so nothing here can assert the column wrapping itself — that's
 * checked in a real browser. These cover the state the layout hangs off, and above all that a
 * collapsed bar can still be reopened: the floating dock it replaced could only be reopened by
 * hovering, which a touch device can't do, so collapsing it on a phone was a dead end. */
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

  it('closes any open popup when collapsing', async () => {
    await create();
    component.layersOpen = true;
    component.imagesOpen = true;

    component.toggleOpen();

    expect(component.layersOpen).toBe(false);
    expect(component.imagesOpen).toBe(false);
    expect(component.openFlyout).toBeNull();
  });

  // Guards the two deletions the docked layout depends on: the separator cost a whole extra column
  // once the bar wraps, and the pin button was replaced by the handle.
  it('renders one row per tool plus Select and Layers, and no separator', async () => {
    await create();
    const registry = TestBed.inject(ToolRegistryService);

    expect(fixture.nativeElement.querySelectorAll('.tool-palette-sep').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.tool-row').length)
      .toBe(registry.toolRows.length + 2);
  });
});
