import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-subscribe-form',
  imports: [FormsModule],
  templateUrl: './subscribe-form.component.html',
  styleUrl: './subscribe-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubscribeFormComponent {
  email = '';
  submitted = false;

  onSubmit(): void {
    if (!this.email) return;
    // TODO: connect to Supabase subscribers table
    console.log('Subscribe:', this.email);
    this.submitted = true;
    this.email = '';
  }
}
