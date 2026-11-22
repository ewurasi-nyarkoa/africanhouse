import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-subscribe-form',
  imports: [FormsModule],
  templateUrl: './subscribe-form.component.html',
  styleUrl: './subscribe-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubscribeFormComponent {
  email     = '';
  consent   = false;
  submitted = false;
  error     = '';

  constructor(
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async onSubmit(): Promise<void> {
    if (!this.email || !this.consent) return;

    const { error } = await this.supabase.client.functions.invoke('subscribe', {
      body: {
        email: this.email,
        consent: this.consent,
        consentVersion: 'homepage-marketing-v1',
      },
    });

    if (error) {
      this.error = 'Something went wrong. Please try again.';
    } else {
      this.submitted = true;
    }

    this.email = '';
    this.consent = false;
    this.cdr.markForCheck();
  }
}
