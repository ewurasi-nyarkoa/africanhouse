import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CustomerAuthService } from '../../../core/services/customer-auth.service';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-account-signup',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account-signup.component.html',
  styleUrl: './account-signup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSignupComponent {
  form: ReturnType<FormBuilder['group']>;
  error   = '';
  success = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private customerAuth: CustomerAuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('Create Account — AfriLoom Fabrics');
    this.form = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error   = '';
    this.cdr.markForCheck();

    const { fullName, email, password } = this.form.value;
    const err = await this.customerAuth.signUp(email!, password!, fullName!);
    if (err) {
      this.error   = err;
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.success = 'Account created! Check your email to confirm, then sign in.';
    this.loading = false;
    this.cdr.markForCheck();
  }
}
