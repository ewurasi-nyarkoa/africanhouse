import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-unsubscribe',
  imports: [RouterLink],
  templateUrl: './unsubscribe.component.html',
  styleUrl: './unsubscribe.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnsubscribeComponent implements OnInit {
  state: 'loading' | 'success' | 'already' | 'error' = 'loading';

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    title: Title,
  ) {
    title.setTitle('Unsubscribe — AfriLoom Fabrics');
  }

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) { this.state = 'error'; this.cdr.markForCheck(); return; }

    const { data } = await this.supabase.client.rpc('unsubscribe_by_token', { p_token: token });

    if (data?.success) {
      this.state = 'success';
    } else if (data?.message?.includes('already')) {
      this.state = 'already';
    } else {
      this.state = 'error';
    }
    this.cdr.markForCheck();
  }
}
