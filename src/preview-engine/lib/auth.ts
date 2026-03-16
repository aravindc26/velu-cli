/**
 * Shared API authentication via PREVIEW_API_SECRET.
 */
import { NextRequest } from 'next/server';

const PREVIEW_API_SECRET = process.env.PREVIEW_API_SECRET || '';

export function verifyApiSecret(request: NextRequest): boolean {
  if (!PREVIEW_API_SECRET) return true; // No secret configured — allow all
  const header = request.headers.get('x-preview-secret') || '';
  return header === PREVIEW_API_SECRET;
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
