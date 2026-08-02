import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  form!: ReturnType<FormBuilder['group']>;
  error = '';
  loading = false;

  constructor(private fb: FormBuilder, private auth: AuthService, private cdr: ChangeDetectorRef) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    const { email, password } = this.form.value;
    const error = await this.auth.login(email!, password!);
    if (error) {
      this.error = 'Invalid email or password.';
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
