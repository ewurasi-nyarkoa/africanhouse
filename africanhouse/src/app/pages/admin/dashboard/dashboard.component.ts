import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';

type Period = 'today' | '7d' | '30d' | 'year';

interface DashStats {
  revenue: number;
  profit: number;
  profitKnown: boolean;
  orders: number;
  pending: number;
  fabrics: number;
  lowStock: number;
}

interface RecentOrder {
  id: number;
  customer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
  item_count: number;
}

interface TopFabric {
  fabric_id: string;
  fabric_name: string;
  image_url: string;
  category: string;
  yards_sold: number;
  revenue: number;
}

interface CategorySale {
  category: string;
  revenue: number;
  orders: number;
}

interface InventoryAlert {
  id: number;
  name: string;
  image_url: string;
  available_yards: number;
  min_yard: number;
  status: 'sold-out' | 'low-stock';
}

interface ChartPoint {
  label: string;
  value: number;
  heightPct: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, RouterLinkActive, DatePipe, DecimalPipe, TitleCasePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  menuOpen = false;
  loading = true;

  activePeriod: Period = '30d';
  readonly periods: { value: Period; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d',    label: '7 Days' },
    { value: '30d',   label: '30 Days' },
    { value: 'year',  label: 'This Year' },
  ];

  stats: DashStats = {
    revenue: 0,
    profit: 0,
    profitKnown: false,
    orders: 0,
    pending: 0,
    fabrics: 0,
    lowStock: 0,
  };

  recentOrders: RecentOrder[] = [];
  topFabrics: TopFabric[] = [];
  categorySales: CategorySale[] = [];
  inventoryAlerts: InventoryAlert[] = [];
  chartPoints: ChartPoint[] = [];

