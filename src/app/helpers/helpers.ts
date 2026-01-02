export function widthFromRatio(heightMm: number, ratioHeight: number, ratioWidth: number): number {
  const h = Math.max(1, heightMm);
  const a = Math.max(1, ratioHeight);
  const b = Math.max(1, ratioWidth);
  return h * (b / a);
}