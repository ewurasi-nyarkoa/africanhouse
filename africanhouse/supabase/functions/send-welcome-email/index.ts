import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { welcomeEmail } from '../_shared/email-templates.ts';
import { ResendError, sendResendEmail } from '../_shared/resend.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!token || !supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Authentication required' }, 401);
    if (!resendKey) return json({ error: 'Email service not configured' }, 500);

    const userClient = createUserClient(supabaseUrl, anonKey, token);
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user?.id || !user.email || !user.email_confirmed_at) {
      return json({ error: 'A verified customer account is required' }, 401);
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
    if (adminError) return json({ error: 'Could not verify customer account' }, 500);
    if (isAdmin === true) return json({ error: 'Customer account required' }, 403);

    const db = createServiceClient(supabaseUrl, serviceKey);
    const { data: profile, error: profileError } = await db
      .from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle();
    if (profileError) return json({ error: 'Could not verify customer account' }, 500);

    const deliveryKey = `account-welcome:${user.id}`;
    const { data: claimData, error: claimError } = await db.rpc('claim_transactional_email', {
      p_delivery_kind: 'account_welcome',
      p_idempotency_key: deliveryKey,
      p_source_id: user.id,
      p_recipient_email: user.email,
      p_lease_seconds: 180,
    });
    if (claimError) return json({ error: 'Could not claim welcome email' }, 500);
    const claim = Array.isArray(claimData) ? claimData[0] : null;
    if (!claim?.claimed) return json({ success: true, duplicate: true });

    const fullName = profile?.full_name ?? user.user_metadata?.full_name ?? user.email.split('@')[0];
    const firstName = String(fullName).trim().split(/\s+/)[0];
    try {
      const sent = await sendResendEmail(resendKey, {
        to: user.email,
        subject: `Welcome to AfriLoom Fabrics, ${firstName}!`,
        html: welcomeEmail(firstName),
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
      if (error) console.error('Account welcome result persistence failed:', error.message);
      return json({ success: true });
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
      if (updateError) console.error('Account welcome failure persistence failed:', updateError.message);
      return json({ error: 'Email delivery failed' }, 502);
    }
  } catch (err) {
    console.error('send-welcome-email error:', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function createUserClient(url: string, key: string, token: string) {
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createServiceClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