  constructor(
    private auth: AuthService,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  async selectPeriod(period: Period): Promise<void> {
    this.activePeriod = period;
    this.loading = true;
    this.cdr.markForCheck();
    await this.loadAll();
  }

  private periodStart(period: Period): string {
    const now = new Date();
    switch (period) {
      case 'today': {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      }
      case '7d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d.toISOString();
      }
      case '30d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        return d.toISOString();
      }
      case 'year': {
        const d = new Date(now.getFullYear(), 0, 1);
        return d.toISOString();
      }
    }
  }

  private async loadAll(): Promise<void> {
    const start = this.periodStart(this.activePeriod);

    const [ordersRes, allOrdersRes, fabricsRes] = await Promise.all([
      this.supabase.client
        .from('orders')
        .select('id, status, total_amount, items, created_at, customer_name')
        .gte('created_at', start)
        .order('created_at', { ascending: false }),
      this.supabase.client
        .from('orders')
        .select('id, status', { count: 'exact', head: true }),
      this.supabase.client
        .from('fabrics')
        .select('id, name, image_url, available_yards, min_yard, in_stock, category')
        .order('available_yards', { ascending: true }),
    ]);

    const periodOrders: any[] = ordersRes.data ?? [];
    const allFabrics: any[] = fabricsRes.data ?? [];

    this.stats.orders = periodOrders.length;
    this.stats.pending = periodOrders.filter(o => o.status === 'pending').length;
    this.stats.fabrics = allFabrics.length;
    this.stats.revenue = periodOrders.reduce(
      (sum, o) => sum + Number(o.total_amount ?? 0), 0
    );

    this.stats.lowStock = allFabrics.filter(f => {
      const avail = Number(f.available_yards ?? 0);
      const min   = Number(f.min_yard ?? 1);
      return avail > 0 && avail < min * 2;
    }).length + allFabrics.filter(f => !f.in_stock || Number(f.available_yards ?? 0) < Number(f.min_yard ?? 1)).length;

    this.computeProfit(periodOrders);
    this.buildRecentOrders(periodOrders);
    this.buildTopFabrics(periodOrders);
    this.buildCategorySales(periodOrders);
    this.buildInventoryAlerts(allFabrics);
    this.buildChart(periodOrders);

    this.loading = false;
    this.cdr.markForCheck();
  }

  private computeProfit(orders: any[]): void {
    let totalProfit = 0;
    let hasAnyCost = false;

    for (const order of orders) {
      const items: any[] = order.items ?? [];
      for (const item of items) {
        const costPerYard = Number(item.cost_per_yard_at_sale ?? 0);
        if (costPerYard > 0) {
          hasAnyCost = true;
          const revenue = Number(item.yards ?? 0) * Number(item.price_per_yard ?? 0);
          const cost    = Number(item.yards ?? 0) * costPerYard;
          totalProfit  += revenue - cost;
        }
      }
    }

    this.stats.profit      = totalProfit;
    this.stats.profitKnown = hasAnyCost;
  }

  private buildRecentOrders(orders: any[]): void {
    this.recentOrders = orders.slice(0, 8).map(o => ({
      id: o.id,
      customer_name: o.customer_name,
      total_amount: Number(o.total_amount ?? 0),
      status: o.status,
      created_at: o.created_at,
      item_count: (o.items ?? []).length,
    }));
  }

  private buildTopFabrics(orders: any[]): void {
    const map = new Map<string, TopFabric>();

    for (const order of orders) {
      for (const item of (order.items ?? [])) {
        const key = String(item.fabric_id);
        const existing = map.get(key);
        const yards   = Number(item.yards ?? 0);
        const revenue = Number(item.subtotal ?? item.yards * item.price_per_yard ?? 0);

        if (existing) {
          existing.yards_sold += yards;
          existing.revenue    += revenue;
        } else {
          map.set(key, {
            fabric_id:   key,
            fabric_name: item.fabric_name,
            image_url:   item.image_url ?? '',
            category:    item.category ?? '',
            yards_sold:  yards,
            revenue,
          });
        }
      }
    }

    this.topFabrics = Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }

  private buildCategorySales(orders: any[]): void {
    const map = new Map<string, CategorySale>();

    for (const order of orders) {
      for (const item of (order.items ?? [])) {
        const cat = String(item.category ?? 'other');
        const existing = map.get(cat);
        const revenue  = Number(item.subtotal ?? 0);

        if (existing) {
          existing.revenue += revenue;
          existing.orders  += 1;
        } else {
          map.set(cat, { category: cat, revenue, orders: 1 });
        }
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    const max  = rows[0]?.revenue ?? 1;

    this.categorySales = rows.map(r => ({ ...r, _pct: Math.round((r.revenue / max) * 100) }));
  }

  getCategoryPct(cat: CategorySale): number {
    const max = this.categorySales[0]?.revenue ?? 1;
    return Math.round((cat.revenue / max) * 100);
  }

  private buildInventoryAlerts(fabrics: any[]): void {
    const soldOut = fabrics
      .filter(f => !f.in_stock || Number(f.available_yards ?? 0) < Number(f.min_yard ?? 1))
      .map(f => ({
        id: f.id,
        name: f.name,
        image_url: f.image_url ?? '',
        available_yards: Number(f.available_yards ?? 0),
        min_yard: Number(f.min_yard ?? 1),
        status: 'sold-out' as const,
      }));

    const lowStock = fabrics
      .filter(f => {
        const avail = Number(f.available_yards ?? 0);
        const min   = Number(f.min_yard ?? 1);
        return f.in_stock && avail >= min && avail < min * 2;
      })
      .map(f => ({
        id: f.id,
        name: f.name,
        image_url: f.image_url ?? '',
        available_yards: Number(f.available_yards ?? 0),
        min_yard: Number(f.min_yard ?? 1),
        status: 'low-stock' as const,
      }));

    this.inventoryAlerts = [...soldOut, ...lowStock].slice(0, 8);
  }

  private buildChart(orders: any[]): void {
    const buckets = new Map<string, number>();

    if (this.activePeriod === 'today') {
      for (let h = 0; h < 24; h += 3) {
        buckets.set(`${h.toString().padStart(2, '0')}:00`, 0);
      }
      for (const o of orders) {
        const h = new Date(o.created_at).getHours();
        const key = `${(Math.floor(h / 3) * 3).toString().padStart(2, '0')}:00`;
        buckets.set(key, (buckets.get(key) ?? 0) + Number(o.total_amount ?? 0));
      }
    } else if (this.activePeriod === '7d') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.set(d.toLocaleDateString('en-GH', { weekday: 'short' }), 0);
      }
      for (const o of orders) {
        const label = new Date(o.created_at).toLocaleDateString('en-GH', { weekday: 'short' });
        buckets.set(label, (buckets.get(label) ?? 0) + Number(o.total_amount ?? 0));
      }
    } else if (this.activePeriod === '30d') {
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (d.getDate() === 1 || i === 29 || i === 0 || i % 7 === 0) {
          buckets.set(d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' }), 0);
        }
      }
      for (const o of orders) {
        const d     = new Date(o.created_at);
        const week  = Math.floor((29 - Math.round((Date.now() - d.getTime()) / 86400000)) / 7);
        const label = d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short' });
        const keys  = Array.from(buckets.keys());
        const closest = keys.reduce((prev, curr) => {
          const pd = Math.abs(new Date(prev).getTime() - d.getTime());
          const cd = Math.abs(new Date(curr).getTime() - d.getTime());
          return cd < pd ? curr : prev;
        }, keys[0]);
        if (closest) buckets.set(closest, (buckets.get(closest) ?? 0) + Number(o.total_amount ?? 0));
      }
    } else {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (const m of months) buckets.set(m, 0);
      for (const o of orders) {
        const m = months[new Date(o.created_at).getMonth()];
        buckets.set(m, (buckets.get(m) ?? 0) + Number(o.total_amount ?? 0));
      }
    }

    const entries = Array.from(buckets.entries());
    const maxVal  = Math.max(...entries.map(e => e[1]), 1);

    this.chartPoints = entries.map(([label, value]) => ({
      label,
      value,
      heightPct: Math.round((value / maxVal) * 100),
    }));
  }

  getStatusClass(status: string): string {
    return `status-badge status-badge--${status}`;
  }

  logout(): void { this.auth.logout(); }
}
