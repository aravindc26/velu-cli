import { NextRequest } from 'next/server';
import { generateSessionContent } from '@/lib/preview-content';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/preview-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;

  try {
    const result = generateSessionContent(sessionId);
    return Response.json({
      status: 'ready',
      url: `/${sessionId}/`,
      firstPage: result.firstPage,
      pageCount: result.pageCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PREVIEW] Init failed for session ${sessionId}:`, message);
    return Response.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
