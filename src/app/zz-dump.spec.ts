import { defaultViolin } from './enrico-ceruti-violin/ceruti-fixtures';
import { defaultNeckParams, defaultStringSetup } from './enrico-ceruti-violin/calculation/neck/ceruti-neck';
import { defaultVoluteParams } from './enrico-ceruti-violin/calculation/neck/ceruti-scroll';
import { scrollBackViewStrokes, scrollFrontViewStrokes } from './enrico-ceruti-violin/calculation/neck/ceruti-scroll-views';
import { Pt } from './models/types';

it('dump', () => {
  const p = defaultViolin();
  p.neck = defaultNeckParams(p);
  p.stringSetup = defaultStringSetup(p);
  p.scroll = defaultVoluteParams(p);
  const place = (x: number, y: number) => new Pt(x, y);
  const show = (s: any) => `${s.ink.padEnd(18)} w${s.weight} ${'line' in s ? `line ${s.line[0].x.toFixed(1)},${s.line[0].y.toFixed(1)} -> ${s.line[1].x.toFixed(1)},${s.line[1].y.toFixed(1)}` : 'polygon' in s ? 'polygon ' + s.polygon.map((q: Pt) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ') : s.d.slice(0, 110)}`;
  throw new Error('\nBACK\n' + scrollBackViewStrokes(p, place, 0).map(show).join('\n') + '\nFRONT\n' + scrollFrontViewStrokes(p, place, 0).map(show).join('\n'));
});
