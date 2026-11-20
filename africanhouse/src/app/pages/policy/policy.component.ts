import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-policy',
  imports: [RouterLink],
  templateUrl: './policy.component.html',
  styleUrl: './policy.component.scss',
})
export class PolicyComponent {
  constructor(title: Title) {
    title.setTitle('Shopping Policy — AfriLoom Fabrics');
  }
}
