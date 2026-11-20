import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { PromotionService } from '../../../core/services/promotion.service';

@Component({
  selector: 'app-promotions',
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, DatePipe],
  templateUrl: './promotions.component.html',
  styleUrl: './promotions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromotionsComponent implements OnInit {
  promotions: any[] = [];
  loading  = true;
  saving   = false;
  showForm = false;
  menuOpen = false;
  editingId: number | null = null;
  error = '';
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private supabase: SupabaseService,
    private auth: AuthService,
    private promotionService: PromotionService,
    private cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      name:             ['', Validators.required],
      description:      [''],
      discount_type:    ['percentage', Validators.required],
      discount_value:   [5, [Validators.required, Validators.min(0.01)]],
      min_order_amount: [0, [Validators.required, Validators.min(0)]],
      starts_at:        ['', Validators.required],
      ends_at:          ['', Validators.required],
      active:           [false],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const { data } = await this.supabase.client
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });
    this.promotions = data ?? [];
    this.loading    = false;
    this.cdr.markForCheck();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    this.error  = '';
    this.cdr.markForCheck();

    const v = this.form.value;
    const payload = {
      name:             v.name,
      description:      v.description ?? '',
      discount_type:    v.discount_type,
      discount_value:   Number(v.discount_value),
      min_order_amount: Number(v.min_order_amount),
      starts_at:        new Date(v.starts_at).toISOString(),
      ends_at:          new Date(v.ends_at).toISOString(),
      active:           v.active,
    };

    if (this.editingId) {
      const { error } = await this.supabase.client
        .from('promotions').update(payload).eq('id', this.editingId);
      if (error) this.error = error.message;
    } else {
      const { error } = await this.supabase.client
        .from('promotions').insert(payload);
      if (error) this.error = error.message;
    }

    if (!this.error) {
      this.showForm  = false;
      this.editingId = null;
      this.form.reset({ discount_type: 'percentage', discount_value: 5, min_order_amount: 0, active: false });
      await this.load();
      await this.promotionService.load();
    }
    this.saving = false;
    this.cdr.markForCheck();
  }

  edit(p: any): void {
    this.editingId = p.id;
    this.showForm  = true;
    this.form.patchValue({
      name:             p.name,
      description:      p.description ?? '',
      discount_type:    p.discount_type,
      discount_value:   p.discount_value,
      min_order_amount: p.min_order_amount ?? 0,
      starts_at:        p.starts_at?.slice(0, 16),
      ends_at:          p.ends_at?.slice(0, 16),
      active:           p.active,
    });
    this.cdr.markForCheck();
  }

  async toggleActive(p: any): Promise<void> {
    await this.supabase.client.from('promotions').update({ active: !p.active }).eq('id', p.id);
    await this.load();
    await this.promotionService.load();
  }

  async deletePromotion(id: number): Promise<void> {
    if (!confirm('Delete this promotion?')) return;
    await this.supabase.client.from('promotions').delete().eq('id', id);
    await this.load();
  }

  cancelForm(): void {
    this.showForm  = false;
    this.editingId = null;
    this.error     = '';
    this.form.reset({ discount_type: 'percentage', discount_value: 5, min_order_amount: 0, active: false });
  }

  logout(): void { this.auth.logout(); }
}
