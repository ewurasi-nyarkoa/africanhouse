import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { welcomeEmail } from '../_shared/email-templates.ts';
import { ResendError, sendResendEmail } from '../_shared/resend.ts';
import { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION, normalizeConsentedEmail } from '../_shared/marketing-consent.ts';

const SITE_URL = 'https://afriloomfabrics.com';
const ALLOWED_ORIGINS = new Set([
  'https://afriloomfabrics.com',
  'https://www.afriloomfabrics.com',
  'http://localhost:4200',
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://afriloomfabrics.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: ALLOWED_ORIGINS.has(origin) ? 204 : 403, headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  try {
    const body = await req.json();
    const email = normalizeConsentedEmail(body?.email, body?.consent, body?.consentVersion);
    if (!email) {
      if (body?.consent !== true) return json({ error: 'Marketing consent is required' }, 400, corsHeaders);
      return json({ error: 'A valid email address is required' }, 400, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Subscription service is not configured' }, 500, corsHeaders);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.rpc('subscribe_to_marketing', {
      p_email: email,
      p_source: 'homepage',
      p_consent_version: MARKETING_CONSENT_VERSION,
      p_consent_text: MARKETING_CONSENT_TEXT,
    });
    if (error) {
      console.error('Subscription RPC failed:', error.message);
      return json({ error: 'Could not save subscription' }, 500, corsHeaders);
    }

    const result = Array.isArray(data) ? data[0] : null;
    if (!result?.subscriber_id || !result?.token) {
      return json({ error: 'Could not confirm subscription' }, 500, corsHeaders);
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      const deliveryKey = `newsletter-welcome:${result.subscriber_id}:${result.token}`;
      const { data: claimData, error: claimError } = await db.rpc('claim_transactional_email', {
        p_delivery_kind: 'newsletter_welcome',
        p_idempotency_key: deliveryKey,
        p_source_id: String(result.subscriber_id),
        p_recipient_email: email,
        p_lease_seconds: 180,
      });
      if (claimError) {
        console.error('Newsletter welcome claim failed:', claimError.message);
      } else {
        const claim = Array.isArray(claimData) ? claimData[0] : null;
        if (claim?.claimed) {
          const unsubscribeUrl = new URL('/unsubscribe', SITE_URL);
          unsubscribeUrl.searchParams.set('token', result.token);
          const firstName = email.split('@')[0].slice(0, 80);
          try {
            const sent = await sendResendEmail(resendKey, {
              to: email,
              subject: 'Welcome to AfriLoom Fabrics',
              html: welcomeEmail(firstName, unsubscribeUrl.toString()),
              idempotencyKey: deliveryKey,
            }, Math.max(1, 4 - Number(claim.attempt_count)));
            const { error } = await db.from('email_deliveries').update({
              status: 'sent',
              attempt_count: Math.min(3, Number(claim.attempt_count) + sent.attempts - 1),
              resend_message_id: sent.messageId,
              sent_at: new Date().toISOString(),
              lease_token: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', claim.delivery_id).eq('lease_token', claim.lease_token);
            if (error) console.error('Newsletter welcome result persistence failed:', error.message);
          } catch (error) {
            const attempts = error instanceof ResendError ? error.attempts : 1;
            const count = error instanceof ResendError && !error.retryable
              ? 3
              : Math.min(3, Number(claim.attempt_count) + attempts - 1);
            const { error: updateError } = await db.from('email_deliveries').update({
              status: 'failed',
              attempt_count: count,
              last_error: (error instanceof Error ? error.message : 'Email delivery failed').slice(0, 1000),
              lease_token: null,
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            }).eq('id', claim.delivery_id).eq('lease_token', claim.lease_token);
            if (updateError) console.error('Newsletter welcome failure persistence failed:', updateError.message);
          }
        }
      }
    }

    return json({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error('subscribe error:', error);
    return json({ error: 'Unexpected error' }, 500, corsHeaders);
  }
});

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}