import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

type AdminView = 'overview' | 'subscribers' | 'campaigns' | 'new-campaign';

const TEMPLATES: Record<string, { subject: string; preview: string; body: string }> = {
  general: {
    subject: 'A message from AfriLoom Fabrics',
    preview: 'Something special for you.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#2B2B2B;margin:0 0 16px;">Hello {{name}},</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  We have something to share with you.
</p>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 32px;">
  Write your message here.
</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Shop Now</a>`,
  },
  new_arrivals: {
    subject: 'New Fabrics Just Arrived at AfriLoom',
    preview: 'Fresh fabrics, ready for your tailor.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#2B2B2B;margin:0 0 16px;">New Arrivals, {{name}}</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  We've just received beautiful new fabrics. GTP, Ankara, Kente and more — all sold unsewn so your tailor can create something entirely yours.
</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">See New Arrivals</a>`,
  },
  sale: {
    subject: 'Special Offer — AfriLoom Fabrics',
    preview: 'A special offer just for you.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#6B1E2B;margin:0 0 16px;">Special Offer for You, {{name}}</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  For a limited time, we're offering a special deal on selected fabrics. Don't miss out.
</p>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 32px;">Describe your offer here.</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Shop the Offer</a>`,
  },
  restock: {
    subject: 'Back in Stock — AfriLoom Fabrics',
    preview: 'Your favourite fabrics are back.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#2B2B2B;margin:0 0 16px;">Back in Stock, {{name}}</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  Great news — some of our most popular fabrics are back in stock. Quantities are limited, so order early to avoid disappointment.
</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Shop Now</a>`,
  },
  new_collection: {
    subject: 'Introducing Our New Collection — AfriLoom Fabrics',
    preview: 'A new collection has arrived.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#2B2B2B;margin:0 0 16px;">New Collection, {{name}}</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  We are excited to introduce our latest collection. Carefully curated for elegance, quality and every occasion.
</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Explore Collection</a>`,
  },
  seasonal: {
    subject: 'Season\'s Greetings from AfriLoom Fabrics',
    preview: 'Wishing you a wonderful season.',
    body: `<h2 style="font-family:Georgia,serif;font-size:24px;font-style:italic;color:#2B2B2B;margin:0 0 16px;">Hello {{name}},</h2>
<p style="font-size:15px;line-height:1.7;color:#4a4a4a;margin:0 0 20px;">
  As the season approaches, we want to thank you for being part of the AfriLoom family. Every fabric tells a story — we hope yours is beautiful this season.
</p>
<a href="https://afriloomfabrics.com/shop" style="display:inline-block;background:#6B1E2B;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Shop Fabrics</a>`,
  },
};

