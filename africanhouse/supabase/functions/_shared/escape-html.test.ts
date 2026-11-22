import { escapeHtml, safeHttpsUrl } from './escape-html';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(escapeHtml(`<script x="y">&'`) === '&lt;script x=&quot;y&quot;&gt;&amp;&#39;', 'dynamic text must be HTML escaped');
assert(safeHttpsUrl('https://afriloomfabrics.com/unsubscribe?token=a&b') === 'https://afriloomfabrics.com/unsubscribe?token=a&amp;b', 'HTTPS URLs must be escaped for attributes');
assert(safeHttpsUrl('javascript:alert(1)') === '#', 'non-HTTPS URL schemes must be rejected');