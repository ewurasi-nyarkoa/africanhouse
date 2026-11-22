import { campaignEmail, orderConfirmationEmail, welcomeEmail } from './email-templates.ts';

Deno.test('campaign and welcome templates escape names and retain safe unsubscribe links', () => {
  const welcome = welcomeEmail('<img src=x onerror=alert(1)>', 'https://afriloomfabrics.com/unsubscribe?token=a&b');
  assert(!welcome.includes('<img src=x'), 'welcome name must not become HTML');
  assert(welcome.includes('&lt;img'), 'welcome name should be escaped');
  assert(welcome.includes('href="https://afriloomfabrics.com/unsubscribe?token=a&amp;b"'), 'unsubscribe URL should be escaped in its attribute');

  const campaign = campaignEmail(
    'Sale',
    '<p>{{name}}</p><script>alert(1)</script><a href="javascript:alert(1)">unsafe</a>',
    '<svg onload=alert(1)>',
    'https://afriloomfabrics.com/unsubscribe?token=secure',
  );
  assert(!campaign.includes('<script') && !campaign.includes('javascript:'), 'campaign content must be sanitized');
  assert(campaign.includes('&lt;svg'), 'personalized name must be escaped after sanitization');
});

Deno.test('order confirmation escapes database text and rejects unsafe tracking URLs', () => {
  const html = orderConfirmationEmail(
    '<script>alert(1)</script>',
    12,
    [{ fabric_name: '<img src=x onerror=alert(1)>', yards: 2, price_per_yard: 10, subtotal: 20 }],
    20,
    0,
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
  );
  assert(!html.includes('<script>alert') && !html.includes('<img src=x'), 'customer and fabric text must be escaped');
  assert(html.includes('&lt;svg'), 'delivery location must be escaped');
  assert(!html.includes('href="javascript:'), 'unsafe tracking URLs must be rejected');
});

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}