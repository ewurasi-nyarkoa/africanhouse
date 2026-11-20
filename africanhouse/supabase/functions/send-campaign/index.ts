import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { campaignEmail } from '../_shared/email-templates.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BATCH_SIZE = 50;
const SITE_URL   = 'https://afriloomfabrics.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { campaignId, testEmail } = await req.json();
    if (!campaignId) return json({ error: 'campaignId is required' }, 400);

    const resendKey  = Deno.env.get('RESEND_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!resendKey) return json({ error: 'Email service not configured' }, 500);

    const db = createClient(supabaseUrl, serviceKey);

    const { data: campaign, error: campErr } = await db
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404);
    if (campaign.status === 'sent') return json({ error: 'Campaign already sent' }, 409);

    // Test send — only to specified address
    if (testEmail) {
      const html = campaignEmail(campaign.subject, campaign.body_html, 'Test', '#');
      await sendEmail(resendKey, testEmail, campaign.subject, html);
      return json({ success: true, test: true });
    }

    // Real send — fetch active subscribers
    const { data: subscribers } = await db
      .from('subscribers')
      .select('id, email, name, unsubscribe_token')
      .eq('status', 'active');

    const recipients = subscribers ?? [];
    if (recipients.length === 0) {
      return json({ success: true, sent: 0, message: 'No active subscribers' });
    }

    // Mark campaign as sending
    await db.from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    let sent      = 0;
    let failed    = 0;

    // Send in batches to avoid Resend rate limits
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (sub: any) => {
          try {
            const unsubUrl = `${SITE_URL}/unsubscribe?token=${sub.unsubscribe_token}`;
            const html     = campaignEmail(campaign.subject, campaign.body_html, sub.name ?? '', unsubUrl);
            await sendEmail(resendKey, sub.email, campaign.subject, html);
            sent++;
          } catch {
            failed++;
          }
        })
      );

      // Small delay between batches
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Mark campaign as sent
    await db.from('email_campaigns').update({
      status:          'sent',
      sent_at:         new Date().toISOString(),
      recipient_count: sent,
    }).eq('id', campaignId);

    return json({ success: true, sent, failed });

  } catch (err) {
    console.error('send-campaign error:', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

async function sendEmail(key: string, to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AfriLoom Fabrics <no-reply@afriloomfabrics.com>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
