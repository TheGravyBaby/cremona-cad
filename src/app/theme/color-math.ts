export interface Rgb { r: number; g: number; b: number }
export interface Hsl { h: number; s: number; l: number }

export function parseColor(s: string): (Rgb & { a: number }) | null {
  const text = s.trim();
  const hexShort = /^#([0-9a-f]{3})$/i.exec(text);
  if (hexShort) {
    const [r, g, b] = hexShort[1].split('').map(c => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  const hexLong = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  if (hexLong) {
    const byte = (i: number) => parseInt(hexLong[1].substring(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: hexLong[2] ? parseInt(hexLong[2], 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(text);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(rgb[4]))) : 1 };
  }
  return null;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d + 6) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0, gn = 0, bn = 0;
  if (h < 60) { rn = c; gn = x; }
  else if (h < 120) { rn = x; gn = c; }
  else if (h < 180) { gn = c; bn = x; }
  else if (h < 240) { gn = x; bn = c; }
  else if (h < 300) { rn = x; bn = c; }
  else { rn = c; bn = x; }
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return { r: to255(rn), g: to255(gn), b: to255(bn) };
}

// WCAG relative luminance / contrast ratio (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance)
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function toHex({ r, g, b }: Rgb): string {
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
