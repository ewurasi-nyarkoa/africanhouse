export interface ResendMessage {
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}

export class ResendError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ResendError';
  }
}

export async function sendResendEmail(
  apiKey: string,
  message: ResendMessage,
  maxAttempts = 3,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<{ messageId: string; attempts: number }> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    let response: Response;
    try {
      response = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: 'AfriLoom Fabrics <no-reply@afriloomfabrics.com>',
          to: [message.to],
          subject: message.subject,
          html: message.html,
        }),
      });
    } catch (error) {
      if (attempts >= maxAttempts) {
        throw new ResendError(errorMessage(error), attempts, true);
      }
      await wait(backoff(attempts));
      continue;
    }

    if (response.ok) {
      const payload = await response.json().catch(() => null);
      if (typeof payload?.id !== 'string' || payload.id.length === 0) {
        throw new ResendError('Resend returned no message ID', attempts, false, response.status);
      }
      return { messageId: payload.id, attempts };
    }

    const detail = (await response.text().catch(() => '')).slice(0, 1000);
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (!retryable || attempts >= maxAttempts) {
      throw new ResendError(`Resend request failed (${response.status}): ${detail}`, attempts, retryable, response.status);
    }

    await wait(retryDelay(response.headers.get('retry-after'), attempts));
  }

  throw new ResendError('Resend request failed', attempts, true);
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 10_000));
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp)) return Math.max(0, Math.min(timestamp - Date.now(), 10_000));
  }
  return backoff(attempt);
}

function backoff(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 5_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Network error while contacting Resend';
}