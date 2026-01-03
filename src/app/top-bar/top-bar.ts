import { Component, EventEmitter, Output } from '@angular/core';
import { RecipeInterface } from '../models/recipe';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  templateUrl: './top-bar.html',
  styleUrls: ['./top-bar.css'],
})
export class TopBarComponent {
  @Output() recipeChange = new EventEmitter<string>();
  @Output() loadFile = new EventEmitter<RecipeInterface>()

  onSelectChange(event?: any) {
    console.log(event.target.value)
    this.recipeChange.emit(event.target.value)
  } 
}
