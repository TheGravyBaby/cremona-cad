import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';
import { ToolboxStore } from './toolbox-store';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export const DEFAULT_TEXT_CONTENT = 'Text';

/**
 * Click to drop a text annotation. draft-canvas opens its inline editor on the new shape right
 * away (see startEditingText there), so the click and the typing are one gesture; the settings
 * panel edits the same fields afterwards.
 *
 * Clicking onto an existing label edits that one instead of stacking a second on top — that
 * interception happens in draft-canvas's onPointerDown, before this tool is asked.
 */
export class TextTool implements DraftTool {
  readonly id = 'text';
  readonly label = 'Text';
  readonly oneShot = true;

  constructor(private readonly toolbox: ToolboxStore) { }

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    host.addShape({
      id: makeShapeId(),
      type: 'text',
      position: pt,
      text: DEFAULT_TEXT_CONTENT,
      // Stamped rather than left to the renderer's default so the size the user settled on
      // carries to the next label — see ToolboxStore.currentTextSize.
      fontSize: this.toolbox.currentTextSize,
    });
  }

  onPointerMove(): void { }
  onPointerUp(): void { }
  renderPreview(_gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void { }
  reset(): void { }
}

export function createTextTool(toolbox: ToolboxStore): TextTool {
  return new TextTool(toolbox);
}
