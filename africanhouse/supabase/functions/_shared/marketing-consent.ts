export const MARKETING_CONSENT_VERSION = 'homepage-marketing-v1';
export const MARKETING_CONSENT_TEXT = 'I agree to receive AfriLoom news, new-arrival updates and offers by email. I can unsubscribe at any time.';

export function normalizeConsentedEmail(email: unknown, consent: unknown, version: unknown): string | null {
  if (consent !== true || version !== MARKETING_CONSENT_VERSION || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}