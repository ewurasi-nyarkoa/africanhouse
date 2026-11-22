import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { Webhook } from 'npm:svix@1.66.0';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!webhookSecret || !supabaseUrl || !serviceKey) return json({ error: 'Webhook is not configured' }, 500);

    const payload = await req.text();
    if (payload.length > 1_000_000) return json({ error: 'Payload too large' }, 413);
    const eventId = req.headers.get('svix-id');
    const timestamp = req.headers.get('svix-timestamp');
    const signature = req.headers.get('svix-signature');
    if (!eventId || !timestamp || !signature) return json({ error: 'Invalid webhook signature' }, 401);

    let event: any;
    try {
      event = new Webhook(webhookSecret).verify(payload, {
        'svix-id': eventId,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      });
    } catch {
      return json({ error: 'Invalid webhook signature' }, 401);
    }

    if (event?.type !== 'email.delivered' && event?.type !== 'email.bounced') {
      return json({ success: true, ignored: true });
    }
    if (typeof event.data?.email_id !== 'string') return json({ error: 'Invalid email event' }, 400);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.rpc('record_resend_email_event', {
      p_event_id: eventId,
      p_event_type: event.type,
      p_message_id: event.data.email_id,
      p_error: event.type === 'email.bounced' ? String(event.data.bounce?.message ?? 'Message bounced') : null,
    });
    if (error) {
      console.error('Resend webhook persistence failed:', error.message);
      return json({ error: 'Could not persist email event' }, 500);
    }
    return json({ success: true });
  } catch (error) {
    console.error('Resend webhook error:', error);
    return json({ error: 'Unexpected webhook error' }, 500);
  }
});

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}