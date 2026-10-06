import { Rectangle } from '../../models/types';
import { renderRect, renderSegment } from '../../helpers/renderFuncs';
import { CerutiColors, EnricoCerutiParams } from '../ceruti-types';

export const renderBounds = (params: EnricoCerutiParams, render: boolean) => (g: any, ui: any): void => {
  const h = params.height;
  const hw = params.width / 2;
  const inset = params.overhang + params.rib;
  let outerRect = new Rectangle({ x: -hw, y: 0 }, { x: hw, y: h });
  let insetRect = new Rectangle({ x: -hw + inset, y: inset }, { x: hw - inset, y: h - inset });

  if (render) {
    renderRect(outerRect, "grey")(g, ui);
    renderRect(insetRect, "grey")(g, ui);
  }
};

export const renderBoutBouts = (params: EnricoCerutiParams, colors: CerutiColors, render: boolean) => (g: any, ui: any): void => {
  if (!render) return;
  let p = params;
  let lowerBoutSquare = new Rectangle({ x: -p.bouts.LBW / 2, y: 0 }, { x: p.bouts.LBW / 2, y: p.bouts.LBW });
  let upperBoutSquare = new Rectangle({ x: -p.bouts.UBW / 2, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2, y: p.height });
  const inset = params.overhang + params.rib;

  renderRect(lowerBoutSquare, colors.lowerBoutOff)(g, ui);
  renderSegment({ x: -p.bouts.LBW / 2 + inset, y: 0 }, { x: -p.bouts.LBW / 2 + inset, y: p.bouts.LBW }, colors.lowerBoutOff)(g, ui);
  renderSegment({ x: p.bouts.LBW / 2 - inset, y: 0 }, { x: p.bouts.LBW / 2 - inset, y: p.bouts.LBW }, colors.lowerBoutOff)(g, ui);
  renderRect(upperBoutSquare, colors.upperBoutOff)(g, ui);
  renderSegment({ x: -p.bouts.UBW / 2 + inset, y: p.height - p.bouts.UBW }, { x: -p.bouts.UBW / 2 + inset, y: p.height }, colors.upperBoutOff)(g, ui);
  renderSegment({ x: p.bouts.UBW / 2 - inset, y: p.height - p.bouts.UBW }, { x: p.bouts.UBW / 2 - inset, y: p.height }, colors.upperBoutOff)(g, ui);
};
