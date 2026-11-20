import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DecimalPipe } from '@angular/common';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/order';
import { Title } from '@angular/platform-browser';
import { SupabaseService } from '../../core/services/supabase.service';
import { PaymentService } from '../../core/services/payment.service';
import { PromotionService, ActivePromotion } from '../../core/services/promotion.service';
import { CustomerAuthService } from '../../core/services/customer-auth.service';

@Component({
  selector: 'app-checkout',
  imports: [RouterLink, ReactiveFormsModule, DecimalPipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  items: CartItem[] = [];
  subtotal    = 0;
  discount    = 0;
  finalTotal  = 0;
  promotion: ActivePromotion | null = null;

  submitted  = false;
  placing    = false;
  orderError = '';
  orderId: number | null = null;
  trackingToken = '';

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private cartService: CartService,
    private supabase: SupabaseService,
    private paymentService: PaymentService,
    private promotionService: PromotionService,
    private customerAuth: CustomerAuthService,
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
      this.items    = items;
      this.subtotal = items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0);
      this.applyPromotion();
      this.cdr.markForCheck();
    });

    this.promotionService.activePromotion$
      .pipe(takeUntil(this.destroy$))
      .subscribe(promo => {
        this.promotion = promo;
        this.applyPromotion();
        this.cdr.markForCheck();
      });
  }

  private applyPromotion(): void {
    if (!this.promotion || this.subtotal < this.promotion.minOrderAmount) {
      this.discount   = 0;
      this.finalTotal = this.subtotal;
      return;
    }
    if (this.promotion.discountType === 'percentage') {
      this.discount = Math.round(this.subtotal * this.promotion.discountValue / 100 * 100) / 100;
    } else {
      this.discount = Math.min(this.promotion.discountValue, this.subtotal);
    }
    this.finalTotal = Math.round((this.subtotal - this.discount) * 100) / 100;
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

    // Open Paystack popup — amount is the server-calculated finalTotal
    let paystackReference: string;
    try {
      const result = await this.paymentService.openPaystack(
        `${phone}@africanhouse.com`,
        this.finalTotal,
        { customer_name: fullName, phone, location },
      );
      paystackReference = result.reference;
    } catch {
      this.orderError = 'Payment was cancelled. Please try again.';
      this.placing = false;
      this.cdr.markForCheck();
      return;
    }

    // Call the Edge Function — server verifies payment + creates order
    const { data, error } = await this.supabase.client.functions.invoke('process-order', {
      body: {
        paystackReference,
        customerName:  fullName,
        customerPhone: phone,
        location,
        deliveryNote:  deliveryNote ?? '',
        cartItems:     this.items.map(i => ({ fabricId: i.fabric.id, yards: i.yards })),
        promotionId:   this.promotion?.id ?? null,
        customerId:    this.customerAuth.currentUser?.id ?? null,
      },
    });

    if (error || !data?.orderId) {
      this.orderError = data?.error
        ?? error?.message
        ?? 'Something went wrong. Please contact us on 0240 070 628 with your payment reference.';
      this.placing = false;
      this.cdr.markForCheck();
      return;
    }

    this.orderId       = data.orderId;
    this.trackingToken = data.trackingToken;
    this.submitted     = true;
    this.cartService.clearCart();
    this.router.navigate(['/track', data.orderId]);

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
