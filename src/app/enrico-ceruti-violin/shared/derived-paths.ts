import { calculateCenterBout, calculateCorners } from '../ceruti-calcs';
import { defineFlutingAreaPath, defineFlutingPath, defineInnerPath, defineOuterPath, defineOuterPurflingPath, definePurflingPath } from '../ceruti-paths';
import { EnricoCerutiParams, PathEntry } from '../ceruti-types';

export const upsertPathEntry = (paths: PathEntry[], key: string, path: string): void => {
  const entry = paths.find(p => p.key === key);
  if (entry) {
    entry.path = path;
    return;
  }
  paths.push({ key, path });
};

export const ensureCenterBoutInnerPath = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
  solveC0?: boolean,
): void => {
  calculateCorners(params);
  calculateCenterBout(params, solveC0);
  upsertPathEntry(paths, 'inner', defineInnerPath(params));
};

export const ensureOuterTracePaths = (
  params: EnricoCerutiParams,
  paths: PathEntry[],
): void => {
  const offset = params.overhang + params.rib;
  const topPath = defineOuterPath(params, offset, true, false);
  const backPath = defineOuterPath(params, offset, true, true);
  const purflingPath = definePurflingPath(params, offset);
  const outerPurflingPath = defineOuterPurflingPath(params, offset);
  const flutingAreaPath = defineFlutingAreaPath(params, params.innerFlutingDepth, params.outerFlutingDepth, params.innerFlutingDepth_cBout);
  const flutingLinePath = defineFlutingPath(params, offset, params.innerFlutingDepth_cBout);

  upsertPathEntry(paths, 'top', topPath);
  upsertPathEntry(paths, 'back', backPath);
  if (purflingPath) upsertPathEntry(paths, 'purfling', purflingPath);
  if (outerPurflingPath) upsertPathEntry(paths, 'outerPurfling', outerPurflingPath);
  if (flutingAreaPath) upsertPathEntry(paths, 'flutingArea', flutingAreaPath);
  if (flutingLinePath) upsertPathEntry(paths, 'flutingLine', flutingLinePath);
};
