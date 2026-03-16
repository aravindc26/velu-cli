import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { getWorkspaceDir } from '@/lib/session-config';

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'application/javascript',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; path: string[] }> },
) {
  const { sessionId, path: segments } = await params;
  const assetPath = segments.join('/');

  // Prevent path traversal
  if (assetPath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const workspaceDir = getWorkspaceDir(sessionId);
  const filePath = join(workspaceDir, assetPath);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const data = readFileSync(filePath);

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=60',
    },
  });
}
