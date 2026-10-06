import { EnricoCerutiParams } from '../../ceruti-types';
import amatiBrookings from './amati-brookings-params.json';
import amatiBrookingsArched from './amati-brookings-arched-params.json';
import delGesuBaltic from './del-gesu-baltic-params.json';
import invertedCorners from './inverted-corners-params.json';
import invertedCornersFluting from './inverted-corners-fluting-params.json';
import invertedLowerCorner from './inverted-lower-corner-params.json';
import magginiDelmas from './maggini-delmas-params.json';
import ravatinMans from './ravatin-mans-params.json';
import stradivariCelloCastelbarco from './stradivari-cello-castelbarco-params.json';
import stradivariViolaCassavetti from './stradivari-viola-cassavetti-params.json';

// Frozen recipes the specs own, keyed by file name. Never read by the app.
//
// No spec reads the served templates (ceruti-templates.ts, corpus/, local/): those are re-saved
// from the running app whenever an instrument is retraced, and a tolerance pinned against one
// then fails on work that touched nothing near it. A spec that wants a real instrument takes a
// copy from here; when a served template changes in a way a spec should follow, copy its
// `params` in as a new file rather than pointing at it.
export const TEST_INSTRUMENTS: Record<string, EnricoCerutiParams> = {
  'amati-brookings': amatiBrookings as unknown as EnricoCerutiParams,
  'amati-brookings-arched': amatiBrookingsArched as unknown as EnricoCerutiParams,
  'del-gesu-baltic': delGesuBaltic as unknown as EnricoCerutiParams,
  'inverted-corners': invertedCorners as unknown as EnricoCerutiParams,
  'inverted-corners-fluting': invertedCornersFluting as unknown as EnricoCerutiParams,
  'inverted-lower-corner': invertedLowerCorner as unknown as EnricoCerutiParams,
  'maggini-delmas': magginiDelmas as unknown as EnricoCerutiParams,
  'ravatin-mans': ravatinMans as unknown as EnricoCerutiParams,
  'stradivari-cello-castelbarco': stradivariCelloCastelbarco as unknown as EnricoCerutiParams,
  'stradivari-viola-cassavetti': stradivariViolaCassavetti as unknown as EnricoCerutiParams,
};
