import * as d3 from 'd3';
import { Pt } from '../../models/types';
import { DraftTool, DraftToolHost } from './draft-tool';
import { makeShapeId } from './toolbox-shape';

type RootGroup = d3.Selection<SVGGElement, unknown, null, undefined>;

export const DEFAULT_TEXT_CONTENT = 'Text';

/** Click to drop a text annotation; content is edited afterward via the settings panel. */
export class TextTool implements DraftTool {
  readonly id = 'text';
  readonly label = 'Text';
  readonly oneShot = true;

  onPointerDown(pt: Pt, host: DraftToolHost): void {
    host.addShape({
      id: makeShapeId(),
      type: 'text',
      position: pt,
      text: DEFAULT_TEXT_CONTENT,
    });
  }

  onPointerMove(): void { }
  onPointerUp(): void { }
  renderPreview(_gRoot: RootGroup, _gUI: RootGroup, _pxPerMm: number): void { }
  reset(): void { }
}

export function createTextTool(): TextTool {
  return new TextTool();
}
