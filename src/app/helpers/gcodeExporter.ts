import { Pt, Pt3D } from '../models/types';
import { polylineCumulativeLengths } from './math/vibeMath';

// G-code for a GRBL machine (Carbide Motion runs it as is) from 2.5D profile cuts, a closed loop
// the cutter's centre follows, taken down in depth passes, with tabs the bit lifts over once a
// pass is below them, and from surface cuts, one continuous run of the cutter's tip with Z
// following the work. The writer holds the rules a bad file breaks: rapids only at the safe
// height, every Z-only move at plunge feed, a run that dives steeper than PLUNGE_ANGLE at plunge
// feed too, nothing below the floor, and the file ends retracted with the spindle off. The file
// pauses (M0) after the tool change for the bit and the router's dial, both set by hand, and only
// then starts the spindle. Z is absolute in the file's own zero; the caller says where the floor
// is, and the file refuses to be written rather than cross it

export interface GcodeTab {
  // along the loop, from its first point
  from: number;
  to: number;
}

export interface ProfileCut {
  name: string;
  // the cutter centre's path, closed: its first point repeated last
  loop: Pt[];
  tabs: GcodeTab[];
}

export interface SurfaceCut {
  name: string;
  // the cutter tip's run, entered by a plunge at its first point and left by a lift at its last
  pts: Pt3D[];
}

export type GcodeCut = ProfileCut | SurfaceCut;

// a run dropping steeper than this is a plunge, whatever it does in XY
export const PLUNGE_ANGLE = Math.PI / 6;

export interface GcodeJob {
  // header comments, one line each
  notes: string[];
  tool: { number: number; name: string };
  spindleRpm: number;
  safeZ: number;
  floorZ: number;
  // the absolute Z of each pass, top first
  passes: number[];
  // a tab keeps the bit at this Z through its span on any pass below it
  tabTop: number;
  cutFeed: number;
  plungeFeed: number;
  // in cutting order
  cuts: GcodeCut[];
}

export function buildGcode(job: GcodeJob): string {
  if (job.passes.some(z => z < job.floorZ - 1e-9)) throw new Error(`G-code: a pass at Z${fmt(Math.min(...job.passes))} is below the floor Z${fmt(job.floorZ)}.`);
  if (job.safeZ <= Math.max(...job.passes, job.tabTop)) throw new Error('G-code: the safe height has to clear every pass and the tabs.');
  let w = new Writer(job);
  let rpm = Math.round(job.spindleRpm);
  let prompt = `Change the bit to #${job.tool.number} ${job.tool.name}, then set the router to ${rpm} rpm. Once you resume, the machine will begin cutting.`;
  w.comment('Cremona CAD');
  for (let note of job.notes) w.comment(note);
  w.comment(`Tool #${job.tool.number} ${job.tool.name}`);
  w.comment(prompt);
  w.comment(`Passes ${job.passes.map(fmt).join(' ')}`);
  w.line('G90');
  w.line('G21');
  w.line('G17');
  w.rapidZ(job.safeZ);
  w.line('M5');
  w.line(`M6 T${job.tool.number}`);
  // not every sender shows MSG, so the prompt is in the header as well
  w.comment(`MSG, ${prompt}`);
  w.line('M0');
  w.line(`M3 S${rpm}`);
  for (let cut of job.cuts) 'loop' in cut ? w.cut(cut) : w.surface(cut);
  w.rapidZ(job.safeZ);
  w.line('M5');
  w.line('M2');
  return w.text();
}

export function downloadGcodeFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const fmt = (n: number): string => (Math.abs(n) < 5e-4 ? 0 : n).toFixed(3);

class Writer {
  private lines: string[] = [];
  private z: number | null = null;
  private xy: Pt | null = null;
  private feed: number | null = null;

  constructor(private job: GcodeJob) {}

  text(): string {
    return this.lines.join('\n') + '\n';
  }

  line(s: string): void {
    this.lines.push(s);
  }

  comment(s: string): void {
    this.lines.push(`(${s.replace(/[()]/g, '')})`);
  }

