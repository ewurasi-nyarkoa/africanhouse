import { sanitizeCampaignHtml } from './email-sanitizer.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test('campaign sanitizer removes unsafe markup and preserves safe content', () => {
  const html = sanitizeCampaignHtml(
    '<p onclick="alert(1)" style="color:#6B1E2B;position:fixed">Hello<script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://afriloomfabrics.com/shop">shop</a></p>',
  );
  assert(!html.includes('<script') && !html.includes('onclick'), 'scripts and event handlers must be removed');
  assert(!html.includes('javascript:'), 'unsafe link schemes must be removed');
  assert(html.includes('https://afriloomfabrics.com/shop'), 'safe HTTPS links should remain');
  assert(!html.includes('position:fixed'), 'disallowed CSS declarations must be removed');
});