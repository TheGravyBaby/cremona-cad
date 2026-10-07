import { Component, ElementRef, ViewChild } from '@angular/core';

// The Documentation tab: one topic at a time from a contents list, grouped as the canvas, then
// the design sections in the order the recipe builds them.
@Component({
  selector: 'app-guide',
  standalone: true,
  templateUrl: './guide.html',
  styleUrls: ['./guide.css'],
})
export class GuideComponent {
  readonly tutorialGroups: { label: string; topics: { id: string; label: string }[] }[] = [
    {
      label: 'Canvas',
      topics: [
        { id: 'basics', label: 'Basics' },
        { id: 'drawing', label: 'Drawing Tools' },
        { id: 'images', label: 'Reference Images' },
      ],
    },
    {
      label: 'Outline',
      topics: [
        { id: 'base', label: 'Base Measurements' },
        { id: 'bouts', label: 'Main Bouts' },
        { id: 'corners', label: 'Corners' },
        { id: 'center', label: 'Center Bout' },
        { id: 'outer', label: 'Outer Path' },
        { id: 'purfling', label: 'Purfling' },
      ],
    },
    {
      label: 'Arching',
      topics: [
        { id: 'fluting', label: 'Fluting Channel' },
        { id: 'long', label: 'Long Arching' },
        { id: 'cross', label: 'Cross Arching' },
      ],
    },
    {
      label: 'F-Holes',
      topics: [
        { id: 'fHolePlacement', label: 'F-Hole Placement' },
        { id: 'fHoleContours', label: 'F-Hole Contours' },
      ],
    },
    {
      label: 'Output',
      topics: [
        { id: 'mould', label: 'Mould' },
        { id: 'export', label: 'Export' },
      ],
    },
  ];

  tutorialTopic = 'basics';

  @ViewChild('topicScroll') private topicScroll?: ElementRef<HTMLElement>;

  selectTopic(id: string) {
    this.tutorialTopic = id;
    if (this.topicScroll) this.topicScroll.nativeElement.scrollTop = 0;
  }
}
