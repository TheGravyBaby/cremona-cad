import { Palette } from '../palette';

// the colours the app grew up with, reduced to one ink per hue family: warm, green, blue, violet,
// and a warm neutral for the volute's ivory and tan
export const CREMONA: Palette = {
  id: 'cremona',
  name: 'Cremona',
  inks: ['#c97a35', '#3f9a63', '#4d74a8', '#9a66b4', '#d8c1a0'],
  neutral: '#868484',
  alert: '#d62828',
};

export const PALETTES: readonly Palette[] = [CREMONA];
