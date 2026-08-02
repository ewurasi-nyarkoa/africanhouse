import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authenticated = await auth.isAuthenticated();
  if (!authenticated) {
    router.navigate(['/admin/login']);
    return false;
  }
  return true;
};
