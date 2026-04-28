export type SvgPathExport = {
  d: string;
  stroke?: string;
  fill?: string;
};

export function buildMirroredSvg(
  width: number,
  height: number,
  paths: SvgPathExport[]
): string {
  const viewBox = `${-width / 2} 0 ${width} ${height}`;
  const pathMarkup = paths
    .map(path => `<path d="${path.d}" fill="${path.fill ?? 'none'}" stroke="${path.stroke ?? 'black'}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g transform="translate(0 ${height}) scale(1 -1)">${pathMarkup}</g></svg>`;
}

export function downloadSvgFile(filename: string, svgContent: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}