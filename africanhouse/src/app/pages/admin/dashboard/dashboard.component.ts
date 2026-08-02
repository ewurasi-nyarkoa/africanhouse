import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  stats = { fabrics: 0, orders: 0, subscribers: 0, pending: 0 };

  constructor(
    private auth: AuthService,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    const [fabrics, orders, subscribers] = await Promise.all([
      this.supabase.client.from('fabrics').select('id', { count: 'exact', head: true }),
      this.supabase.client.from('orders').select('id, status', { count: 'exact' }),
      this.supabase.client.from('subscribers').select('id', { count: 'exact', head: true })
    ]);
    this.stats = {
      fabrics: fabrics.count ?? 0,
      orders: orders.count ?? 0,
      subscribers: subscribers.count ?? 0,
      pending: (orders.data ?? []).filter((o: any) => o.status === 'pending').length
    };
    this.cdr.markForCheck();
  }

  logout(): void { this.auth.logout(); }
}
