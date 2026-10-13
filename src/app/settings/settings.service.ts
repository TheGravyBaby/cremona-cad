import { Injectable, signal } from '@angular/core';

// the user's preferences, kept across tabs and visits in localStorage, unlike the per-tab working
// state in helpers/workingStorage.ts. a key missing or mistyped in storage reads as its default,
// so adding or dropping a setting needs no migration

export type Appearance = 'auto' | 'day' | 'night';

export interface AppSettings {
  appearance: Appearance;
  barAutoHide: boolean;
  fitOnPanelChange: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'night',
  barAutoHide: false,
  fitOnPanelChange: true,
};

const STORAGE_KEY = 'settings';
const APPEARANCES: readonly Appearance[] = ['auto', 'day', 'night'];

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly state = signal<AppSettings>(readSettings());

  readonly appearance = () => this.state().appearance;
  readonly barAutoHide = () => this.state().barAutoHide;
  readonly fitOnPanelChange = () => this.state().fitOnPanelChange;

  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.state.update(s => ({ ...s, [key]: value }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // a blocked store still applies the setting for this visit
    }
  }
}

function readSettings(): AppSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // unreadable reads as defaults
  }
  const out = { ...DEFAULT_SETTINGS };
  if (APPEARANCES.includes(stored['appearance'] as Appearance)) out.appearance = stored['appearance'] as Appearance;
  if (typeof stored['barAutoHide'] === 'boolean') out.barAutoHide = stored['barAutoHide'];
  if (typeof stored['fitOnPanelChange'] === 'boolean') out.fitOnPanelChange = stored['fitOnPanelChange'];
  return out;
}