@Component({
  selector: 'app-email-marketing',
  imports: [RouterLink, RouterLinkActive, ReactiveFormsModule, DatePipe, FormsModule],
  templateUrl: './email-marketing.component.html',
  styleUrl: './email-marketing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailMarketingComponent implements OnInit {
  view: AdminView = 'overview';
  menuOpen = false;
  loading = true;

  stats = { total: 0, active: 0, unsubscribed: 0, campaigns: 0, sent: 0 };

  subscribers: any[] = [];
  filteredSubscribers: any[] = [];
  subscriberSearch = '';
  subscriberFilter = 'all';

  campaigns: any[] = [];
  selectedCampaign: any = null;

  campaignForm!: FormGroup;
  saving = false;
  sendingTest = false;
  sending = false;
  testEmail = '';
  readonly subscriberNameToken = '{{name}}';
  formError = '';
  formSuccess = '';

  readonly templateTypes = [
    { value: 'general', label: 'General Announcement' },
    { value: 'new_arrivals', label: 'New Fabric Arrivals' },
    { value: 'new_collection', label: 'New Collection' },
    { value: 'restock', label: 'Restocked Fabrics' },
    { value: 'sale', label: 'Sale / Special Offer' },
    { value: 'seasonal', label: 'Seasonal Announcement' },
  ];

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
  ) { }

  async ngOnInit(): Promise<void> {
    this.campaignForm = this.fb.group({
      camp_name: ['', Validators.required],
      subject: ['', Validators.required],
      preview_text: [''],
      template_type: ['general', Validators.required],
      body_html: ['', Validators.required],
    });

    this.campaignForm.get('template_type')!.valueChanges.subscribe(type => {
      const tpl = TEMPLATES[type];
      if (tpl) {
        this.campaignForm.patchValue({ subject: tpl.subject, preview_text: tpl.preview, body_html: tpl.body });
      }
      this.cdr.markForCheck();
    });

    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading = true;
    this.cdr.markForCheck();

    const [subsRes, campRes] = await Promise.all([
      this.supabase.client.from('subscribers').select('*').order('created_at', { ascending: false }),
      this.supabase.client.from('email_campaigns').select('*').order('created_at', { ascending: false }),
    ]);

    this.subscribers = subsRes.data ?? [];
    this.campaigns = campRes.data ?? [];
    this.filteredSubscribers = this.subscribers;

    this.stats = {
      total: this.subscribers.length,
      active: this.subscribers.filter(s => s.status === 'active' && s.marketing_consent === true && !!s.marketing_consent_at && !!s.marketing_consent_source && !!s.marketing_consent_version && !!s.marketing_consent_text).length,
      unsubscribed: this.subscribers.filter(s => s.status === 'unsubscribed').length,
      campaigns: this.campaigns.length,
      sent: this.campaigns.filter(c => c.status === 'sent').length,
    };

    this.loading = false;
    this.cdr.markForCheck();
  }

  setView(v: AdminView): void {
    this.view = v;
    this.formError = '';
    this.formSuccess = '';
    if (v === 'new-campaign') {
      this.selectedCampaign = null;
      this.campaignForm.reset({ template_type: 'general', camp_name: '', subject: '', preview_text: '', body_html: '' });
      const tpl = TEMPLATES['general'];
      this.campaignForm.patchValue({ subject: tpl.subject, preview_text: tpl.preview, body_html: tpl.body });
    }
    this.cdr.markForCheck();
  }

  filterSubscribers(): void {
    const q = this.subscriberSearch.toLowerCase().trim();
    this.filteredSubscribers = this.subscribers.filter(s => {
      const matchSearch = !q || s.email.toLowerCase().includes(q) || (s.name ?? '').toLowerCase().includes(q);
      const matchStatus = this.subscriberFilter === 'all' || s.status === this.subscriberFilter;
      return matchSearch && matchStatus;
    });
    this.cdr.markForCheck();
  }

  onSearchInput(e: Event): void {
    this.subscriberSearch = (e.target as HTMLInputElement).value;
    this.filterSubscribers();
  }

  onStatusFilter(e: Event): void {
    this.subscriberFilter = (e.target as HTMLSelectElement).value;
    this.filterSubscribers();
  }

  get activeSubscriberCount(): number {
    return this.subscribers.filter(s => s.status === 'active' && s.marketing_consent === true && !!s.marketing_consent_at && !!s.marketing_consent_source && !!s.marketing_consent_version && !!s.marketing_consent_text).length;
  }

  async saveCampaign(sendNow = false): Promise<void> {
    if (this.campaignForm.invalid) { this.campaignForm.markAllAsTouched(); return; }
    this.saving = true;
    this.formError = '';
    this.cdr.markForCheck();

    const v = this.campaignForm.value;
    const payload = {
      name: v.camp_name,
      subject: v.subject,
      preview_text: v.preview_text,
      template_type: v.template_type,
      body_html: v.body_html,
    };

    if (this.selectedCampaign) {
      const { error } = await this.supabase.client
        .from('email_campaigns').update(payload).eq('id', this.selectedCampaign.id);
      if (error) { this.formError = error.message; this.saving = false; this.cdr.markForCheck(); return; }
    } else {
      const { data, error } = await this.supabase.client
        .from('email_campaigns').insert(payload).select('id').single();
      if (error) { this.formError = error.message; this.saving = false; this.cdr.markForCheck(); return; }
      this.selectedCampaign = data;
    }

    this.saving = false;

    if (sendNow && this.selectedCampaign) {
      await this.sendCampaign(this.selectedCampaign.id);
    } else {
      this.formSuccess = 'Campaign saved as draft.';
      await this.loadAll();
    }
    this.cdr.markForCheck();
  }

  async sendTestEmail(): Promise<void> {
    if (!this.testEmail || !this.campaignForm.valid) return;
    this.sendingTest = true;
    this.formError = '';
    this.cdr.markForCheck();

    if (!this.selectedCampaign) await this.saveCampaign();

    const { error } = await this.supabase.client.functions.invoke('send-campaign', {
      body: { campaignId: this.selectedCampaign?.id, testEmail: this.testEmail },
    });

    this.sendingTest = false;
    if (error) { this.formError = 'Test email failed. Check your RESEND_API_KEY secret.'; }
    else { this.formSuccess = `Test email sent to ${this.testEmail}`; }
    this.cdr.markForCheck();
  }

  async sendCampaign(campaignId: number): Promise<void> {
    if (!confirm(`Send this campaign to ${this.activeSubscriberCount} active subscribers?`)) return;
    this.sending = true;
    this.cdr.markForCheck();

    const { data, error } = await this.supabase.client.functions.invoke('send-campaign', {
      body: { campaignId },
    });

    this.sending = false;
    if (error || data?.error) {
      this.formError = data?.error ?? 'Send failed.';
    } else {
      const status = String(data.campaign_status ?? 'sending').replace('_', ' ');
      this.formSuccess = `Campaign ${status}: ${data.sent_count ?? 0} accepted, ${data.failed_count ?? 0} failed, ${data.pending_count ?? 0} pending of ${data.total_eligible ?? 0} eligible.`;
    }
    await this.loadAll();
    this.view = 'campaigns';
    this.cdr.markForCheck();
  }

  editCampaign(c: any): void {
    this.selectedCampaign = c;
    this.campaignForm.patchValue({
      camp_name: c.name,
      subject: c.subject,
      preview_text: c.preview_text ?? '',
      template_type: c.template_type ?? 'general',
      body_html: c.body_html,
    });
    this.view = 'new-campaign';
    this.cdr.markForCheck();
  }

  async deleteSubscriber(id: number): Promise<void> {
    if (!confirm('Remove this subscriber?')) return;
    await this.supabase.client.from('subscribers').delete().eq('id', id);
    await this.loadAll();
  }

  logout(): void { this.auth.logout(); }
}
