import { flipRectAboutY } from '../../helpers/draftMath';
import { renderPath, renderRect } from '../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';

export const renderMould = (
  params: EnricoCerutiParams,
  colors: CerutiColors,
  showBlocks: boolean,
  showInnerPath: boolean,
  mouldPath: string,
  innerPath: string,
) => (g: any, ui: any): void => {
  showInnerPath && renderPath(innerPath, colors.innerTrace)(g, ui);
  renderPath(mouldPath, colors.mouldTrace)(g, ui);

  if (showBlocks) {
    renderRect(params.blocks.U!, colors.upperBout)(g, ui);
    renderRect(params.blocks.CU!, colors.centerBoutUp)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CU!), colors.centerBoutUp)(g, ui);
    renderRect(params.blocks.CL!, colors.centerBoutLow)(g, ui);
    renderRect(flipRectAboutY(params.blocks.CL!), colors.centerBoutLow)(g, ui);
    renderRect(params.blocks.L!, colors.lowerBout)(g, ui);
  }
};
