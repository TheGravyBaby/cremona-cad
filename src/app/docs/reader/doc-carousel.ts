import { Component, computed, inject, input, signal } from '@angular/core';
import { ThemeService } from '../../theme/theme.service';
import { Slide } from './markdown';

// <carousel> in a page: its figures shown one at a time in a single thumbnail box. An svg slide
// shows its `_Day` sibling in day mode when one exists; a drawing's ink is baked into the file
@Component({
  selector: 'app-doc-carousel',
  standalone: true,
  templateUrl: './doc-carousel.html',
  styleUrls: ['./doc-carousel.css'],
})
export class DocCarouselComponent {
  readonly slides = input.required<Slide[]>();
  readonly index = signal(0);
  readonly slide = computed(() => this.slides()[this.index()]);
  private readonly theme = inject(ThemeService);
  private readonly noDay = signal(new Set<string>());
  readonly src = computed(() => {
    const src = this.slide().src;
    return this.theme.mode() === 'day' && src.endsWith('.svg') && !this.noDay().has(src)
      ? src.replace(/\.svg$/, '_Day.svg')
      : src;
  });

  missing(): void {
    const src = this.slide().src;
    if (this.src() !== src) this.noDay.update(s => new Set(s).add(src));
  }

  step(by: number): void {
    const n = this.slides().length;
    this.index.update(i => (i + by + n) % n);
  }
}
