import { TestBed } from '@angular/core/testing';
import { DEFAULT_SETTINGS, SettingsService } from './settings.service';

describe('SettingsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('a setting survives into the next visit', () => {
    TestBed.inject(SettingsService).set('fitOnPanelChange', !DEFAULT_SETTINGS.fitOnPanelChange);
    TestBed.resetTestingModule();
    expect(TestBed.inject(SettingsService).fitOnPanelChange()).toBe(!DEFAULT_SETTINGS.fitOnPanelChange);
  });

  it('reads a mistyped, unknown or unreadable store as the defaults', () => {
    localStorage.setItem('settings', JSON.stringify({ appearance: 'dusk', barAutoHide: 'yes', retired: 1 }));
    let s = TestBed.inject(SettingsService);
    expect(s.appearance()).toBe(DEFAULT_SETTINGS.appearance);
    expect(s.barAutoHide()).toBe(DEFAULT_SETTINGS.barAutoHide);

    localStorage.setItem('settings', '{not json');
    TestBed.resetTestingModule();
    s = TestBed.inject(SettingsService);
    expect(s.fitOnPanelChange()).toBe(DEFAULT_SETTINGS.fitOnPanelChange);
  });

  it('a mistyped key leaves its well-typed neighbours alone', () => {
    const appearance = DEFAULT_SETTINGS.appearance === 'night' ? 'day' : 'night';
    localStorage.setItem('settings', JSON.stringify({ appearance, barAutoHide: 'yes' }));
    expect(TestBed.inject(SettingsService).appearance()).toBe(appearance);
  });
});
