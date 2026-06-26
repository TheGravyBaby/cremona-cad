import { Component, EventEmitter, Output, Input } from '@angular/core';
import { AboutModalComponent } from '../about-modal/about-modal';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [AboutModalComponent],
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Input() selectedRecipe: string = 'Beard';
  @Input() nightMode = false;
  @Output() recipeChange = new EventEmitter<string>();
  @Output() nightModeChange = new EventEmitter<boolean>();

  onSelectChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.recipeChange.emit(value);
  }

  onNightModeToggle() {
    this.nightModeChange.emit(!this.nightMode);
  }
}
