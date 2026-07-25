import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CartService } from '../../core/services/cart.service';
import { CartItem } from '../../core/models/order';
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
  total = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private cartService: CartService,
    private cdr: ChangeDetectorRef,
    private title: Title
  ) {}

  ngOnInit(): void {
    this.title.setTitle('Your Cart — African House');
    this.cartService.cart$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.items = items;
      this.total = items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0);
      this.cdr.markForCheck();
    });
  }

  increment(item: CartItem): void {
    this.cartService.updateYards(item.fabric.id, item.yards + item.fabric.yardStep);
  }

  decrement(item: CartItem): void {
    const next = item.yards - item.fabric.yardStep;
    if (next >= item.fabric.minYards) {
      this.cartService.updateYards(item.fabric.id, next);
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
