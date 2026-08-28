import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  getSubcategoriesForCategory,
  SubcategoryOption,
  MainCategory,
} from '../../../core/models/filter-config';

interface FabricRow {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  material: string;
  price_per_yard: number;
  min_yard: number;
  available_yards: number;
  in_stock: boolean;
  image_url: string;
  full_piece_cost: number;
}

@Component({
  selector: 'app-fabrics',
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, DecimalPipe, TitleCasePipe],
  templateUrl: './fabrics.component.html',
  styleUrl: './fabrics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FabricsComponent implements OnInit {
  form!: FormGroup;
  allFabrics: FabricRow[] = [];
  filtered: FabricRow[] = [];
  loading = true;
  saving = false;
  showForm = false;
  menuOpen = false;
  editingId: number | null = null;
  uploadFile: File | null = null;
  error = '';

  searchQuery = '';
  filterCategory = '';
  filterStock = '';

  readonly categories = ['everyday', 'funeral', 'kente'];
  readonly materials  = ['gtp', 'holland', 'printex', 'soso', 'kente', 'small-material'];
  subcategoryOptions: SubcategoryOption[] = [];

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      name:             ['', Validators.required],
      description:      ['', Validators.required],
      category:         ['everyday', Validators.required],
      subcategory:      ['', Validators.required],
      material:         ['gtp', Validators.required],
      price_per_yard:   [0, [Validators.required, Validators.min(1)]],
      full_piece_cost:  [0, [Validators.required, Validators.min(0)]],
      min_yards:        [4, [Validators.required, Validators.min(1)]],
      available_yards:  [0, [Validators.required, Validators.min(0)]],
      in_stock:         [true],
    });

    this.updateSubcategoryOptions('everyday');

    this.form.get('category')!.valueChanges.subscribe((cat: MainCategory) => {
      this.form.get('subcategory')!.setValue('');
      this.updateSubcategoryOptions(cat);
      this.cdr.markForCheck();
    });
  }

  private updateSubcategoryOptions(category: MainCategory): void {
    this.subcategoryOptions = getSubcategoriesForCategory(category);
  }

  get costPerYard(): number {
    const fpc = Number(this.form.get('full_piece_cost')?.value ?? 0);
    return fpc > 0 ? fpc / 12 : 0;
  }

  async ngOnInit(): Promise<void> {
    await this.loadFabrics();
  }

  async loadFabrics(): Promise<void> {
    const [fabricsRes, costsRes] = await Promise.all([
      this.supabase.client
        .from('fabrics')
        .select('*')
        .order('created_at', { ascending: false }),
      this.supabase.client
        .from('fabric_costs')
        .select('fabric_id, full_piece_cost'),
    ]);

    const costsMap = new Map<number, number>();
    for (const row of costsRes.data ?? []) {
      costsMap.set(Number(row.fabric_id), Number(row.full_piece_cost ?? 0));
    }

    this.allFabrics = (fabricsRes.data ?? []).map((f: any): FabricRow => ({
      id:              f.id,
      name:            f.name,
      category:        f.category,
      subcategory:     f.subcategory ?? '',
      material:        f.material,
      price_per_yard:  Number(f.price_per_yard),
      min_yard:        Number(f.min_yard ?? 1),
      available_yards: Number(f.available_yards ?? 0),
      in_stock:        f.in_stock,
      image_url:       f.image_url ?? '',
      full_piece_cost: costsMap.get(Number(f.id)) ?? 0,
    }));

    this.applyFilters();
    this.loading = false;
    this.cdr.markForCheck();
  }

  applyFilters(): void {
    const q   = this.searchQuery.toLowerCase().trim();
    const cat = this.filterCategory;
    const st  = this.filterStock;

    this.filtered = this.allFabrics.filter(f => {
      const matchSearch = !q || f.name.toLowerCase().includes(q) || f.subcategory.toLowerCase().includes(q);
      const matchCat    = !cat || f.category === cat;
      const stockStatus = this.getStockStatus(f);
      const matchStock  = !st || stockStatus === st;
      return matchSearch && matchCat && matchStock;
    });
  }

  getStockStatus(f: FabricRow): 'in-stock' | 'low-stock' | 'sold-out' {
    const avail = f.available_yards;
    const min   = f.min_yard;
    if (!f.in_stock || avail < min) return 'sold-out';
    if (avail < min * 2)            return 'low-stock';
    return 'in-stock';
  }

  getStockLabel(f: FabricRow): string {
    const s = this.getStockStatus(f);
    if (s === 'sold-out')  return 'Sold Out';
    if (s === 'low-stock') return 'Low Stock';
    return 'In Stock';
  }

  onSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onCategoryFilter(event: Event): void {
    this.filterCategory = (event.target as HTMLSelectElement).value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onStockFilter(event: Event): void {
    this.filterStock = (event.target as HTMLSelectElement).value;
    this.applyFilters();
    this.cdr.markForCheck();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    this.error = '';
    this.cdr.markForCheck();

    const values    = this.form.value;
    let imageUrl    = '';

    if (this.uploadFile) {
      const ext      = this.uploadFile.name.split('.').pop();
      const filename = `${Date.now()}.${ext}`;
      const { error: uploadError } = await this.supabase.client.storage
        .from('fabrics')
        .upload(filename, this.uploadFile, { upsert: true });

      if (uploadError) {
        this.error = 'Image upload failed: ' + uploadError.message;
        this.saving = false;
        this.cdr.markForCheck();
        return;
      }

      const { data } = this.supabase.client.storage.from('fabrics').getPublicUrl(filename);
      imageUrl = data.publicUrl;
    }

    const minYards      = Number(values.min_yards);
    const availableYards = Number(values.available_yards);
    const fullPieceCost = Number(values.full_piece_cost);
    const isAvailable   = availableYards >= minYards && minYards > 0;

    const payload: Record<string, unknown> = {
      name:           values.name,
      description:    values.description,
      category:       values.category,
      subcategory:    values.subcategory,
      material:       values.material,
      price_per_yard: values.price_per_yard,
      in_stock:       values.in_stock && isAvailable,
      min_yard:       minYards,
      yard_step:      minYards,
      available_yards: availableYards,
      ...(imageUrl && { image_url: imageUrl }),
    };

    let fabricId: number | null = this.editingId;

    if (this.editingId) {
      const { error: updateError } = await this.supabase.client
        .from('fabrics')
        .update(payload)
        .eq('id', this.editingId);
      if (updateError) { this.error = updateError.message; }
    } else {
      const { data: inserted, error: insertError } = await this.supabase.client
        .from('fabrics')
        .insert(payload)
        .select('id')
        .single();
      if (insertError) { this.error = insertError.message; }
      else { fabricId = inserted.id; }
    }

    if (!this.error && fabricId !== null) {
      await this.supabase.client
        .from('fabric_costs')
        .upsert({ fabric_id: fabricId, full_piece_cost: fullPieceCost }, { onConflict: 'fabric_id' });
    }

    if (!this.error) {
      this.saving = false;
      this.showForm = false;
      this.editingId = null;
      this.uploadFile = null;
      this.form.reset({ category: 'everyday', subcategory: '', material: 'gtp', in_stock: true, min_yards: 4, available_yards: 0, full_piece_cost: 0 });
      this.updateSubcategoryOptions('everyday');
      await this.loadFabrics();
    } else {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  editFabric(fabric: FabricRow): void {
    this.editingId = fabric.id;
    this.showForm  = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.updateSubcategoryOptions(fabric.category as MainCategory);
    this.form.patchValue({
      name:            fabric.name,
      description:     '',
      category:        fabric.category,
      subcategory:     fabric.subcategory,
      material:        fabric.material,
      price_per_yard:  fabric.price_per_yard,
      in_stock:        fabric.in_stock,
      min_yards:       fabric.min_yard,
      available_yards: fabric.available_yards,
      full_piece_cost: fabric.full_piece_cost,
    });

    this.supabase.client
      .from('fabrics')
      .select('description')
      .eq('id', fabric.id)
      .single()
      .then(({ data }) => {
        if (data?.description) {
          this.form.patchValue({ description: data.description });
          this.cdr.markForCheck();
        }
      });

    this.cdr.markForCheck();
  }

  async deleteFabric(id: number): Promise<void> {
    if (!confirm('Delete this fabric? This cannot be undone.')) return;
    await this.supabase.client.from('fabrics').delete().eq('id', id);
    await this.loadFabrics();
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.uploadFile = null;
    this.form.reset({ category: 'everyday', subcategory: '', material: 'gtp', in_stock: true, min_yards: 4, available_yards: 0, full_piece_cost: 0 });
    this.updateSubcategoryOptions('everyday');
    this.error = '';
  }

  logout(): void { this.auth.logout(); }
}
