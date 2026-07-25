import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { CartItem } from '../models/order';
import { Fabric } from '../models/fabric';

@Injectable({ providedIn: 'root' })
export class CartService {
  private cartSubject = new BehaviorSubject<CartItem[]>([]);

  cart$ = this.cartSubject.asObservable();
  cartCount$ = this.cart$.pipe(map(items => items.reduce((sum, i) => sum + i.yards, 0)));
  cartTotal$ = this.cart$.pipe(map(items => items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0)));

  addToCart(fabric: Fabric, yards: number): void {
    const current = this.cartSubject.value;
    const existing = current.find(i => i.fabric.id === fabric.id);
    if (existing) {
      this.cartSubject.next(current.map(i => i.fabric.id === fabric.id ? { ...i, yards: i.yards + yards } : i));
    } else {
      this.cartSubject.next([...current, { fabric, yards }]);
    }
  }

  updateYards(fabricId: string, yards: number): void {
    if (yards <= 0) { this.removeItem(fabricId); return; }
    this.cartSubject.next(this.cartSubject.value.map(i => i.fabric.id === fabricId ? { ...i, yards } : i));
  }

  removeItem(fabricId: string): void {
    this.cartSubject.next(this.cartSubject.value.filter(i => i.fabric.id !== fabricId));
  }

  clearCart(): void {
    this.cartSubject.next([]);
  }

  getSnapshot(): CartItem[] {
    return this.cartSubject.value;
  }
}
