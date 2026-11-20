import { welcomeEmail } from '../_shared/email-templates.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { email, name } = await req.json();
    if (!email) return json({ error: 'email is required' }, 400);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email service not configured' }, 500);

    const firstName = (name ?? email.split('@')[0]).split(' ')[0];
    const html      = welcomeEmail(firstName);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'AfriLoom Fabrics <no-reply@afriloomfabrics.com>',
        to:      [email],
        subject: `Welcome to AfriLoom Fabrics, ${firstName}!`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return json({ error: 'Email delivery failed' }, 500);
    }

    return json({ success: true });
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
