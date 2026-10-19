import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScopeMenuComponent } from './scope-menu';
import { ToolboxStore } from '../tools/toolbox-store';
import { PanelScope } from '../tools/panel-scope';

describe('ScopeMenuComponent', () => {
  let component: ScopeMenuComponent;
  let fixture: ComponentFixture<ScopeMenuComponent>;
  let toolbox: ToolboxStore;
  let emitted: (PanelScope | undefined)[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ScopeMenuComponent] }).compileComponents();
    fixture = TestBed.createComponent(ScopeMenuComponent);
    component = fixture.componentInstance;
    toolbox = TestBed.inject(ToolboxStore);
    toolbox.setAvailablePanels([{ id: 'base', label: 'Base' }, { id: 'cross', label: 'Cross' }]);
    toolbox.setActivePanel('cross');
    emitted = [];
    component.scopeChange.subscribe(scope => emitted.push(scope));
  });

  afterEach(() => {
    toolbox.setAvailablePanels([]);
    toolbox.setActivePanel(null);
  });

  it('reads its presets from the panel you are standing on', () => {
    component.scope = undefined;
    component.applyPreset('here');
    component.scope = { only: ['cross'] };
    expect(component.isHereOnly).toBe(true);
    component.applyPreset('everywhere');
    expect(emitted).toEqual([{ only: ['cross'] }, undefined]);
  });

  // the menu proposes, the host writes: nothing changes until the host feeds the scope back in
  it('toggles one panel without touching the rest', () => {
    component.scope = { only: ['base'] };
    component.toggleHere();
    component.togglePanel('base');
    expect(emitted).toEqual([{ only: ['base', 'cross'] }, { only: [] }]);
  });
});
