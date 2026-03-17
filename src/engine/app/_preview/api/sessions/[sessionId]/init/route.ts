import { NextRequest } from 'next/server';
import { existsSync, utimesSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateSessionContent } from '@/lib/preview-content';
import { verifyApiSecret, unauthorizedResponse } from '@/lib/preview-auth';

/**
 * Touch source.config.ts to trigger fumadocs-mdx rescan,
 * then wait for the .source output to regenerate.
 */
async function triggerMdxRegeneration(): Promise<void> {
  const configPath = resolve(process.cwd(), 'source.config.ts');
  const sourceDir = resolve(process.cwd(), '.source');

  // Record current .source mtime (if it exists)
  const beforeMtime = existsSync(sourceDir)
    ? statSync(sourceDir).mtimeMs
    : 0;

  // Touch source.config.ts to trigger chokidar → fumadocs-mdx full reload
  const now = new Date();
  utimesSync(configPath, now, now);

  // Wait for .source directory to be updated (up to 30s)
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (existsSync(sourceDir)) {
      const currentMtime = statSync(sourceDir).mtimeMs;
      if (currentMtime > beforeMtime) return;
    }
  }
  console.warn('[PREVIEW] MDX regeneration timed out after 30s');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!verifyApiSecret(request)) return unauthorizedResponse();

  const { sessionId } = await params;

  try {
    const result = generateSessionContent(sessionId);

    // Trigger fumadocs-mdx to discover the new content files
    await triggerMdxRegeneration();

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
