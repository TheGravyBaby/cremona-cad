import { DraftTool } from './draft-tool';

/**
 * One button's worth of space in the tool palette. Most tools are a single
 * fixed button; a `flyout` groups several construction methods for the same
 * kind of shape (e.g. Arc: center-first vs tangent-first) behind one button
 * plus a caret, so the palette doesn't grow a permanent icon per method.
 */
export type ToolSlot =
  | { kind: 'single'; tool: DraftTool }
  | { kind: 'flyout'; variants: DraftTool[]; selectedIndex: number };

export function single(tool: DraftTool): ToolSlot {
  return { kind: 'single', tool };
}

export function flyout(variants: DraftTool[]): ToolSlot {
  return { kind: 'flyout', variants, selectedIndex: 0 };
}
