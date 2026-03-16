import { NextRequest } from 'next/server';
import { syncSessionFile } from '@/lib/content-generator';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;
  const file = request.nextUrl.searchParams.get('file');

  if (!file) {
    return Response.json(
      { error: 'Missing "file" query parameter' },
      { status: 400 },
    );
  }

  try {
    const result = syncSessionFile(sessionId, file);
    return Response.json({
      status: 'synced',
      file,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PREVIEW] Sync failed for session ${sessionId}, file ${file}:`, message);
    return Response.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
