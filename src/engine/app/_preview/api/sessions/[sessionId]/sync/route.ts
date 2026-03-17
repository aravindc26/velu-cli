import { NextRequest } from 'next/server';
import { syncSessionFile } from '@/lib/preview-content';
import { invalidateSessionSource } from '@/lib/preview-source';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/preview-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;
  const file = request.nextUrl.searchParams.get('file');

  console.log(`[PREVIEW:sync] START session=${sessionId} file=${file}`);

  if (!file) {
    return Response.json(
      { error: 'Missing "file" query parameter' },
      { status: 400 },
    );
  }

  try {
    const result = syncSessionFile(sessionId, file);
    console.log(`[PREVIEW:sync] syncSessionFile result:`, JSON.stringify(result));

    // Invalidate cached source so next page request re-scans content
    invalidateSessionSource(sessionId);
    console.log(`[PREVIEW:sync] DONE session=${sessionId} file=${file}`);

    return Response.json({
      status: 'synced',
      file,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PREVIEW:sync] FAILED session=${sessionId} file=${file}:`, message);
    return Response.json(
      { status: 'error', error: message },
      { status: 500 },
    );
  }
}
