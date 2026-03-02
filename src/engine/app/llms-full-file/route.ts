import {
  collectLlmsPages,
  getSiteTitle,
  normalizePath,
  readCustomLlmsFile,
} from '@/lib/llms';
import { getSiteOrigin } from '@/lib/velu';

export const dynamic = 'force-static';

export async function GET() {
  const custom = await readCustomLlmsFile('llms-full.txt');
  if (custom !== null) {
    return new Response(custom, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const siteTitle = getSiteTitle();
  const origin = getSiteOrigin();
  const pages = await collectLlmsPages({ includeMarkdown: true });
  const includedPages = pages.filter((page) => {
    if (page.noindex) return false;
    const hasBodyContent = typeof page.markdown === 'string' && page.markdown.trim().length > 0;
    if (page.isOpenApiOperation && !hasBodyContent) return false;
    if (page.sourceKind === 'generated' && page.isOpenApiOperation) return false;
    return true;
  });

  const lines: string[] = [];
  lines.push(`# ${siteTitle}`);
  lines.push('');

  for (const page of includedPages) {
    const url = `${origin}${normalizePath(page.path)}`;
    lines.push(`## ${page.title}`);
    lines.push('');
    lines.push(`Source: ${url}`);
    lines.push('');
    if (page.description) {
      lines.push(`> ${page.description.replace(/\s+/g, ' ').trim()}`);
      lines.push('');
    }
    lines.push(page.markdown && page.markdown.length > 0 ? page.markdown : '_No content._');
    lines.push('');
  }

  const body = `${lines.join('\n').trimEnd()}\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
