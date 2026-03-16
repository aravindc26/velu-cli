import { NextRequest } from 'next/server';
import { removeSessionContent } from '@/lib/content-generator';
import { clearSessionCache } from '@/lib/session-config';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;

  try {
    removeSessionContent(sessionId);
    clearSessionCache(sessionId);
    return Response.json({ status: 'removed', sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PREVIEW] Cleanup failed for session ${sessionId}:`, message);
    return Response.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
