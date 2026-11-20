import { Injectable } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { CartItem } from '../models/order';
import { Fabric } from '../models/fabric';
import { SupabaseService } from './supabase.service';
import { CustomerAuthService } from './customer-auth.service';

const GUEST_CART_KEY = 'afriloom_cart_guest';

interface StoredCartItem {
  fabricId: string;
  yards: number;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private cartSubject = new BehaviorSubject<CartItem[]>([]);

  cart$       = this.cartSubject.asObservable();
  cartCount$  = this.cart$.pipe(map(items => items.reduce((sum, i) => sum + i.yards, 0)));
  cartTotal$  = this.cart$.pipe(map(items => items.reduce((sum, i) => sum + i.fabric.pricePerYard * i.yards, 0)));

  constructor(
    private supabase: SupabaseService,
    private customerAuth: CustomerAuthService,
  ) {
    this.init();
  }

  private async init(): Promise<void> {
    const user = this.customerAuth.currentUser;
    if (user) {
      await this.loadAccountCart(user.id);
    } else {
      this.loadGuestCart();
    }

    this.customerAuth.user$.subscribe(async u => {
      if (u) {
        await this.onSignIn(u.id);
      } else {
        this.onSignOut();
      }
    });
  }

  private loadGuestCart(): void {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY);
      if (!raw) return;
      const stored: StoredCartItem[] = JSON.parse(raw);
      if (!Array.isArray(stored) || stored.length === 0) return;
      this.hydrateFromStored(stored).then(items => {
        if (items.length > 0) this.cartSubject.next(items);
      });
    } catch {
      localStorage.removeItem(GUEST_CART_KEY);
    }
  }

  private async loadAccountCart(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('customer_carts')
      .select('fabric_id, yards')
      .eq('customer_id', userId);

    if (error || !data?.length) return;

    const stored: StoredCartItem[] = data.map((r: any) => ({
      fabricId: String(r.fabric_id),
      yards:    Number(r.yards),
    }));

    const items = await this.hydrateFromStored(stored);
    if (items.length > 0) this.cartSubject.next(items);
  }

  private async onSignIn(userId: string): Promise<void> {
    const guestItems = this.cartSubject.value;
    const { data: dbRows } = await this.supabase.client
      .from('customer_carts')
      .select('fabric_id, yards')
      .eq('customer_id', userId);

    const dbStored: StoredCartItem[] = (dbRows ?? []).map((r: any) => ({
      fabricId: String(r.fabric_id),
      yards:    Number(r.yards),
    }));

    const dbItems = await this.hydrateFromStored(dbStored);
    const merged  = this.mergeItems(guestItems, dbItems);

    this.cartSubject.next(merged);
    localStorage.removeItem(GUEST_CART_KEY);
    await this.persistToAccount(userId, merged);
  }

  private onSignOut(): void {
    this.saveGuestCart(this.cartSubject.value);
    this.cartSubject.next([]);
  }

  private mergeItems(guest: CartItem[], account: CartItem[]): CartItem[] {
    const merged = [...account];
    for (const gItem of guest) {
      const existing = merged.find(i => i.fabric.id === gItem.fabric.id);
      if (existing) {
        existing.yards = Math.min(
          existing.yards + gItem.yards,
          existing.fabric.availableYards,
        );
      } else {
        const capped = Math.min(gItem.yards, gItem.fabric.availableYards);
        if (capped >= gItem.fabric.minYards) {
          merged.push({ ...gItem, yards: capped });
        }
      }
    }
    return merged.filter(i => i.yards >= i.fabric.minYards && i.yards <= i.fabric.availableYards);
  }

  private async hydrateFromStored(stored: StoredCartItem[]): Promise<CartItem[]> {
    if (!stored.length) return [];
    const ids = stored.map(s => Number(s.fabricId));
    const { data: fabrics } = await this.supabase.client
      .from('fabrics')
      .select('*')
      .in('id', ids);

    if (!fabrics?.length) return [];

    const items: CartItem[] = [];
    for (const s of stored) {
      const row = fabrics.find((f: any) => String(f.id) === s.fabricId);
      if (!row) continue;

      const bulkMaterial = ['gtp', 'holland', 'printex'].includes(row.material);
      const minYards      = row.min_yard ? Number(row.min_yard) : bulkMaterial ? 6 : 2;
      const availableYards = row.available_yards != null ? Number(row.available_yards) : 0;

      if (!row.in_stock || availableYards < minYards) continue;

      const yards = Math.min(s.yards, availableYards);
      const roundedYards = Math.floor(yards / minYards) * minYards;
      if (roundedYards < minYards) continue;

      const fabric: Fabric = {
        id:            String(row.id),
        name:          row.name,
        description:   row.description,
        category:      row.category,
        colourPairing: row.colour_pairing ?? '',
        material:      row.material,
        subcategory:   row.subcategory ?? '',
        pricePerYard:  Number(row.price_per_yard),
        imageUrl:      row.image_url,
        inStock:       row.in_stock,
        minYards,
        availableYards,
      };

      items.push({ fabric, yards: roundedYards });
    }
    return items;
  }

  private saveGuestCart(items: CartItem[]): void {
    const stored: StoredCartItem[] = items.map(i => ({
      fabricId: i.fabric.id,
      yards:    i.yards,
    }));
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(stored));
  }

  private async persistToAccount(userId: string, items: CartItem[]): Promise<void> {
    await this.supabase.client
      .from('customer_carts')
      .delete()
      .eq('customer_id', userId);

    if (items.length === 0) return;

    await this.supabase.client.from('customer_carts').insert(
      items.map(i => ({
        customer_id: userId,
        fabric_id:   Number(i.fabric.id),
        yards:       i.yards,
      }))
    );
  }

  private save(items: CartItem[]): void {
    this.cartSubject.next(items);
    const userId = this.customerAuth.currentUser?.id;
    if (userId) {
      this.persistToAccount(userId, items);
    } else {
      this.saveGuestCart(items);
    }
  }

  yardsInCart(fabricId: string): number {
    return this.cartSubject.value.find(i => i.fabric.id === fabricId)?.yards ?? 0;
  }

  addToCart(fabric: Fabric, yards: number): void {
    const current  = this.cartSubject.value;
    const existing = current.find(i => i.fabric.id === fabric.id);
    let next: CartItem[];
    if (existing) {
      const capped = Math.min(existing.yards + yards, fabric.availableYards);
      next = current.map(i => i.fabric.id === fabric.id ? { ...i, yards: capped } : i);
    } else {
      const capped = Math.min(yards, fabric.availableYards);
      next = [...current, { fabric, yards: capped }];
    }
    this.save(next);
  }

  updateYards(fabricId: string, yards: number): void {
    if (yards <= 0) { this.removeItem(fabricId); return; }
    this.save(this.cartSubject.value.map(i => i.fabric.id === fabricId ? { ...i, yards } : i));
  }

  removeItem(fabricId: string): void {
    this.save(this.cartSubject.value.filter(i => i.fabric.id !== fabricId));
  }

  clearCart(): void {
    const userId = this.customerAuth.currentUser?.id;
    this.cartSubject.next([]);
    if (userId) {
      this.supabase.client.from('customer_carts').delete().eq('customer_id', userId);
    } else {
      localStorage.removeItem(GUEST_CART_KEY);
    }
  }

  getSnapshot(): CartItem[] {
    return this.cartSubject.value;
  }
}
