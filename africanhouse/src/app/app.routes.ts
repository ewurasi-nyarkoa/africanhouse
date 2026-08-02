import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'shop', loadComponent: () => import('./pages/shop/shop.component').then(m => m.ShopComponent) },
  { path: 'fabric/:id', loadComponent: () => import('./pages/fabric-detail/fabric-detail.component').then(m => m.FabricDetailComponent) },
  { path: 'cart', loadComponent: () => import('./pages/cart/cart.component').then(m => m.CartComponent) },
  { path: 'checkout', loadComponent: () => import('./pages/checkout/checkout.component').then(m => m.CheckoutComponent) },
  { path: 'admin/login', loadComponent: () => import('./pages/admin/login/login.component').then(m => m.LoginComponent) },
  { path: 'admin/dashboard', loadComponent: () => import('./pages/admin/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'admin/fabrics', loadComponent: () => import('./pages/admin/fabrics/fabrics.component').then(m => m.FabricsComponent), canActivate: [authGuard] },
  { path: 'admin/orders', loadComponent: () => import('./pages/admin/orders/orders.component').then(m => m.OrdersComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
