import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { RenderToggles } from './render-toggles';
import { CerutiViewFlags, DEFAULT_CERUTI_VIEW_FLAGS, RenderToggleKey } from '../ceruti-types';
import { MainBoutsPanel } from '../panels/main-bouts-panel/main-bouts-panel';
import { CornersPanel } from '../panels/corners-panel/corners-panel';
import { CenterBoutPanel } from '../panels/center-bout-panel/center-bout-panel';
import { OuterTracePanel } from '../panels/outer-trace-panel/outer-trace-panel';
import { FlutingPanel } from '../panels/fluting-panel/fluting-panel';
import { LongArchingPanel } from '../panels/long-arching-panel/long-arching-panel';
import { CrossArchingPanel } from '../panels/cross-arching-panel/cross-arching-panel';
import { MouldPanel } from '../panels/mould-panel/mould-panel';

describe('RenderToggles', () => {
  let fixture: ComponentFixture<RenderToggles>;
  let flags: CerutiViewFlags;

  /** The bar as the user sees it: one aria-label per drawn button, in DOM order. */
  function drawn(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'))
      .map(btn => (btn as HTMLElement).getAttribute('aria-label') ?? '');
  }

  function show(buttons: readonly RenderToggleKey[]): void {
    fixture.componentRef.setInput('flags', flags);
    fixture.componentRef.setInput('buttons', buttons);
    fixture.detectChanges();
  }

  beforeEach(() => {
    flags = { ...DEFAULT_CERUTI_VIEW_FLAGS };
    fixture = TestBed.createComponent(RenderToggles);
  });

  it('draws only the buttons it was given', () => {
    show(['showModuleGuides']);
    expect(drawn()).toEqual(['Show Module Guides']);
  });

  it('draws nothing for a panel that offers none', () => {
    show([]);
    expect(drawn()).toEqual([]);
  });

  // The bar should look the same wherever it is opened from, so a panel picks buttons
  // but not their placement.
  it('orders buttons by the bar, not by the order the panel listed them', () => {
    show(['renderOuterPath', 'showModuleGuides', 'showModuleArcs']);
    expect(drawn()).toEqual(['Show Module Arcs', 'Show Module Guides', 'Show Outer Path']);
  });

  it('flips the flag it names and asks for a redraw', () => {
    show(['showModuleGuides']);
    let redraws = 0;
    fixture.componentInstance.changed.subscribe(() => redraws++);

    fixture.nativeElement.querySelector('button').click();

    expect(flags.showModuleGuides).toBe(true);
    expect(redraws).toBe(1);
  });

  /*
   * "All Arcs" is a sliver attached to the right of the Module Arcs button, so it only draws
   * alongside it — a panel listing it alone gets nothing. Three panels used to do exactly that
   * (the old RENDER_TOGGLE_ROWS set `allArcs` with `arcs: false`) and silently showed no button,
   * which is invisible until someone goes looking for the control. Every key a panel names has
   * to reach the bar, so a list is checked against what it actually draws.
   */
  const PANELS = [
    ['Main Bouts', MainBoutsPanel.renderToggles],
    ['Corners', CornersPanel.renderToggles],
    ['Center Bout', CenterBoutPanel.renderToggles],
    ['Outer Path', OuterTracePanel.renderToggles],
    ['Fluting Channel', FlutingPanel.renderToggles],
    ['Long Arching', LongArchingPanel.renderToggles],
    ['Cross Arching', CrossArchingPanel.renderToggles],
    ['Mould', MouldPanel.renderToggles],
  ] as const;

  it.each(PANELS)('draws a button for every key %s asks for', (_label, buttons) => {
    show(buttons);
    expect(drawn().length).toBe(buttons.length);
  });
});
