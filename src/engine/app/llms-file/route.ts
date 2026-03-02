import {
  collectLlmsPages,
  getSiteTitle,
  normalizePath,
  readCustomLlmsFile,
} from '@/lib/llms';
import { getSiteOrigin } from '@/lib/velu';

export const dynamic = 'force-static';

function cleanInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toMarkdownPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized.endsWith('.md')) return normalized;
  return `${normalized}.md`;
}

function toSpecUrl(origin: string, spec: string): string {
  const trimmed = spec.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${origin}${normalizePath(trimmed)}`;
}

export async function GET() {
  const custom = await readCustomLlmsFile('llms.txt');
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
  const pages = await collectLlmsPages();
  const docsPages = pages.filter((page) => !page.noindex && !(page.sourceKind === 'generated' && page.isOpenApiOperation));
  const openApiSpecs = Array.from(
    new Set(
      pages
        .filter((page) => !page.noindex && page.sourceKind === 'generated' && page.isOpenApiOperation && typeof page.openapiSpec === 'string')
        .map((page) => page.openapiSpec!.trim())
        .filter((spec) => spec.length > 0),
    ),
  );

  const lines: string[] = [];
  lines.push(`# ${siteTitle}`);
  lines.push('');
  lines.push('## Docs');
  lines.push('');
  for (const page of docsPages) {
    const url = `${origin}${toMarkdownPath(page.path)}`;
    const description = page.description ? cleanInlineText(page.description) : '';
    if (description) {
      lines.push(`- [${page.title}](${url}): ${description}`);
    } else {
      lines.push(`- [${page.title}](${url})`);
    }
  }
  if (openApiSpecs.length > 0) {
    lines.push('');
    lines.push('## OpenAPI Specs');
    lines.push('');
    for (const spec of openApiSpecs) {
      const url = toSpecUrl(origin, spec);
      lines.push(`- [${spec}](${url})`);
    }
  }
  lines.push('');

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
