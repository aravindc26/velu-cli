import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getPreviewSecret, verifyPreviewToken } from './lib/preview-auth';

/**
 * Next.js proxy (middleware) that enforces HMAC-signed token authentication
 * for preview page routes.
 *
 * Flow:
 *  1. Requests with `x-preview-secret` header pass through (server-to-server API calls).
 *  2. Extract sessionId from the URL path (`/{sessionId}/...`).
 *  3. If `?token=` query param is present: validate HMAC, set an HttpOnly cookie,
 *     redirect to the same URL without the token (keeps browser history clean).
 *  4. If a valid `__velu_preview_{sessionId}` cookie exists: allow.
 *  5. Otherwise: 403.
 */
export function proxy(request: NextRequest) {
  const secret = getPreviewSecret();

  // No secret configured — allow everything (dev / local)
  if (!secret) return NextResponse.next();

  // Server-to-server API calls use the x-preview-secret header — skip page auth
  if (request.headers.get('x-preview-secret')) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Extract sessionId: first path segment after leading slash
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return NextResponse.next();

  // Skip Next.js internal and static paths
  const first = segments[0];
  if (first === '_next' || first === 'api') return NextResponse.next();

  // sessionId should be numeric
  const sessionId = first;
  if (!/^\d+$/.test(sessionId)) return NextResponse.next();

  // --- Token in query string: validate, set cookie, redirect to clean URL ---
  const tokenParam = request.nextUrl.searchParams.get('token');
  if (tokenParam) {
    const { valid, expiry } = verifyPreviewToken(tokenParam, sessionId);
    if (!valid) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Redirect to the same URL without the token
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('token');
    const response = NextResponse.redirect(cleanUrl);

    // Compute remaining TTL for cookie maxAge
    const now = Math.floor(Date.now() / 1000);
    const maxAge = expiry > 0 ? expiry - now : 86400;

    response.cookies.set(`__velu_preview_${sessionId}`, tokenParam, {
      httpOnly: true,
      secure: true,
      sameSite: 'none', // Required for cross-origin iframe
      path: `/${sessionId}`,
      maxAge,
    });

    return response;
  }

  // --- Cookie: validate existing token stored in cookie ---
  const cookie = request.cookies.get(`__velu_preview_${sessionId}`);
  if (cookie) {
    const { valid } = verifyPreviewToken(cookie.value, sessionId);
    if (valid) return NextResponse.next();
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export const config = {
  matcher: [
    '/((?!_next|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
};
