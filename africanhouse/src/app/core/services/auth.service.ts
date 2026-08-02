import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private loggedIn$ = new BehaviorSubject<boolean>(false);
  isLoggedIn$ = this.loggedIn$.asObservable();

  constructor(private supabase: SupabaseService, private router: Router) {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.loggedIn$.next(!!data.session);
    });

    this.supabase.client.auth.onAuthStateChange((_, session) => {
      this.loggedIn$.next(!!session);
    });
  }

  async login(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    this.router.navigate(['/admin/dashboard']);
    return null;
  }

  async logout(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.router.navigate(['/admin/login']);
  }

  async isAuthenticated(): Promise<boolean> {
    const { data } = await this.supabase.client.auth.getSession();
    return !!data.session;
  }
}
