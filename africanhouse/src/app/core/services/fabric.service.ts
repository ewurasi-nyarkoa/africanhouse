import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Fabric } from '../models/fabric';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class FabricService {
  private db;

  constructor(private supabase: SupabaseService) {
    this.db = this.supabase.client;
  }

  getAll(): Observable<Fabric[]> {
    return from(
      this.db.from('fabrics').select('*').order('created_at', { ascending: false })
    ).pipe(
      map((res: any) => (res.data ?? []).map(this.mapRow))
    );
  }

  getById(id: string): Observable<Fabric | undefined> {
    return from(
      this.db.from('fabrics').select('*').eq('id', id).single()
    ).pipe(
      map((res: any) => res.data ? this.mapRow(res.data) : undefined)
    );
  }

  getByCategory(category: Fabric['category']): Observable<Fabric[]> {
    return from(
      this.db.from('fabrics').select('*').eq('category', category)
    ).pipe(
      map((res: any) => (res.data ?? []).map(this.mapRow))
    );
  }

  getByMaterial(material: Fabric['material']): Observable<Fabric[]> {
    return from(
      this.db.from('fabrics').select('*').eq('material', material)
    ).pipe(
      map((res: any) => (res.data ?? []).map(this.mapRow))
    );
  }

  private mapRow(row: any): Fabric {
    const material = row.material as Fabric['material'];
    const bulkMaterial = ['gtp', 'holland', 'printex'].includes(material);
    return {
      id: String(row.id),
      name: row.name,
      description: row.description,
      category: row.category,
      colourPairing: row.colour_pairing,
      material,
      pricePerYard: Number(row.price_per_yard),
      imageUrl: row.image_url,
      inStock: row.in_stock,
      minYards: row.min_yards ? Number(row.min_yards) : bulkMaterial ? 6 : 2,
      yardStep: row.yard_step ? Number(row.yard_step) : bulkMaterial ? 6 : 2
    };
  }
}
