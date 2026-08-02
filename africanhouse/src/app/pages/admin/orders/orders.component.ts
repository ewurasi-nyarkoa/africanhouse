import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

export type OrderStatus = 'pending' | 'payment_confirmed' | 'packaging' | 'out_for_delivery' | 'delivered';

@Component({
  selector: 'app-orders',
  imports: [RouterLink, DatePipe, UpperCasePipe],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrdersComponent implements OnInit {
  orders: any[] = [];
  loading = true;

  statuses: { value: OrderStatus; label: string; icon: string }[] = [
    { value: 'pending', label: 'Pending', icon: '⏳' },
    { value: 'payment_confirmed', label: 'Payment Confirmed', icon: '✅' },
    { value: 'packaging', label: 'Packaging', icon: '📦' },
    { value: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚' },
    { value: 'delivered', label: 'Delivered', icon: '🎉' },
  ];

  private statusOrder: OrderStatus[] = ['pending', 'payment_confirmed', 'packaging', 'out_for_delivery', 'delivered'];

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const { data } = await this.supabase.client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    this.orders = data ?? [];
    this.loading = false;
    this.cdr.markForCheck();
  }

  isStepDone(currentStatus: OrderStatus, stepValue: OrderStatus): boolean {
    return this.statusOrder.indexOf(currentStatus) > this.statusOrder.indexOf(stepValue);
  }

  async updateStatus(orderId: number, status: OrderStatus): Promise<void> {
    await this.supabase.client.from('orders').update({ status }).eq('id', orderId);
    this.orders = this.orders.map(o => o.id === orderId ? { ...o, status } : o);
    this.cdr.markForCheck();
  }

  logout(): void { this.auth.logout(); }
}
