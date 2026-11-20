import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { CustomerAuthService } from '../services/customer-auth.service';

export const customerAuthGuard: CanActivateFn = async () => {
  const customerAuth = inject(CustomerAuthService);
  const router       = inject(Router);
  const authenticated = await customerAuth.isAuthenticated();
  if (!authenticated) {
    router.navigate(['/account/login']);
    return false;
  }
  return true;
};
