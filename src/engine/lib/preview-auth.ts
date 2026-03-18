/**
 * Shared API authentication via PREVIEW_API_SECRET.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

const PREVIEW_API_SECRET = process.env.PREVIEW_API_SECRET || '';

export function getPreviewSecret(): string {
  return PREVIEW_API_SECRET;
}

export function verifyApiSecret(request: NextRequest): boolean {
  if (!PREVIEW_API_SECRET) return true; // No secret configured — allow all
  const header = request.headers.get('x-preview-secret') || '';
  return header === PREVIEW_API_SECRET;
}

/**
 * Verify an HMAC-signed preview token.
 *
 * Token format: `{base64url_hmac}.{sessionId}:{unix_expiry}`
 *
 * Returns `{ valid: true, expiry }` when the token is authentic, matches the
 * expected session ID, and has not expired. Returns `{ valid: false, expiry: 0 }`
 * otherwise.
 */
export function verifyPreviewToken(
  token: string,
  expectedSessionId: string,
): { valid: boolean; expiry: number } {
  const fail = { valid: false, expiry: 0 };
  if (!PREVIEW_API_SECRET) return { valid: true, expiry: 0 }; // No secret — allow all

  const dotIdx = token.indexOf('.');
  if (dotIdx === -1) return fail;

  const sigB64 = token.slice(0, dotIdx);
  const payload = token.slice(dotIdx + 1);

  // Payload must be "{sessionId}:{expiry}"
  const colonIdx = payload.indexOf(':');
  if (colonIdx === -1) return fail;

  const sessionId = payload.slice(0, colonIdx);
  const expiryStr = payload.slice(colonIdx + 1);

  if (sessionId !== expectedSessionId) return fail;

  const expiry = parseInt(expiryStr, 10);
  if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return fail;

  // Recompute HMAC and compare in constant time
  const expectedSig = createHmac('sha256', PREVIEW_API_SECRET)
    .update(payload)
    .digest('base64url')
    // Strip padding to match Python's rstrip(b"=")
    .replace(/=+$/, '');

  // Ensure both are the same length before timingSafeEqual
  const sigBuf = Buffer.from(sigB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return fail;

  if (!timingSafeEqual(sigBuf, expectedBuf)) return fail;

  return { valid: true, expiry };
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
