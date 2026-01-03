import { Component } from '@angular/core';
import { Output, EventEmitter, Input } from "@angular/core";
import { RecipeInterface } from '../models/recipe';

@Component({
  selector: 'app-recipe-base',
  imports: [],
  templateUrl: './recipe-base.html',
  styleUrl: './recipe-base.css',
})

export class RecipeComponentBase {
    @Output() draftChange = new EventEmitter<Array<(arg: any) => void>>();
    @Input() set loadFile(file: RecipeInterface | undefined) {
        if (file) {
          this.d = file;
          this.draftChange.emit([this.firstRender]);
        }
    }
    d: RecipeInterface = {
        recipeName: "",
        fileName: "",
        version: "",
        draftData: undefined,
        calcs: undefined
    }

    firstRender(canvas: any) {

    }
    
}