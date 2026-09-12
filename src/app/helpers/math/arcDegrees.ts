import { Arc, setArcStartByDegreeDiff, setArcEndByDegreeDiff } from '../../models/types';

export function adjustArcStart(arc: Arc, degrees: number, changeFn: () => void): void {
  if (typeof degrees !== 'number') return;
  setArcStartByDegreeDiff(arc, degrees);
  changeFn();
}

export function adjustArcEnd(arc: Arc, degrees: number, changeFn: () => void): void {
  if (typeof degrees !== 'number') return;
  setArcEndByDegreeDiff(arc, degrees);
  changeFn();
}

export function getArcStartDeg(arc: Arc): number {
  return Math.round(arc.start * (180 / Math.PI));
}

export function setArcStartDeg(arc: Arc, degrees: number, changeFn: () => void): void {
  if (typeof degrees !== 'number') return;
  arc.start = degrees * (Math.PI / 180);
  changeFn();
}

export function getArcEndDeg(arc: Arc): number {
  return Math.round(arc.end * (180 / Math.PI));
}

export function setArcEndDeg(arc: Arc, degrees: number, changeFn: () => void): void {
  if (typeof degrees !== 'number') return;
  arc.end = degrees * (Math.PI / 180);
  changeFn();
}

// for radian fields that aren't an Arc's start/end (e.g. FholeCut's angleOnEye/slope) — kept to
// two decimal places since these fields are typically driven by a fine step under a degree
export function getFieldDeg<T>(obj: T, field: keyof T): number {
  const value = obj[field] as unknown as number | null;
  return Math.round((value ?? 0) * 18000 / Math.PI) / 100;
}

export function setFieldDeg<T>(obj: T, field: keyof T, degrees: number, changeFn: () => void): void {
  if (typeof degrees !== 'number') return;
  obj[field] = (degrees * Math.PI / 180) as unknown as T[keyof T];
  changeFn();
}
