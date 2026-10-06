// @vitest-environment node
import { PanelFlow } from './panelFlow';

/**
 * The sidebar's state machine.
 *
 * It decides which steps are reachable, so its failure mode is a panel that
 * never unlocks — nothing throws, nothing looks broken, the step simply is not
 * offered. That is the failure the CLAUDE.md panel checklist warns about
 * ("missing one fails quietly"), and it is why this is worth pinning: the bug
 * looks identical to the feature not existing yet.
 */

const PANELS = [
  { id: 'base', label: 'Base' },
  { id: 'bouts', label: 'Bouts' },
  { id: 'corners', label: 'Corners' },
  { id: 'mould', label: 'Mould' },
] as const;

type Id = typeof PANELS[number]['id'];

/** A flow where `enabled` decides which panels are reachable; mutate it to re-gate mid-test. */
function flowWith(enabled: Set<string>) {
  return new PanelFlow<Id>(PANELS, id => enabled.has(id));
}

describe('PanelFlow', () => {
  it('offers only the panels their predicate enables', () => {
    const flow = flowWith(new Set(['base', 'corners']));
    expect(flow.getEnabledPanels()).toEqual(['base', 'corners']);
    expect(flow.isEnabled('base')).toBe(true);
    expect(flow.isEnabled('bouts')).toBe(false);
  });

  it('keeps enablement in the declared order, not the order it was unlocked', () => {
    // The order is the bench order — the sequence a maker works in. A flow that
    // returned them in unlock order would step the user backwards through it.
    const flow = flowWith(new Set(['mould', 'base', 'corners']));
    expect(flow.getEnabledPanels()).toEqual(['base', 'corners', 'mould']);
  });

  it('does not re-read the predicate until asked to', () => {
    // Enablement is cached, so a panel whose edits unlock a later step has to say
    // so (`refreshEnabledPanels: true` on its render request). Pinned because the
    // symptom of forgetting is exactly the quiet one: the next step stays hidden
    // until something unrelated refreshes.
    const enabled = new Set(['base']);
    const flow = flowWith(enabled);
    enabled.add('bouts');
    expect(flow.getEnabledPanels()).toEqual(['base']);

    flow.refreshEnabledPanels();
    expect(flow.getEnabledPanels()).toEqual(['base', 'bouts']);
  });
});

describe('PanelFlow.getCurrent', () => {
  it('falls back to the first enabled panel when the current one is gone', () => {
    // Reachable in practice: an edit that disables the open panel — clearing a
    // measurement the later steps depend on — must land the user somewhere real
    // rather than on a panel the flow no longer admits to having.
    expect(flowWith(new Set(['base', 'mould'])).getCurrent('corners')).toBe('base');
  });
});

describe('PanelFlow stepping', () => {
  it('steps to the next and previous enabled panel, skipping the gaps', () => {
    const flow = flowWith(new Set(['base', 'mould']));
    expect(flow.step('base', 1)).toBe('mould');
    expect(flow.step('mould', -1)).toBe('base');
  });

  it('stops at both ends rather than wrapping', () => {
    const flow = flowWith(new Set(['base', 'bouts']));
    expect(flow.canStep('base', -1)).toBe(false);
    expect(flow.step('base', -1)).toBeNull();
    expect(flow.canStep('bouts', 1)).toBe(false);
    expect(flow.step('bouts', 1)).toBeNull();
  });

  it('steps from a disabled panel by way of the fallback', () => {
    const flow = flowWith(new Set(['base', 'mould']));
    expect(flow.step('corners', 1)).toBe('mould');
  });
});

describe('PanelFlow.getProgress', () => {
  it('counts position among enabled panels but totals every panel', () => {
    // The bar measures progress through the whole recipe, so locked steps still
    // count toward the total — otherwise unlocking a step would make the bar go
    // backwards, having just added something to the denominator.
    const flow = flowWith(new Set(['base', 'bouts']));
    const p = flow.getProgress('bouts');
    expect(p.panel).toBe('bouts');
    expect(p.index).toBe(1);
    expect(p.current).toBe(2);
    expect(p.total).toBe(4);
  });

  it('reports a complete flow rather than dividing by zero when nothing is enabled', () => {
    const p = flowWith(new Set()).getProgress('base');
    expect(p.percent).toBe(100);
    expect(p.total).toBe(1);
  });
});

describe('PanelFlow.select', () => {
  it('admits an enabled panel and refuses a disabled one', () => {
    const flow = flowWith(new Set(['base']));
    expect(flow.select('base')).toBe('base');
    expect(flow.select('mould')).toBeNull();
  });

  it('asks the predicate directly, so a freshly unlocked panel is selectable at once', () => {
    // Unlike the cached list — select() is what a click goes through, and a click
    // that lands on a panel the cache has not caught up with should still work.
    const enabled = new Set(['base']);
    const flow = flowWith(enabled);
    enabled.add('mould');
    expect(flow.select('mould')).toBe('mould');
  });
});
