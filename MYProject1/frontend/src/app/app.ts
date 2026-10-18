import { Component } from '@angular/core';
import { ProfileSearchComponent } from './profile-search.component';

@Component({
  imports: [ProfileSearchComponent],
  selector: 'app-root',
  template: '<app-profile-search />',
})
export class App {
}
