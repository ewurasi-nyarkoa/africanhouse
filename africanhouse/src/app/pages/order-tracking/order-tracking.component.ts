import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SupabaseService } from '../../core/services/supabase.service';
import { Title } from '@angular/platform-browser';

type OrderStatus = 'pending' | 'payment_confirmed' | 'packaging' | 'out_for_delivery' | 'delivered';

@Component({
  selector: 'app-order-tracking',
  imports: [RouterLink, FormsModule],
  templateUrl: './order-tracking.component.html',
  styleUrl: './order-tracking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTrackingComponent implements OnInit, OnDestroy {
  orderId = '';
  order: any = null;
  loading = false;
  notFound = false;
  private destroy$ = new Subject<void>();
  private realtimeChannel: any = null;

  steps: { value: OrderStatus; label: string; icon: string; description: string }[] = [
    { value: 'pending', label: 'Order Placed', icon: '📝', description: 'We have received your order and are awaiting payment confirmation.' },
    { value: 'payment_confirmed', label: 'Payment Confirmed', icon: '✅', description: 'Your payment has been confirmed. Thank you!' },
    { value: 'packaging', label: 'Packaging', icon: '📦', description: 'Your fabric is being carefully packaged for delivery.' },
    { value: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚', description: 'Your order is on its way to you!' },
    { value: 'delivered', label: 'Delivered', icon: '🎉', description: 'Your fabric has been delivered. Enjoy!' },
  ];

  private statusOrder: OrderStatus[] = ['pending', 'payment_confirmed', 'packaging', 'out_for_delivery', 'delivered'];

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    private title: Title
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Track Your Order — African House');
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.orderId = params['id'];
        this.loadOrder(this.orderId);
      }
    });
  }

  async search(): Promise<void> {
    if (!this.orderId.trim()) return;
    await this.loadOrder(this.orderId.trim());
  }

  private async loadOrder(id: string): Promise<void> {
    this.loading = true;
    this.notFound = false;
    this.order = null;
    this.cdr.markForCheck();

    const { data } = await this.supabase.client
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (!data) {
      this.notFound = true;
    } else {
      this.order = data;
      this.subscribeToUpdates(data.id);
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  private subscribeToUpdates(orderId: number): void {
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
    }
    this.realtimeChannel = this.supabase.client
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, (payload: any) => {
        this.order = payload.new;
        this.cdr.markForCheck();
      })
      .subscribe();
  }

  getStepIndex(status: OrderStatus): number {
    return this.statusOrder.indexOf(status);
  }

  isStepDone(status: OrderStatus, stepValue: OrderStatus): boolean {
    return this.statusOrder.indexOf(status) > this.statusOrder.indexOf(stepValue);
  }

  isStepActive(status: OrderStatus, stepValue: OrderStatus): boolean {
    return status === stepValue;
  }

  get currentStep() {
    return this.steps.find(s => s.value === this.order?.status);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
    }
  }
}
