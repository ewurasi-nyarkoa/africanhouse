# Email Delivery Security and Operations

## Migration review order

These scripts are drafts only. They have not been run against the local or production database.

1. `migrations/202611220001_marketing_consent_and_unsubscribe.sql`
   - Adds consent status, timestamp, source, wording version/text, and cryptographically random UUID unsubscribe tokens.
   - Rotates all existing unsubscribe tokens because the previous generator cannot be verified from this repository.
   - Adds a case-insensitive email uniqueness constraint, the consent-required subscription RPC, and the token-only idempotent unsubscribe RPC.
   - Enables subscriber/campaign RLS and limits table access to `is_admin()` users or trusted service-role functions.
2. `migrations/202611220002_email_delivery_reliability.sql`
   - Adds campaign counters, claim leases, status constraints, and the recipient delivery ledger.
   - Adds atomic claim, recipient-claim, consent-recheck, and statistics RPCs.
   - Adds RLS for delivery records and a unique Paystack-reference index.
3. `migrations/202611220003_transactional_email_and_order_idempotency.sql`
   - Adds idempotency records for transactional email, order-processing claims, and webhook event IDs.
   - Adds a per-payment/per-fabric inventory deduction ledger around the existing `deduct_inventory` function.
   - Adds the database RPCs used by order processing, delivery retries, and signed Resend event reporting.
   - Seeds existing Auth accounts as already processed so the first sign-in after rollout does not send an unexpected account-welcome email.

## Schema assumptions requiring review

There are no checked-in SQL migrations, schema snapshot, or implementation of `public.is_admin()` in this workspace. Before applying any draft, inspect the target database and verify:

- `public.subscribers`, `public.email_campaigns`, and `public.orders` have the fields used by the app and migration preflights.
- `public.is_admin()` is a trusted, non-user-controlled admin check and is safe to call from RLS policies.
- `public.deduct_inventory` has exactly one two-argument overload and returns `json` or `jsonb`; the wrapper resolves its argument types from PostgreSQL metadata.
- Existing campaign statuses are only the values accepted by the draft; status-check replacement is restricted to checks that constrain only the status column.
- Subscriber emails and Paystack references have no duplicates that would prevent the new unique indexes.
- `auth.users` is the standard Supabase Auth table and contains the existing users to seed as already welcomed.
- `orders.id` is an integer type, as assumed by the existing tracking and confirmation flow.
- `customer_profiles.id` matches the Supabase Auth user ID, and the email signup function may read it with the service role.

Each migration has preflight checks and runs in a transaction, but those checks do not replace reviewing the actual schema and function bodies. The first migration's policy definitions depend on the verified `is_admin()` implementation. If that function is missing or has different semantics, stop and revise the policies before applying anything.

## Local function configuration

`config.toml` enables gateway JWT verification for campaign and account-welcome functions. Public signup and Resend webhook functions perform their own consent/signature checks. Order processing remains public because it verifies Paystack server-side; order-confirmation dispatch is protected by the service-role bearer check inside its function.

Required server-side settings include Supabase URL, anon key, service-role key, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `PAYSTACK_SECRET_KEY`. Keep secrets in the local Supabase function environment, never in Angular environment files or source control. The webhook URL must be registered with Resend and subscribed to the `email.delivered` and `email.bounced` events after review/deployment approval.

## Delivery guarantees and limits

- Campaign recipients are snapshotted once, require active status plus complete affirmative-consent evidence, and are checked again before each attempt.
- Existing subscriber rows receive `marketing_consent = false`; those contacts are excluded until they explicitly opt in through the updated form.
- Campaign and transactional sends persist a stable delivery key, provider message ID, attempt count, and outcome. Successful recipient rows are not selected for retries.
- Resend idempotency keys expire after 24 hours. If Resend accepted a message but the function failed before saving its provider response and a retry occurs after the key expires, a duplicate remains possible. The implementation therefore offers idempotent processing and bounded retries, not guaranteed exactly-once delivery.
- `sent` means Resend accepted the message. `delivered` is updated only after a valid, signed Resend webhook. Webhook event IDs are persisted to tolerate replay.
- A campaign `sending` lease expires if the Edge Function is interrupted. A later administrator retry may resume pending/expired recipient rows; it does not resend accepted rows.
- Order confirmation retries are initiated when `process-order` is invoked again with the same verified Paystack reference. The order and inventory deductions are not recreated; the delivery ledger prevents duplicate confirmation sends.
- Because the previous unsubscribe-token generator is absent from the repository, migration 001 rotates every existing token. Unsubscribe links in previously sent marketing emails will no longer work after that migration; this is the deliberate tradeoff for replacing unverifiable tokens with UUID-based random tokens.

## Validation performed

The Angular production build and local Node tests cover the Angular templates, authorization decisions, consent request validation, HTML escaping, and Resend retry behavior. SQL migrations and Deno Edge Functions require a local Supabase/PostgreSQL and Deno environment for integration/type validation; those tools were not available during this implementation. The repository's Angular test command is separately blocked by the existing `app.component.spec.ts` assertion that references the removed `AppComponent.title` property.
