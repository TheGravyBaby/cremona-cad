import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Touch steppers for the sidebar's number fields.
 *
 * Desktop browsers draw spin buttons inside `input[type=number]`, and sidebar.css styles them
 * (`::-webkit-inner-spin-button`). Mobile Safari draws none at all — that pseudo-element doesn't
 * exist there — so on a phone every adjustment, however small, means opening the keyboard and
 * typing. This puts a pair of buttons back where the native ones sit, on coarse pointers only.
 *
 * Applied by element selector rather than per-input, since there are 130-odd of these across the
 * panels: a component gets steppers on all its number fields by importing the directive, with no
 * template change. Stepping goes through the browser's own stepUp/stepDown so `step`, `min` and
 * `max` keep the exact meaning they have for the desktop spinners — including the per-field
 * `stepFor()` sizes bound in the templates — then fires `input` so ngModel and the panel's
 * `onChange()` run as if the value had been typed.
 */
@Directive({
  // every number input in a component that imports this — the import is the opt-in, so keying on a
  // class as well would only mean a future panel silently missing out for using a different one
  selector: 'input[type="number"]',
  standalone: true,
})
export class NumberStepperDirective implements OnInit, OnDestroy {
  private input = inject(ElementRef<HTMLInputElement>).nativeElement as HTMLInputElement;
  private wrap?: HTMLElement;

  ngOnInit(): void {
    // fine pointers already have the native spin buttons; a second pair would just crowd them.
    // Guarded for test environments (jsdom) the way draft-canvas guards ResizeObserver.
    if (typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches) return;

    const doc = this.input.ownerDocument;
    const parent = this.input.parentNode;
    if (!parent) return;

    const wrap = doc.createElement('span');
    wrap.className = 'num-stepper';
    parent.insertBefore(wrap, this.input);
    wrap.appendChild(this.input);

    const btns = doc.createElement('span');
    btns.className = 'num-stepper-btns';
    btns.appendChild(this.button(doc, 'up', 'Increase'));
    btns.appendChild(this.button(doc, 'down', 'Decrease'));
    wrap.appendChild(btns);

    this.wrap = wrap;
  }

  /** Angular removes the input from whatever parent it has, which is now the wrapper — so the
   * wrapper is ours to clean up, or panels behind an @if would leave one behind on every switch. */
  ngOnDestroy(): void {
    this.wrap?.remove();
  }

  private button(doc: Document, dir: 'up' | 'down', label: string): HTMLButtonElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'num-stepper-btn';
    b.setAttribute('aria-label', label);
    // not a tab stop: 130 fields would mean 260 extra stops, and a keyboard already has arrow keys
    b.tabIndex = -1;
    b.innerHTML = dir === 'up'
      ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.step(dir);
    });
    return b;
  }

  private step(dir: 'up' | 'down'): void {
    try {
      // stepUp throws on an empty or otherwise invalid field; seed it so the first tap still moves
      if (this.input.value === '') this.input.value = this.input.min || '0';
      else if (dir === 'up') this.input.stepUp();
      else this.input.stepDown();
    } catch {
      return;
    }
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
