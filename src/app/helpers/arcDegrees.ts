import { Arc, setArcStartByDegreeDiff, setArcEndByDegreeDiff } from '../models/types';

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
