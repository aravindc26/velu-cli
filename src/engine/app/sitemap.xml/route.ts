import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectLlmsPages, normalizePath } from '@/lib/llms';
import { getSeoConfig, getSiteOrigin } from '@/lib/velu';

export const dynamic = 'force-static';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function readCustomSitemapFile(): Promise<string | null> {
  const docsDir = process.env.VELU_DOCS_DIR?.trim();
  if (docsDir) {
    const docsPath = join(docsDir, 'sitemap.xml');
    if (!existsSync(docsPath)) return null;
    try {
      return await readFile(docsPath, 'utf-8');
    } catch {
      return null;
    }
  }

  const candidates = [
    join(process.cwd(), 'sitemap.xml'),
    join(process.cwd(), 'public', 'sitemap.xml'),
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
  const custom = await readCustomSitemapFile();
  if (custom !== null) {
    return new Response(custom, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
      },
    });
  }

  const seo = getSeoConfig();
  const origin = getSiteOrigin();
  const pages = await collectLlmsPages({ indexing: seo.indexing });
  const now = new Date().toISOString();

  const urls = pages
    .filter((page) => !page.noindex)
    .map((page) => {
      const loc = escapeXml(`${origin}${normalizePath(page.path)}`);
      return `  <url><loc>${loc}</loc><lastmod>${now}</lastmod></url>`;
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
    },
  });
}
