import { Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import { Fabric } from '../models/fabric';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FabricService {
  private db;
  private allFabrics$: Observable<Fabric[]> | null = null;

  constructor(private supabase: SupabaseService) {
    this.db = this.supabase.client;
  }

  getAll(): Observable<Fabric[]> {
    if (!this.allFabrics$) {
      this.allFabrics$ = from(
        this.db.from('fabrics').select('*').order('created_at', { ascending: false })
      ).pipe(
        map((res: any) => (res.data ?? []).map(this.mapRow)),
        shareReplay(1)
      );
    }
    return this.allFabrics$;
  }

  invalidateCache(): void {
    this.allFabrics$ = null;
  }

  getById(id: string): Observable<Fabric | undefined> {
    return from(
      this.db.from('fabrics').select('*').eq('id', id).single()
    ).pipe(
      map((res: any) => res.data ? this.mapRow(res.data) : undefined)
    );
  }

  getByCategory(category: Fabric['category']): Observable<Fabric[]> {
    return this.getAll().pipe(
      map(fabrics => fabrics.filter(f => f.category === category))
    );
  }

  getByMaterial(material: Fabric['material']): Observable<Fabric[]> {
    return this.getAll().pipe(
      map(fabrics => fabrics.filter(f => f.material === material))
    );
  }

  private mapRow(row: any): Fabric {
    const material = row.material as Fabric['material'];
    const bulkMaterial = ['gtp', 'holland', 'printex'].includes(material);
    const minYards = row.min_yard ? Number(row.min_yard) : bulkMaterial ? 6 : 2;
    const availableYards = row.available_yards != null ? Number(row.available_yards) : 0;
    return {
      id: String(row.id),
      name: row.name,
      description: row.description,
      category: row.category,
      colourPairing: row.colour_pairing ?? '',
      material,
      subcategory: row.subcategory ?? '',
      pricePerYard: Number(row.price_per_yard),
      imageUrl: row.image_url,
      inStock: row.in_stock,
      minYards,
      availableYards,
    };
  }
}
