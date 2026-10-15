import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeToolbarComponent } from './recipe-toolbar';

describe('RecipeToolbarComponent', () => {
  let fixture: ComponentFixture<RecipeToolbarComponent>;

  const items = () => Array.from(fixture.nativeElement.querySelectorAll('.toolbar-menu-item') as NodeListOf<HTMLElement>)
    .map(b => b.textContent!.trim());
  const open = () => {
    fixture.nativeElement.querySelector('.toolbar-file-btn').click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RecipeToolbarComponent] }).compileComponents();
    fixture = TestBed.createComponent(RecipeToolbarComponent);
    fixture.detectChanges();
  });

  it('keeps every file verb behind the File menu', () => {
    expect(fixture.nativeElement.querySelectorAll('.toolbar-btn')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.toolbar-menu')).toBeNull();
    open();
    expect(fixture.nativeElement.querySelector('.toolbar-menu')).not.toBeNull();
    expect(items().some(t => t.includes('historical'))).toBe(false);
  });

  it('saves on Ctrl/Cmd+S and opens the file picker on Ctrl/Cmd+O, from anywhere on the page', () => {
    const saved = vi.fn();
    fixture.componentInstance.saveFile.subscribe(saved);
    const picked = vi.spyOn(fixture.componentInstance.fileInput.nativeElement, 'click').mockImplementation(() => {});

    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(save);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'O', metaKey: true, bubbles: true, cancelable: true }));

    expect(save.defaultPrevented).toBe(true);
    expect(saved).toHaveBeenCalledOnce();
    expect(picked).toHaveBeenCalledOnce();
  });

  it('leaves other chords and held-down repeats alone', () => {
    const saved = vi.fn();
    fixture.componentInstance.saveFile.subscribe(saved);
    for (const init of [{ key: 's' }, { key: 's', ctrlKey: true, shiftKey: true }, { key: 's', ctrlKey: true, repeat: true }]) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true }));
    }
    expect(saved).not.toHaveBeenCalled();
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
    const btn = fixture.nativeElement.querySelector('.toolbar > .toolbar-btn--text') as HTMLButtonElement;
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
    const btn = fixture.nativeElement.querySelector('.toolbar > .toolbar-btn--text') as HTMLButtonElement;
    expect(btn.classList.contains('active')).toBe(true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });
});
