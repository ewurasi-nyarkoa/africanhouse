import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/order';
import { PromotionService, ActivePromotion } from '../../core/services/promotion.service';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, TitleCasePipe],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CartComponent implements OnInit, OnDestroy {
  items: CartItem[] = [];
  subtotal  = 0;
  discount  = 0;
  total     = 0;
  promotion: ActivePromotion | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private cartService: CartService,
    private promotionService: PromotionService,
    private cdr: ChangeDetectorRef,
    private title: Title
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Your Cart — AfriLoom Fabrics');

    combineLatest([
      this.cartService.cart$,
      this.promotionService.activePromotion$,
    ]).pipe(takeUntil(this.destroy$)).subscribe(([items, promo]) => {
      this.items     = items;
      this.promotion = promo;
      this.subtotal  = items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0);
      this.applyPromotion();
      this.cdr.markForCheck();
    });
  }

  private applyPromotion(): void {
    if (!this.promotion || this.subtotal < this.promotion.minOrderAmount) {
      this.discount = 0;
      this.total    = this.subtotal;
      return;
    }
    if (this.promotion.discountType === 'percentage') {
      this.discount = Math.round(this.subtotal * this.promotion.discountValue / 100 * 100) / 100;
    } else {
      this.discount = Math.min(this.promotion.discountValue, this.subtotal);
    }
    this.total = Math.round((this.subtotal - this.discount) * 100) / 100;
  }

  canIncrement(item: CartItem): boolean {
    return item.yards + item.fabric.minYards <= item.fabric.availableYards;
  }

  canDecrement(item: CartItem): boolean {
    return item.yards > item.fabric.minYards;
  }

  increment(item: CartItem): void {
    if (this.canIncrement(item)) {
      this.cartService.updateYards(item.fabric.id, item.yards + item.fabric.minYards);
    }
  }

  decrement(item: CartItem): void {
    if (this.canDecrement(item)) {
      this.cartService.updateYards(item.fabric.id, item.yards - item.fabric.minYards);
    }
  }

  remove(item: CartItem): void {
    this.cartService.removeItem(item.fabric.id);
  }

  clearCart(): void {
    this.cartService.clearCart();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