  // a rapid in Z goes only to the safe height; a rapid in XY only happens there
  rapidZ(z: number): void {
    if (z !== this.job.safeZ) throw new Error('G-code: a Z rapid goes to the safe height alone.');
    this.lines.push(`G0 Z${fmt(z)}`);
    this.z = z;
  }

  rapidXY(p: Pt): void {
    if (this.z !== this.job.safeZ) throw new Error('G-code: an XY rapid is only made at the safe height.');
    this.lines.push(`G0 X${fmt(p.x)} Y${fmt(p.y)}`);
    this.xy = p;
  }

  feedZ(z: number): void {
    this.guard(z);
    if (z === this.z) return;
    this.lines.push(`G1 Z${fmt(z)}${this.f(this.job.plungeFeed)}`);
    this.z = z;
  }

  feedXY(p: Pt): void {
    this.guard(this.z ?? this.job.safeZ);
    this.lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)}${this.f(this.job.cutFeed)}`);
    this.xy = p;
  }

  // the tip to a point of a surface run: at plunge feed when it dives steeper than PLUNGE_ANGLE
  feedXYZ(p: Pt3D): void {
    this.guard(p.z);
    let from = this.xy ?? p, dz = p.z - (this.z ?? this.job.safeZ);
    let run = Math.hypot(p.x - from.x, p.y - from.y);
    let dive = dz < 0 && -dz > run * Math.tan(PLUNGE_ANGLE);
    this.lines.push(`G1 X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)}${this.f(dive ? this.job.plungeFeed : this.job.cutFeed)}`);
    this.xy = p;
    this.z = p.z;
  }

  private guard(z: number): void {
    if (z < this.job.floorZ - 1e-9) throw new Error(`G-code: a move to Z${fmt(z)} is below the floor Z${fmt(this.job.floorZ)}.`);
  }

  private f(feed: number): string {
    if (feed === this.feed) return '';
    this.feed = feed;
    return ` F${fmt(feed)}`;
  }

  // the loop once per pass, the bit staying down between passes, up over the tabs on the passes
  // below them, and back to the safe height at the end
  cut(cut: ProfileCut): void {
    let stations = tabStations(cut);
    this.comment(`Cut ${cut.name}`);
    this.rapidXY(stations[0].pt);
    for (let z of this.job.passes) {
      let lifted = z < this.job.tabTop;
      for (let i = 1; i < stations.length; i++) {
        let s = stations[i];
        this.feedZ(lifted && s.inTab ? this.job.tabTop : z);
        this.feedXY(s.pt);
      }
    }
    this.rapidZ(this.job.safeZ);
  }

  // one plunge at the run's first point, the tip then following it to the end
  surface(cut: SurfaceCut): void {
    if (cut.pts.length < 2) throw new Error(`G-code: the surface run ${cut.name} has no length.`);
    this.comment(`Surface ${cut.name}`);
    this.rapidXY(cut.pts[0]);
    this.feedZ(cut.pts[0].z);
    for (let i = 1; i < cut.pts.length; i++) this.feedXYZ(cut.pts[i]);
    this.rapidZ(this.job.safeZ);
  }
}

interface Station {
  pt: Pt;
  // the run from the station before this one is inside a tab
  inTab: boolean;
}

// the loop's vertices with one added at each tab's ends, each marked for the run that reaches it
function tabStations(cut: ProfileCut): Station[] {
  let loop = cut.loop;
  let cum = polylineCumulativeLengths(loop);
  let total = cum[cum.length - 1];
  let marks = loop.map((pt, i) => ({ s: cum[i], pt }));
  for (let s of cut.tabs.flatMap(t => [t.from, t.to])) {
    if (!(s > 0 && s < total)) continue;
    let i = cum.findIndex(c => c > s);
    let f = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    marks.push({ s, pt: { x: loop[i - 1].x + (loop[i].x - loop[i - 1].x) * f, y: loop[i - 1].y + (loop[i].y - loop[i - 1].y) * f } });
  }
  marks.sort((a, b) => a.s - b.s);
  return marks.map((m, i) => {
    let mid = i ? (marks[i - 1].s + m.s) / 2 : -1;
    return { pt: m.pt, inTab: cut.tabs.some(t => mid > t.from && mid < t.to) };
  });
}
