import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSeoConfig, getSiteOrigin } from '@/lib/velu';

async function readCustomRobotsFile(): Promise<string | null> {
  const docsDir = process.env.VELU_DOCS_DIR?.trim();
  if (docsDir) {
    const docsPath = join(docsDir, 'robots.txt');
    if (!existsSync(docsPath)) return null;
    try {
      return await readFile(docsPath, 'utf-8');
    } catch {
      return null;
    }
  }

  const candidates = [
    join(process.cwd(), 'robots.txt'),
    join(process.cwd(), 'public', 'robots.txt'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // ignore and continue
    }
  }

  return null;
}

export async function GET(): Promise<Response> {
  const custom = await readCustomRobotsFile();
  if (custom !== null) {
    return new Response(custom, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  const seo = getSeoConfig();
  const origin = getSiteOrigin();
  const robotsTag = (seo.metatags.robots ?? '').toLowerCase();
  const blockAll = robotsTag.includes('noindex') || robotsTag.includes('none');
  const lines = [
    'User-agent: *',
    blockAll ? 'Disallow: /' : 'Allow: /',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}
