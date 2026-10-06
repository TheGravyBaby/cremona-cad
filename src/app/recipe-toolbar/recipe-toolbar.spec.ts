import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeToolbarComponent } from './recipe-toolbar';

describe('RecipeToolbarComponent', () => {
  let fixture: ComponentFixture<RecipeToolbarComponent>;

  const items = () => Array.from(fixture.nativeElement.querySelectorAll('.toolbar-menu-item') as NodeListOf<HTMLElement>)
    .map(b => b.textContent!.trim());
  const open = () => {
    fixture.nativeElement.querySelector('.toolbar-menu-btn').click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RecipeToolbarComponent] }).compileComponents();
    fixture = TestBed.createComponent(RecipeToolbarComponent);
    fixture.detectChanges();
  });

  it('keeps every file verb behind the one menu', () => {
    expect(fixture.nativeElement.querySelectorAll('.toolbar-btn')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.toolbar-menu')).toBeNull();
    open();
    expect(items()).toEqual(expect.arrayContaining(['New blank instrument', 'Upload Recipe', 'Download Recipe']));
    expect(items()).not.toContain('Start from a historical instrument…');
  });

  it('offers the gallery only when the recipe has templates, and asks the parent to open it', () => {
    fixture.componentRef.setInput('hasTemplates', true);
    fixture.detectChanges();
    const opened = vi.fn();
    fixture.componentInstance.openTemplates.subscribe(opened);
    open();
    const row = Array.from(fixture.nativeElement.querySelectorAll('.toolbar-menu-item') as NodeListOf<HTMLElement>)
      .find(b => b.textContent!.includes('historical'))!;
    row.click();
    fixture.detectChanges();
    expect(opened).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.toolbar-menu')).toBeNull();
  });

  it('shows Export as the one labelled button, disabled until the recipe says otherwise', () => {
    fixture.componentRef.setInput('showExport', true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.toolbar-btn--text') as HTMLButtonElement;
    expect(btn.textContent!.trim()).toBe('Export');
    expect(btn.disabled).toBe(true);
    fixture.componentRef.setInput('exportEnabled', true);
    fixture.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('lights Export while its panel is the open one', () => {
    fixture.componentRef.setInput('showExport', true);
    fixture.componentRef.setInput('exportActive', true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.toolbar-btn--text') as HTMLButtonElement;
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
