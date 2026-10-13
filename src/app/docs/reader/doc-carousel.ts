import { Component, computed, input, signal } from '@angular/core';
import { Slide } from './markdown';

// <carousel> in a page: its figures shown one at a time in a single thumbnail box
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

  step(by: number): void {
    const n = this.slides().length;
    this.index.update(i => (i + by + n) % n);
  }
}
