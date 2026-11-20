import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CustomerAuthService } from '../../../core/services/customer-auth.service';
import { Title } from '@angular/platform-browser';

function strongPassword(control: AbstractControl): { [key: string]: boolean } | null {
  const value = control.value as string;
  if (!value) return null;
  if (value.length < 7) return { tooShort: true };
  if (!/[0-9]/.test(value) && !/[^a-zA-Z0-9]/.test(value)) return { needsNumberOrSymbol: true };
  return null;
}

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
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    public customerAuth: CustomerAuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('Create Account — AfriLoom Fabrics');
    this.form = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, strongPassword]],
    });
  }

  get passwordInvalid(): boolean {
    const ctrl = this.form.get('password');
    return !!ctrl?.invalid && !!ctrl?.touched;
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

    const signInErr = await this.customerAuth.signIn(email!, password!);
    if (signInErr) {
      this.success = 'Account created! Please sign in to continue.';
      this.loading = false;
      this.router.navigate(['/account/login']);
    } else {
      this.router.navigate(['/account']);
    }
    this.cdr.markForCheck();
  }
}
