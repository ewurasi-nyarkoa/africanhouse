import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

export type OrderStatus =
  | 'pending'
  | 'payment_confirmed'
  | 'packaging'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered';

interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  delivered: number;
  revenue: number;
}

@Component({
  selector: 'app-orders',
  imports: [RouterLink, RouterLinkActive, DatePipe, DecimalPipe, UpperCasePipe],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent implements OnInit {
  allOrders: any[] = [];
  filtered: any[] = [];
  loading = true;
  menuOpen = false;

  searchQuery   = '';
  filterStatus  = '';

  stats: OrderStats = { total: 0, pending: 0, processing: 0, delivered: 0, revenue: 0 };

  readonly statuses: { value: OrderStatus; label: string; icon: string }[] = [
    { value: 'pending',             label: 'Order Placed',       icon: '1' },
    { value: 'payment_confirmed',   label: 'Payment Confirmed',  icon: '2' },
    { value: 'packaging',           label: 'Order Processing',   icon: '3' },
    { value: 'ready_for_delivery',  label: 'Ready for Delivery', icon: '4' },
    { value: 'out_for_delivery',    label: 'Out for Delivery',   icon: '5' },
    { value: 'delivered',           label: 'Delivered',          icon: '6' },
  ];

  private readonly statusOrder: OrderStatus[] = [
    'pending', 'payment_confirmed', 'packaging',
    'ready_for_delivery', 'out_for_delivery', 'delivered',
  ];

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    const { data } = await this.supabase.client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    this.allOrders = data ?? [];
    this.computeStats();
    this.applyFilters();
    this.loading = false;
    this.cdr.markForCheck();
  }

  private computeStats(): void {
    const processingStatuses: OrderStatus[] = ['payment_confirmed', 'packaging', 'ready_for_delivery', 'out_for_delivery'];
    this.stats = {
      total:      this.allOrders.length,
      pending:    this.allOrders.filter(o => o.status === 'pending').length,
      processing: this.allOrders.filter(o => processingStatuses.includes(o.status)).length,
      delivered:  this.allOrders.filter(o => o.status === 'delivered').length,
      revenue:    this.allOrders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0),
    };
  }

  applyFilters(): void {
    const q  = this.searchQuery.toLowerCase().trim();
    const st = this.filterStatus;

    this.filtered = this.allOrders.filter(o => {
      const matchSearch = !q
        || String(o.id).includes(q)
        || (o.customer_name ?? '').toLowerCase().includes(q)
        || (o.customer_phone ?? '').includes(q);
      const matchStatus = !st || o.status === st;
      return matchSearch && matchStatus;
    });
  }

  onSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onStatusFilter(event: Event): void {
    this.filterStatus = (event.target as HTMLSelectElement).value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  isStepDone(currentStatus: OrderStatus, stepValue: OrderStatus): boolean {
    return this.statusOrder.indexOf(currentStatus) > this.statusOrder.indexOf(stepValue);
  }

  async updateStatus(orderId: number, status: OrderStatus): Promise<void> {
    await this.supabase.client.from('orders').update({ status }).eq('id', orderId);
    this.allOrders = this.allOrders.map(o => o.id === orderId ? { ...o, status } : o);
    this.computeStats();
    this.applyFilters();
    this.cdr.markForCheck();
  }

  getStatusLabel(status: OrderStatus): string {
    return this.statuses.find(s => s.value === status)?.label ?? status;
  }

  computeOrderProfit(order: any): { profit: number; known: boolean } {
    let profit = 0;
    let known  = false;
    for (const item of order.items ?? []) {
      const costPerYard = Number(item.cost_per_yard_at_sale ?? 0);
      if (costPerYard > 0) {
        known   = true;
        profit += (Number(item.yards ?? 0) * Number(item.price_per_yard ?? 0))
                - (Number(item.yards ?? 0) * costPerYard);
      }
    }
    return { profit, known };
  }

  logout(): void { this.auth.logout(); }
}
