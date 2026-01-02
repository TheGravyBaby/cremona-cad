import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Output() recipeChange = new EventEmitter<string>();

  onSelectChange(event?: any) {
    console.log(event.target.value)
    this.recipeChange.emit(event.target.value)
  } 
}
