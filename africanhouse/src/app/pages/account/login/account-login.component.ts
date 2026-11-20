import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CustomerAuthService } from '../../../core/services/customer-auth.service';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-account-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './account-login.component.html',
  styleUrl: './account-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountLoginComponent {
  form: ReturnType<FormBuilder['group']>;
  error   = '';
  loading = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    public customerAuth: CustomerAuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('Sign In — AfriLoom Fabrics');
    this.form = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error   = '';
    this.cdr.markForCheck();

    const { email, password } = this.form.value;
    const err = await this.customerAuth.signIn(email!, password!);
    if (err) {
      this.error   = 'Invalid email or password. Please try again.';
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.router.navigate(['/account']);
  }
}
