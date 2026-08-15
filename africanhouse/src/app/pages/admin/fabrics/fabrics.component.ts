import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  CATEGORY_FILTER_CONFIG,
  getSubcategoriesForCategory,
  SubcategoryOption,
  MainCategory,
} from '../../../core/models/filter-config';

@Component({
  selector: 'app-fabrics',
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule],
  templateUrl: './fabrics.component.html',
  styleUrl: './fabrics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FabricsComponent implements OnInit {
  form!: FormGroup;
  fabrics: any[] = [];
  loading = true;
  saving = false;
  showForm = false;
  menuOpen = false;
  editingId: number | null = null;
  uploadFile: File | null = null;
  error = '';

  categories = ['everyday', 'funeral', 'kente'];
  materials = ['gtp', 'holland', 'printex', 'soso', 'kente', 'small-material'];
  subcategoryOptions: SubcategoryOption[] = [];

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: ['', Validators.required],
      category: ['everyday', Validators.required],
      subcategory: ['', Validators.required],
      material: ['gtp', Validators.required],
      price_per_yard: [0, [Validators.required, Validators.min(1)]],
      min_yards: [4, [Validators.required, Validators.min(1)]],
      available_yards: [0, [Validators.required, Validators.min(0)]],
      in_stock: [true],
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

  async ngOnInit(): Promise<void> {
    await this.loadFabrics();
  }

  async loadFabrics(): Promise<void> {
    const { data } = await this.supabase.client
      .from('fabrics')
      .select('*')
      .order('created_at', { ascending: false });
    this.fabrics = data ?? [];
    this.loading = false;
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

    const values = this.form.value;
    let imageUrl = '';

    if (this.uploadFile) {
      const ext = this.uploadFile.name.split('.').pop();
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

    const minYards = Number(values.min_yards);
    const availableYards = Number(values.available_yards);
    const isAvailable = availableYards >= minYards && minYards > 0;

    const payload: Record<string, unknown> = {
      name: values.name,
      description: values.description,
      category: values.category,
      subcategory: values.subcategory,
      material: values.material,
      price_per_yard: values.price_per_yard,
      in_stock: values.in_stock && isAvailable,
      min_yard: minYards,
      yard_step: minYards,
      available_yards: availableYards,
      ...(imageUrl && { image_url: imageUrl }),
    };

    if (this.editingId) {
      const { error: updateError } = await this.supabase.client
        .from('fabrics')
        .update(payload)
        .eq('id', this.editingId);
      if (updateError) this.error = updateError.message;
    } else {
      const { error: insertError } = await this.supabase.client
        .from('fabrics')
        .insert(payload);
      if (insertError) this.error = insertError.message;
    }

    if (!this.error) {
      this.saving = false;
      this.showForm = false;
      this.editingId = null;
      this.uploadFile = null;
      this.form.reset({
        category: 'everyday',
        subcategory: '',
        material: 'gtp',
        in_stock: true,
        min_yards: 4,
        available_yards: 0,
      });
      this.updateSubcategoryOptions('everyday');
      await this.loadFabrics();
    } else {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  editFabric(fabric: any): void {
    this.editingId = fabric.id;
    this.showForm = true;
    this.updateSubcategoryOptions(fabric.category as MainCategory);
    this.form.patchValue({
      name: fabric.name,
      description: fabric.description,
      category: fabric.category,
      subcategory: fabric.subcategory ?? '',
      material: fabric.material,
      price_per_yard: fabric.price_per_yard,
      in_stock: fabric.in_stock,
      min_yards: fabric.min_yard ?? 4,
      available_yards: fabric.available_yards ?? 0,
    });
    this.cdr.markForCheck();
  }

  async deleteFabric(id: number): Promise<void> {
    if (!confirm('Delete this fabric?')) return;
    await this.supabase.client.from('fabrics').delete().eq('id', id);
    await this.loadFabrics();
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.uploadFile = null;
    this.form.reset({
      category: 'everyday',
      subcategory: '',
      material: 'gtp',
      in_stock: true,
      min_yards: 4,
      available_yards: 0,
    });
    this.updateSubcategoryOptions('everyday');
  }

  logout(): void { this.auth.logout(); }
}
