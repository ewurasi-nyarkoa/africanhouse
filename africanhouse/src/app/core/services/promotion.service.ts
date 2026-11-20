import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface ActivePromotion {
  id: number;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  appliesToCategories: string[] | null;
}

@Injectable({ providedIn: 'root' })
export class PromotionService {
  private promotionSubject = new BehaviorSubject<ActivePromotion | null>(null);
  activePromotion$ = this.promotionSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.load();
  }

  async load(): Promise<void> {
    const { data } = await this.supabase.client.rpc('get_active_promotion');
    if (data) {
      this.promotionSubject.next({
        id:                  data.id,
        name:                data.name,
        description:         data.description ?? '',
        discountType:        data.discount_type as 'percentage' | 'fixed',
        discountValue:       Number(data.discount_value),
        minOrderAmount:      Number(data.min_order_amount ?? 0),
        appliesToCategories: data.applies_to_categories ?? null,
      });
    } else {
      this.promotionSubject.next(null);
    }
  }

  get snapshot(): ActivePromotion | null {
    return this.promotionSubject.value;
  }
}
