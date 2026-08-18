import { Component, EventEmitter, Output, Input, inject } from '@angular/core';
import { AboutModalComponent } from '../about-modal/about-modal';
import { UndoCoordinator } from '../helpers/undoCoordinator';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AboutModalComponent],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Output() recipeChange = new EventEmitter<string>();

  /** Owned by App, which persists it and puts the day-mode class on the document. Up here rather
   * than on the canvas's bottom bar because it dresses the whole app, not the drawing. */
  @Input() nightMode = true;
  @Output() nightModeChange = new EventEmitter<boolean>();

  // Root singleton — merges the open recipe's param history with the draft-canvas toolbox's
  // shape history, so these buttons act on whichever acted most recently. See undoCoordinator.ts.
  protected readonly undoCoordinator = inject(UndoCoordinator);

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }
}
