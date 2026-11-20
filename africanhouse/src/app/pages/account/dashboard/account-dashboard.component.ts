import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CustomerAuthService } from '../../../core/services/customer-auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Title } from '@angular/platform-browser';

type OrderTab = 'active' | 'history';

@Component({
  selector: 'app-account-dashboard',
  imports: [RouterLink, DatePipe],
  templateUrl: './account-dashboard.component.html',
  styleUrl: './account-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDashboardComponent implements OnInit, OnDestroy {
  profile: any = null;
  orders: any[] = [];
  loadingOrders = true;
  activeTab: OrderTab = 'active';
  private destroy$ = new Subject<void>();

  get user() { return this.customerAuth.currentUser; }

  get activeOrders(): any[] {
    return this.orders.filter(o => o.status !== 'delivered');
  }

  get historyOrders(): any[] {
    return this.orders.filter(o => o.status === 'delivered');
  }

  get displayedOrders(): any[] {
    return this.activeTab === 'active' ? this.activeOrders : this.historyOrders;
  }

  constructor(
    public customerAuth: CustomerAuthService,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('My Account — AfriLoom Fabrics');
  }

  async ngOnInit(): Promise<void> {
    const user = this.user;
    if (!user) return;

    const [profileRes, ordersRes] = await Promise.all([
      this.supabase.client
        .from('customer_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(),
      this.supabase.client.rpc('get_my_orders'),
    ]);

    this.profile       = profileRes.data;
    this.orders        = ordersRes.data ?? [];
    this.loadingOrders = false;
    this.cdr.markForCheck();
  }

  setTab(tab: OrderTab): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:           'Order Placed',
      payment_confirmed: 'Payment Confirmed',
      packaging:         'Packaging',
      out_for_delivery:  'Out for Delivery',
      delivered:         'Delivered',
    };
    return labels[status] ?? status;
  }

  async signOut(): Promise<void> {
    await this.customerAuth.signOut();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
