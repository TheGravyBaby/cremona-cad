import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { IconName, iconAttrs, iconBody } from './icons';

// <svg icon="line" width="18" height="18">: the svg stays in the host template, so that
// component's own styles still reach it. An attribute written on the element wins over the icon's.
@Directive({ selector: 'svg[icon]', standalone: true })
export class IconDirective {
  readonly icon = input.required<IconName>();
  private readonly svg = inject(ElementRef<SVGSVGElement>).nativeElement as SVGSVGElement;
  private readonly authored = new Set(Array.from(this.svg.attributes, a => a.name.toLowerCase()));

  constructor() {
    effect(() => {
      const name = this.icon();
      for (const [k, v] of Object.entries(iconAttrs(name))) {
        if (!this.authored.has(k.toLowerCase())) this.svg.setAttribute(k, v);
      }
      // the bodies are constants in icons.ts, never user text, so they skip the sanitiser
      this.svg.innerHTML = iconBody(name);
    });
  }
}
