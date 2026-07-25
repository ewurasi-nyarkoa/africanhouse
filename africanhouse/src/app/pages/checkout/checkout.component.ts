import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/order';
import { Title } from '@angular/platform-browser';
import { SupabaseService } from '../../core/services/supabase.service';

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
  private destroy$ = new Subject<void>();

  paymentMethods = [
    { value: 'mtn-momo', label: 'MTN Mobile Money', icon: '📱' },
    { value: 'vodafone-cash', label: 'Vodafone Cash', icon: '📱' },
    { value: 'bank-transfer', label: 'Bank Transfer', icon: '🏦' },
  ];

  constructor(
    private fb: FormBuilder,
    private cartService: CartService,
    private supabase: SupabaseService,
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
      paymentMethod: ['mtn-momo', Validators.required],
      momoNumber: [''],
    });

    this.form.get('paymentMethod')!.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(method => {
      const momoCtrl = this.form.get('momoNumber')!;
      if (method === 'mtn-momo' || method === 'vodafone-cash') {
        momoCtrl.setValidators([Validators.required, Validators.pattern(/^0[0-9]{9}$/)]);
      } else {
        momoCtrl.clearValidators();
      }
      momoCtrl.updateValueAndValidity();
      this.cdr.markForCheck();
    });

    this.form.get('paymentMethod')!.updateValueAndValidity();

    this.cartService.cart$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.items = items;
      this.total = items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0);
      this.cdr.markForCheck();
    });
  }

  get isMobileMoney(): boolean {
    const method = this.form.get('paymentMethod')?.value;
    return method === 'mtn-momo' || method === 'vodafone-cash';
  }

  get selectedMethod() {
    return this.form.get('paymentMethod')?.value;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.items.length === 0) {
      this.form.markAllAsTouched();
      return;
    }
    this.placing = true;
    this.orderError = '';
    this.cdr.markForCheck();

    const { fullName, phone, location, deliveryNote, paymentMethod, momoNumber } = this.form.value;

    const { error } = await this.supabase.client.from('orders').insert({
      customer_name: fullName,
      customer_phone: phone,
      location,
      delivery_note: deliveryNote,
      payment_method: paymentMethod,
      momo_number: momoNumber,
      total_amount: this.total,
      status: 'pending',
      items: this.items.map(i => ({
        fabric_id: i.fabric.id,
        fabric_name: i.fabric.name,
        material: i.fabric.material,
        yards: i.yards,
        price_per_yard: i.fabric.pricePerYard,
        subtotal: i.fabric.pricePerYard * i.yards
      }))
    });

    if (error) {
      this.orderError = 'Something went wrong placing your order. Please call us on 0240 070 628.';
      this.placing = false;
    } else {
      this.submitted = true;
      this.cartService.clearCart();
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
