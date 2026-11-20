import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerAuthService } from '../../../core/services/customer-auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-account-profile',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account-profile.component.html',
  styleUrl: './account-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfileComponent implements OnInit {
  form: FormGroup;
  saving = false;
  saved = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private customerAuth: CustomerAuthService,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('Edit Profile — AfriLoom Fabrics');
    this.form = this.fb.group({
      full_name: ['', [Validators.required, Validators.minLength(2)]],
      phone:    ['', [Validators.pattern(/^0[0-9]{9}$/)]],
      location: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    const user = this.customerAuth.currentUser;
    if (!user) return;

    const { data } = await this.supabase.client
      .from('customer_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      this.form.patchValue({
        full_name: data.full_name ?? '',
        phone:    data.phone ?? '',
        location: data.location ?? '',
      });
    }
    this.cdr.markForCheck();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    this.error  = '';
    this.saved  = false;
    this.cdr.markForCheck();

    const err = await this.customerAuth.updateProfile(this.form.value);
    if (err) {
      this.error = err;
    } else {
      this.saved = true;
    }
    this.saving = false;
    this.cdr.markForCheck();
  }
}
