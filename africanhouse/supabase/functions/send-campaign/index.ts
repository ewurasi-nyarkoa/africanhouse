import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { campaignEmail } from '../_shared/email-templates.ts';
import { authorizeAdmin } from '../_shared/admin-auth.ts';
import { ResendError, sendResendEmail } from '../_shared/resend.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BATCH_SIZE = 50;
const SITE_URL   = 'https://afriloomfabrics.com';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey   = Deno.env.get('RESEND_API_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Supabase is not configured' }, 500);
    if (!resendKey) return json({ error: 'Email service not configured' }, 500);

    const authorization = await authorizeAdmin(req.headers.get('authorization'), accessToken => {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return {
        verifyUser: async () => {
          const { data, error } = await userClient.auth.getUser(accessToken);
          return { userId: data.user?.id ?? null, error };
        },
        checkAdmin: async () => {
          const { data, error } = await userClient.rpc('is_admin');
          return { isAdmin: data === true, error };
        },
      };
    });
    if (!authorization.ok) return json({ error: authorization.message }, authorization.status);

    const body = await req.json();
    const campaignId = body?.campaignId;
    const isTest = Object.hasOwn(body ?? {}, 'testEmail');
    if ((typeof campaignId !== 'number' && typeof campaignId !== 'string') || String(campaignId).length === 0) {
      return json({ error: 'campaignId is required' }, 400);
    }

    const db = createClient(supabaseUrl, serviceKey);

    const { data: campaign, error: campErr } = await db
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404);

    // Test send — only to specified address
    if (isTest) {
      const testEmail = typeof body.testEmail === 'string' ? body.testEmail.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail) || testEmail.length > 254) {
        return json({ error: 'A valid test email address is required' }, 400);
      }
      const html = campaignEmail(campaign.subject, campaign.body_html, 'Test', '#');
      const result = await sendResendEmail(resendKey, {
        to: testEmail,
        subject: campaign.subject,
        html,
        idempotencyKey: `campaign-test:${campaign.id}:${crypto.randomUUID()}`,
      });
      return json({ success: true, test: true, messageId: result.messageId });
    }

    if (campaign.status === 'sent') return json({ error: 'Campaign already sent' }, 409);

    const { data: claimData, error: claimError } = await db.rpc('claim_email_campaign', {
      p_campaign_id: String(campaign.id),
      p_lease_seconds: 300,
    });
    if (claimError) {
      console.error('Campaign claim failed:', claimError.message);
      return json({ error: 'Could not claim campaign' }, 500);
    }
    const claim = Array.isArray(claimData) ? claimData[0] : null;
    if (!claim?.claimed || !claim.claim_token) {
      return json({ error: 'Campaign is already being processed or cannot be retried' }, 409);
    }
    const claimToken = claim.claim_token as string;

    while (true) {
      const { data: renewed, error: renewError } = await db.rpc('renew_email_campaign_claim', {
        p_campaign_id: String(campaign.id),
        p_claim_token: claimToken,
        p_lease_seconds: 300,
      });
      if (renewError || renewed !== true) {
        console.error('Campaign lease renewal failed:', renewError?.message);
        return json({ error: 'Campaign processing lease was lost' }, 409);
      }

      const { data: deliveries, error: deliveryClaimError } = await db.rpc('claim_email_campaign_deliveries', {
        p_campaign_id: String(campaign.id),
        p_claim_token: claimToken,
        p_limit: BATCH_SIZE,
        p_lease_seconds: 180,
      });
      if (deliveryClaimError) {
        console.error('Delivery claim failed:', deliveryClaimError.message);
        return json({ error: 'Could not claim campaign recipients' }, 500);
      }
      if (!deliveries?.length) break;

      let persistenceFailure = false;
      await Promise.all(deliveries.map(async (delivery: any) => {
        const { data: attemptCount, error: attemptError } = await db.rpc('begin_email_delivery_attempt', {
          p_delivery_id: delivery.delivery_id,
          p_claim_token: claimToken,
        });
        if (attemptError) {
          persistenceFailure = true;
          console.error('Delivery attempt claim failed:', attemptError.message);
          return;
        }

        if (!attemptCount) {
          const { error } = await db.from('email_deliveries').update({
            status: 'skipped',
            last_error: 'Subscriber is no longer actively consented',
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', delivery.delivery_id).eq('lease_token', claimToken);
          if (error) persistenceFailure = true;
          return;
        }

        const { data: subscriber, error: subscriberError } = await db
          .from('subscribers')
          .select('id')
          .eq('id', delivery.subscriber_id)
          .eq('email', delivery.recipient_email)
          .eq('status', 'active')
          .eq('marketing_consent', true)
          .eq('unsubscribe_token', delivery.unsubscribe_token)
          .not('marketing_consent_at', 'is', null)
          .not('marketing_consent_source', 'is', null)
          .not('marketing_consent_version', 'is', null)
          .not('marketing_consent_text', 'is', null)
          .maybeSingle();
        if (subscriberError) {
          persistenceFailure = true;
          console.error('Consent recheck failed:', subscriberError.message);
          return;
        }
        if (!subscriber) {
          const { error } = await db.from('email_deliveries').update({
            status: 'skipped',
            last_error: 'Subscriber is no longer actively consented',
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', delivery.delivery_id).eq('lease_token', claimToken);
          if (error) persistenceFailure = true;
          return;
        }

        const unsubscribeUrl = new URL('/unsubscribe', SITE_URL);
        unsubscribeUrl.searchParams.set('token', delivery.unsubscribe_token);
        const html = campaignEmail(campaign.subject, campaign.body_html, delivery.recipient_name ?? '', unsubscribeUrl.toString());
        let sent: { messageId: string; attempts: number };
        try {
          sent = await sendResendEmail(resendKey, {
            to: delivery.recipient_email,
            subject: campaign.subject,
            html,
            idempotencyKey: delivery.idempotency_key,
          }, Math.max(1, 4 - Number(attemptCount)));
        } catch (error) {
          const resendError = error instanceof ResendError ? error : null;
          const usedAttempts = resendError?.attempts ?? 1;
          const finalAttemptCount = resendError && !resendError.retryable
            ? 3
            : Math.min(3, Number(attemptCount) + usedAttempts - 1);
          const { error: updateError } = await db.from('email_deliveries').update({
            status: 'failed',
            attempt_count: finalAttemptCount,
            last_error: (error instanceof Error ? error.message : 'Email delivery failed').slice(0, 1000),
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          }).eq('id', delivery.delivery_id).eq('lease_token', claimToken);
          if (updateError) {
            persistenceFailure = true;
            console.error('Could not persist delivery failure:', updateError.message);
          }
          return;
        }

        const { error: updateError, data: updated } = await db.from('email_deliveries').update({
          status: 'sent',
          attempt_count: Math.min(3, Number(attemptCount) + sent.attempts - 1),
          resend_message_id: sent.messageId,
          last_error: null,
          sent_at: new Date().toISOString(),
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', delivery.delivery_id).eq('lease_token', claimToken).select('id').maybeSingle();
        if (updateError || !updated) {
          persistenceFailure = true;
          console.error('Could not persist accepted email:', updateError?.message ?? 'delivery lease was lost');
        }
      }));

      if (persistenceFailure) return json({ error: 'Could not persist recipient delivery state' }, 500);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const { data: stats, error: statsError } = await db.rpc('refresh_email_campaign_stats', {
      p_campaign_id: String(campaign.id),
      p_claim_token: claimToken,
    });
    if (statsError) {
      console.error('Campaign statistics update failed:', statsError.message);
      return json({ error: 'Could not persist campaign statistics' }, 500);
    }

    const summary = Array.isArray(stats) ? stats[0] : null;
    return json({ success: true, ...summary });

  } catch (err) {
    console.error('send-campaign error:', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
