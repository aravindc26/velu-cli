import { NextRequest } from 'next/server';
import { generateSessionContent } from '@/lib/preview-content';
import { invalidateSessionSource } from '@/lib/preview-source';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/preview-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;

  console.log(`[PREVIEW:init] START session=${sessionId}`);

  try {
    const result = generateSessionContent(sessionId);
    console.log(`[PREVIEW:init] generateSessionContent result:`, JSON.stringify(result));

    // Invalidate the cached dynamic source so the next page request
    // re-scans the content directory and picks up the new files.
    invalidateSessionSource(sessionId);
    console.log(`[PREVIEW:init] DONE session=${sessionId}`);

    return Response.json({
      status: 'ready',
      url: `/${sessionId}/`,
      firstPage: result.firstPage,
      pageCount: result.pageCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PREVIEW:init] FAILED session=${sessionId}:`, message);
    return Response.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
