export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

export function safeHttpsUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? escapeHtml(url.toString()) : '#';
  } catch {
    return '#';
  }
}