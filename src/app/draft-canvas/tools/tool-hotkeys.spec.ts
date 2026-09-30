import { TestBed } from '@angular/core/testing';
import { HOTKEY_TOOL_CYCLE } from './tool-hotkeys';
import { ToolRegistryService } from './tool-registry';

describe('HOTKEY_TOOL_CYCLE', () => {
  it('names real tools, each cycle in the order the palette shows them', () => {
    const registry = TestBed.inject(ToolRegistryService);
    const order = [...registry.toolRows, ...registry.modifyRows].flat().flatMap(slot => registry.variantsOf(slot)).map(t => t.id);
    for (const [key, ids] of Object.entries(HOTKEY_TOOL_CYCLE)) {
      const positions = ids.map(id => order.indexOf(id));
      expect(positions, key).not.toContain(-1);
      expect(positions, key).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
