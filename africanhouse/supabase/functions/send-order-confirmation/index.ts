import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { orderConfirmationEmail } from '../_shared/email-templates.ts';
import { ResendError, sendResendEmail } from '../_shared/resend.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const suppliedAuthorization = req.headers.get('authorization') ?? '';
    if (!supabaseUrl || !serviceKey || !constantTimeEqual(suppliedAuthorization, `Bearer ${serviceKey}`)) {
      return json({ error: 'Internal authorization required' }, 401);
    }
    if (!resendKey) return json({ error: 'Email service not configured' }, 500);

    const body = await req.json();
    const orderId = body?.orderId;
    if ((typeof orderId !== 'number' && typeof orderId !== 'string') || String(orderId).length === 0) {
      return json({ error: 'orderId is required' }, 400);
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error: orderError } = await db
      .from('orders')
      .select('id, status, customer_email, customer_name, items, total_amount, discount_amount, location')
      .eq('id', orderId)
      .maybeSingle();
    if (orderError) return json({ error: 'Could not verify order' }, 500);
    if (!order) return json({ error: 'Order not found' }, 404);
    if (order.status !== 'payment_confirmed') return json({ error: 'Order payment is not confirmed' }, 409);
    if (!order.customer_email) return json({ success: true, skipped: true });

    const deliveryKey = `order-confirmation:${order.id}`;
    const { data: claimData, error: claimError } = await db.rpc('claim_transactional_email', {
      p_delivery_kind: 'order_confirmation',
      p_idempotency_key: deliveryKey,
      p_source_id: String(order.id),
      p_recipient_email: order.customer_email,
      p_lease_seconds: 180,
    });
    if (claimError) return json({ error: 'Could not claim order email' }, 500);
    const claim = Array.isArray(claimData) ? claimData[0] : null;
    if (!claim?.claimed) return json({ success: true, duplicate: true });

    const trackingUrl = new URL(`/track/${encodeURIComponent(String(order.id))}`, 'https://afriloomfabrics.com').toString();
    const html = orderConfirmationEmail(
      order.customer_name ?? 'Valued Customer',
      Number(order.id),
      Array.isArray(order.items) ? order.items : [],
      Number(order.total_amount ?? 0),
      Number(order.discount_amount ?? 0),
      String(order.location ?? ''),
      trackingUrl,
    );

    try {
      const sent = await sendResendEmail(resendKey, {
        to: order.customer_email,
        subject: `Your AfriLoom order #${order.id} is confirmed`,
        html,
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
      if (error) return json({ error: 'Email sent but delivery state could not be saved' }, 500);
      return json({ success: true, messageId: sent.messageId });
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
      if (updateError) console.error('Order email failure persistence failed:', updateError.message);
      return json({ error: 'Email delivery failed' }, 502);
    }
  } catch (err) {
    console.error('send-order-confirmation error:', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
