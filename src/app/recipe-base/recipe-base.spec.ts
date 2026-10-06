import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeComponentBase } from './recipe-base';
import { ToolboxStore } from '../draft-canvas/tools/toolbox-store';
import { ImageAssetStore } from '../draft-canvas/tools/image-asset-store';
import { clearWorkingState, readWorkingState, RECIPE_KEY } from '../helpers/workingStorage';

@Component({
  selector: 'app-point-host',
  template: `
    <div data-xy-point>
      <input type="number" data-xy="x" value="10" />
      <input type="number" data-xy="y" value="20" />
    </div>`,
})
class PointHost extends RecipeComponentBase {
  protected canOpenPanel(): boolean { return true; }
}

describe('xy point keys', () => {
  let x: HTMLInputElement;
  let y: HTMLInputElement;
  let changes: string[];

  const press = (target: HTMLInputElement, key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    target.dispatchEvent(e);
    return e;
  };

  beforeEach(() => {
    const fixture = TestBed.createComponent(PointHost);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    document.body.appendChild(host);
    x = host.querySelector('[data-xy="x"]')!;
    y = host.querySelector('[data-xy="y"]')!;
    changes = [];
    host.addEventListener('input', e => {
      const input = e.target as HTMLInputElement;
      changes.push(`${input.dataset['xy']}=${input.value}`);
    });
    x.focus();
  });

  it('moves both axes from either half on the modifier ladder', () => {
    expect(press(x, 'ArrowRight').defaultPrevented).toBe(true);
    press(x, 'ArrowUp');
    y.focus();
    press(y, 'ArrowLeft', { shiftKey: true });
    press(y, 'ArrowDown', { ctrlKey: true });
    expect(changes).toEqual(['x=11', 'y=21', 'x=1', 'y=20.9']);
  });

  it('takes each axis\'s own ladder when it sets one', () => {
    for (const input of [x, y]) {
      input.step = '0.25';
      input.dataset['stepShift'] = '1';
      input.dataset['stepFine'] = '0.1';
    }
    press(x, 'ArrowRight');
    press(x, 'ArrowUp', { shiftKey: true });
    press(x, 'ArrowLeft', { ctrlKey: true });
    expect(changes).toEqual(['x=10.25', 'y=21', 'x=10.15']);
  });

  it('leaves an empty half alone, and still blocks the native step', () => {
    x.value = '';
    expect(press(x, 'ArrowRight').defaultPrevented).toBe(true);
    expect(press(x, 'ArrowUp').defaultPrevented).toBe(true);
    expect(x.value).toBe('');
    expect(changes).toEqual(['y=21']);
  });

  it('leaves a disabled half where it is, the other still moving', () => {
    x.disabled = true;
    y.focus();
    expect(press(y, 'ArrowRight').defaultPrevented).toBe(false);
    press(y, 'ArrowUp');
    expect([x.value, changes]).toEqual(['10', ['y=21']]);
  });

  it('restores both axes to when focus entered the point on Escape', () => {
    press(x, 'ArrowRight');
    y.focus();
    press(y, 'ArrowUp');
    press(y, 'Escape');
    expect([x.value, y.value]).toEqual(['10', '20']);
  });
});

// a lock or a scope touches no param, so none of the recipe's own write paths would keep it
describe('image-only changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearWorkingState(RECIPE_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearWorkingState(RECIPE_KEY);
  });

  it('reach working storage on their own, debounced', () => {
    const fixture = TestBed.createComponent(PointHost);
    fixture.detectChanges();
    const toolbox = TestBed.inject(ToolboxStore);
    const assets = TestBed.inject(ImageAssetStore);
    toolbox.resetAll();
    toolbox.loadImages([{
      id: 'plan', type: 'image', x: 0, y: 0, width: 1, height: 1, label: 'Plan', locked: true,
      imageRef: assets.intern('data:image/png;base64,AAAA'),
    }]);
    vi.runAllTimers();

    toolbox.setImageLocked('plan', false);
    toolbox.setImageScope('plan', { except: ['base'] });
    expect(JSON.parse(readWorkingState(RECIPE_KEY)!).referenceImages[0].locked).toBe(true);

    vi.advanceTimersByTime(300);
    const saved = JSON.parse(readWorkingState(RECIPE_KEY)!).referenceImages[0];
    expect(saved.locked).toBe(false);
    expect(saved.scope).toEqual({ except: ['base'] });
    toolbox.resetAll();
  });
});
