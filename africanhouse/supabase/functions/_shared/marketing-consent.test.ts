import { MARKETING_CONSENT_VERSION, normalizeConsentedEmail } from './marketing-consent';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  normalizeConsentedEmail('  Person@Example.com ', true, MARKETING_CONSENT_VERSION) === 'person@example.com',
  'affirmative consent should normalize and accept a valid email',
);
assert(normalizeConsentedEmail('person@example.com', false, MARKETING_CONSENT_VERSION) === null, 'missing consent must be rejected');
assert(normalizeConsentedEmail('person@example.com', true, 'old-version') === null, 'unknown wording versions must be rejected');
assert(normalizeConsentedEmail('not-an-email', true, MARKETING_CONSENT_VERSION) === null, 'invalid email must be rejected');