import { ResendError, sendResendEmail } from './resend';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const headers: Headers[] = [];
  let callCount = 0;
  const accepted = await sendResendEmail('test-key', {
    to: 'test@example.com', subject: 'Test', html: '<p>Test</p>', idempotencyKey: 'delivery-1',
  }, 3, async (_input, init) => {
    callCount++;
    headers.push(new Headers(init?.headers));
    return callCount === 1
      ? new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } })
      : Response.json({ id: 'resend-1' });
  }, async () => {});
  assert(accepted.messageId === 'resend-1' && accepted.attempts === 2, 'transient failure should retry and return provider ID');
  assert(headers.every(header => header.get('Idempotency-Key') === 'delivery-1'), 'retries must reuse the stable idempotency key');

  let permanentCalls = 0;
  try {
    await sendResendEmail('test-key', {
      to: 'test@example.com', subject: 'Test', html: '<p>Test</p>', idempotencyKey: 'delivery-2',
    }, 3, async () => {
      permanentCalls++;
      return new Response('invalid recipient', { status: 400 });
    }, async () => {});
    throw new Error('permanent failures should reject');
  } catch (error) {
    assert(error instanceof ResendError && !error.retryable, '4xx failures should be marked non-retryable');
  }
  assert(permanentCalls === 1, 'permanent failures should not be retried');
}

void run();