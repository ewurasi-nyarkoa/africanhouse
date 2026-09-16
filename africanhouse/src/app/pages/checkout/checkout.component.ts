import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/order';
import { Title } from '@angular/platform-browser';
import { SupabaseService } from '../../core/services/supabase.service';
import { PaymentService } from '../../core/services/payment.service';

@Component({
  selector: 'app-checkout',
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  items: CartItem[] = [];
  total = 0;
  submitted = false;
  placing = false;
  orderError = '';
  orderId: number | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private cartService: CartService,
    private supabase: SupabaseService,
    private paymentService: PaymentService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private title: Title,
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Checkout — AfriLoom Fabrics');
    this.form = this.fb.group({
      fullName:     ['', [Validators.required, Validators.minLength(2)]],
      phone:        ['', [Validators.required, Validators.pattern(/^0[0-9]{9}$/)]],
      location:     ['', Validators.required],
      deliveryNote: [''],
    });

    this.cartService.cart$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.items = items;
      this.total = items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0);
      this.cdr.markForCheck();
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.placing = true;
    this.orderError = '';
    this.cdr.markForCheck();

    const { fullName, phone, location, deliveryNote } = this.form.value;

    const fabricIds = this.items.map(i => Number(i.fabric.id));
    const { data: freshFabrics } = await this.supabase.client
      .from('fabrics')
      .select('id, available_yards, min_yard, in_stock')
      .in('id', fabricIds);

    for (const item of this.items) {
      const live = (freshFabrics ?? []).find((f: any) => String(f.id) === item.fabric.id);
      if (!live || !live.in_stock || Number(live.available_yards) < item.yards) {
        const available = live ? Number(live.available_yards) : 0;
        this.orderError = `Only ${available} yard${available === 1 ? '' : 's'} are currently available for "${item.fabric.name}". Please update your cart before continuing.`;
        this.placing = false;
        this.cdr.markForCheck();
        return;
      }
    }

    let paystackReference: string;
    try {
      const result = await this.paymentService.openPaystack(
        `${phone}@africanhouse.com`,
        this.total,
        { customer_name: fullName, phone, location },
      );
      paystackReference = result.reference;
    } catch {
      this.orderError = 'Payment was cancelled. Please try again.';
      this.placing = false;
      this.cdr.markForCheck();
      return;
    }

    for (const item of this.items) {
      const { data: rpcData, error: rpcError } = await this.supabase.client.rpc(
        'deduct_inventory',
        { p_fabric_id: Number(item.fabric.id), p_yards: item.yards },
      );

      if (rpcError || rpcData?.success === false) {
        const reason = rpcData?.message ?? rpcError?.message ?? 'Inventory error';
        this.orderError = `Unable to complete your order: ${reason}. Please call us on 0240 070 628.`;
        this.placing = false;
        this.cdr.markForCheck();
        return;
      }
    }

    const { data: costsData } = await this.supabase.client
      .from('fabric_costs')
      .select('fabric_id, full_piece_cost')
      .in('fabric_id', fabricIds);

    const costsMap = new Map<number, number>();
    for (const row of costsData ?? []) {
      costsMap.set(Number(row.fabric_id), Number(row.full_piece_cost ?? 0));
    }

    const { data, error } = await this.supabase.client.from('orders').insert({
      customer_name:       fullName,
      customer_phone:      phone,
      location,
      delivery_note:       deliveryNote,
      paystack_reference:  paystackReference,
      total_amount:        this.total,
      status:              'payment_confirmed',
      items: this.items.map(i => {
        const fullPieceCost  = costsMap.get(Number(i.fabric.id)) ?? 0;
        const costPerYardAtSale = fullPieceCost > 0 ? fullPieceCost / 12 : 0;
        return {
          fabric_id:            i.fabric.id,
          fabric_name:          i.fabric.name,
          image_url:            i.fabric.imageUrl,
          material:             i.fabric.material,
          category:             i.fabric.category,
          yards:                i.yards,
          price_per_yard:       i.fabric.pricePerYard,
          subtotal:             i.fabric.pricePerYard * i.yards,
          cost_per_yard_at_sale: costPerYardAtSale,
        };
      }),
    }).select('id').single();

    if (error) {
      this.orderError = 'Something went wrong saving your order. Please call us on 0240 070 628.';
    } else {
      this.orderId = data.id;
      this.submitted = true;
      this.cartService.clearCart();
      this.router.navigate(['/track', data.id]);
    }

    this.placing = false;
    this.cdr.markForCheck();
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
