// Tool mnemonics: pressing the key activates the group's first variant, or
// advances to the next one in the list on repeated presses. Order here should
// match each tool's flyout order in draft-canvas.ts's toolRows.
//
// Shared between draft-canvas.ts (which owns keyboard capture and actually
// dispatches these) and tool-palette.ts (which only reads HOTKEY_LETTER_BY_TOOL
// to show a tooltip hint) — kept in one file so the two can't drift apart.
export const HOTKEY_TOOL_CYCLE: Record<string, string[]> = {
  KeyL: ['line'],
  KeyD: ['dimension'],
  KeyA: ['arc', 'arc-tangent', 'arc-start', 'arc-chain', 'join-arc'],
  KeyC: ['circle'],
  KeyR: ['rect'],
  KeyS: ['section'],
  KeyT: ['text'],
  KeyP: ['point'],
  // Not KeyF: that's already Fit-to-view (see draft-canvas.ts's onKeyDown) — matches the
  // Photoshop/Illustrator/Procreate convention of B for the brush/freehand tool instead.
  KeyB: ['freehand'],
  KeyE: ['eraser'],
  KeyO: ['offset'],
  KeyI: ['image'],
};

// Reverse of the above (tool id -> its group's letter), for tooltip hints.
export const HOTKEY_LETTER_BY_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(HOTKEY_TOOL_CYCLE)
    .flatMap(([code, ids]) => ids.map(id => [id, code.replace('Key', '')])),
);
