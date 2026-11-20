import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class CustomerAuthService {
  private userSubject = new BehaviorSubject<User | null>(null);

  readonly user$: Observable<User | null> = this.userSubject.asObservable();

  constructor(private supabase: SupabaseService, private router: Router) {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.userSubject.next(data.session?.user ?? null);
    });

    this.supabase.client.auth.onAuthStateChange((_, session) => {
      this.userSubject.next(session?.user ?? null);
    });
  }

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  async signUp(email: string, password: string, fullName: string): Promise<string | null> {
    const { data, error } = await this.supabase.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return error.message;

    if (data.user) {
      await this.supabase.client.from('customer_profiles').upsert({
        id:        data.user.id,
        full_name: fullName,
      });
    }
    return null;
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    return null;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.router.navigate(['/account/login']);
  }

  async isAuthenticated(): Promise<boolean> {
    const { data } = await this.supabase.client.auth.getSession();
    return !!data.session;
  }

  async updateProfile(updates: { full_name?: string; phone?: string; location?: string }): Promise<string | null> {
    const user = this.currentUser;
    if (!user) return 'Not logged in';
    const { error } = await this.supabase.client
      .from('customer_profiles')
      .upsert({ id: user.id, ...updates, updated_at: new Date().toISOString() });
    return error ? error.message : null;
  }
}
