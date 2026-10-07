// The line under each export on the export panel, keyed by the export's id there.
export const EXPORT_DESCRIPTIONS: Record<string, string> = {
  outerTrace: 'Top of the instrument',
  back: 'Back of the instrument, with button',
  innerTrace: 'Inner body outline for mould & rib bending',
  longArchTemplates: 'Centerline profile strips, top and back',
  crossArchTemplates: '5 cross-section strips per plate, evenly spaced',
  fholeTemplate: 'Single unmirrored f-hole, for cutting or tracing',
  fholeTemplateNoEyes: 'Single unmirrored f-hole, eyes closed with a short arc for hand-cut eyes',
  neckTemplate: 'Side profile, neck foot to scroll, with the volute as a slotted stencil and the eye pricked',
  scrollFrontView: 'The head from in front, the pegbox and the turns as seen, with the nut',
  scrollBackView: "The head from behind, the duck tail's round, the back and the turns as seen",
  scrollBack: "The back unrolled into a strip, duck tail to the second turn's bottom, to lay on the carved back and draw round",
  scrollCompass: 'A box to cut, its spine marked where a compass steps up the back, a circle each width across, to set the compass from',
  mould: 'Mould for creating the rib structure',
  blocks: 'Individual block templates',
  stlTop: 'Arched top surface with fluting channel, for CNC',
  stlBack: 'Arched back surface with fluting channel, for CNC',
};
