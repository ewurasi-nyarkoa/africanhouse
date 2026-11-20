import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router   = inject(Router);

  const { data: sessionData } = await supabase.client.auth.getSession();
  if (!sessionData.session) {
    router.navigate(['/admin/login']);
    return false;
  }

  const { data: isAdmin, error } = await supabase.client.rpc('is_admin');
  if (error || !isAdmin) {
    await supabase.client.auth.signOut();
    router.navigate(['/admin/login']);
    return false;
  }

  return true;
};
