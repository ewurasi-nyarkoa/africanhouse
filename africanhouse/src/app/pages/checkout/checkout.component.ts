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
  changeDetection: ChangeDetectionStrategy.OnPush
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
    private title: Title
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Checkout — African House');
    this.form = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(/^0[0-9]{9}$/)]],
      location: ['', Validators.required],
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

    // Open Paystack popup first — order only saves on success
    let paystackReference: string;
    try {
      const result = await this.paymentService.openPaystack(
        `${phone}@africanhouse.com`,
        this.total,
        { customer_name: fullName, phone, location }
      );
      paystackReference = result.reference;
    } catch {
      this.orderError = 'Payment was cancelled. Please try again.';
      this.placing = false;
      this.cdr.markForCheck();
      return;
    }

    const { data, error } = await this.supabase.client.from('orders').insert({
      customer_name: fullName,
      customer_phone: phone,
      location,
      delivery_note: deliveryNote,
      paystack_reference: paystackReference,
      total_amount: this.total,
      status: 'payment_confirmed',
      items: this.items.map(i => ({
        fabric_id: i.fabric.id,
        fabric_name: i.fabric.name,
        image_url: i.fabric.imageUrl,
        material: i.fabric.material,
        yards: i.yards,
        price_per_yard: i.fabric.pricePerYard,
        subtotal: i.fabric.pricePerYard * i.yards
      }))
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
