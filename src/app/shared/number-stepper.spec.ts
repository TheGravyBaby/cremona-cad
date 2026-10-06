import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NumberStepperDirective } from './number-stepper';

@Component({
  standalone: true,
  imports: [FormsModule, NumberStepperDirective],
  template: `<input type="number" class="basic-input" step="5" min="1" [(ngModel)]="value" />`,
})
class HostComponent {
  /** Aligned to the step base: `min` is that base, so with min=1 step=5 the valid values are
   * 1, 6, 11, ... and stepping from an unaligned value snaps to the next valid one rather than
   * adding a whole step. That is the spec's behaviour and the desktop spin buttons' too. */
  value: number | null = 11;
}

/** jsdom reports no pointer type, so every test states which one it wants before creating the
 * component — the directive reads the media query once, in ngOnInit. */
describe('NumberStepperDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let original: typeof window.matchMedia;

  const setPointer = (coarse: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: coarse && query.includes('coarse'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  async function create(coarse: boolean): Promise<void> {
    setPointer(coarse);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const input = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const buttons = () =>
    fixture.nativeElement.querySelectorAll('.num-stepper-btn') as NodeListOf<HTMLButtonElement>;

  beforeEach(async () => {
    original = window.matchMedia;
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it('steps by the field\'s own step attribute, in both directions', async () => {
    await create(true);
    const [up, down] = Array.from(buttons());

    up.click();
    expect(input().value).toBe('16');

    down.click();
    down.click();
    expect(input().value).toBe('6');
  });

  it('seeds an empty field instead of throwing', async () => {
    await create(true);
    input().value = '';
    expect(() => buttons()[0].click()).not.toThrow();
    expect(input().value).toBe('1'); // the min
  });
});
