import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { source } from '@/lib/source';
import {
  getUpdateRssEntries,
  parseChangelogFromMarkdown,
  parseFrontmatterValue,
} from '@/lib/changelog';
import { getLanguages, getSiteOrigin } from '@/lib/velu';

interface RouteParams {
  slug?: string[];
}

export const dynamic = 'force-static';

function normalizePath(value: string): string {
  if (!value) return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  if (collapsed !== '/' && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed;
}

function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toUtcDate(value: string | undefined): string {
  if (!value) return new Date().toUTCString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toUTCString();
  return parsed.toUTCString();
}

function resolveLocaleSlug(slugInput: string[] | undefined) {
  const languages = getLanguages();
  const defaultLanguage = languages[0] ?? 'en';
  const slug = slugInput ?? [];
  const firstSeg = slug[0];
  const hasLocalePrefix = languages.includes(firstSeg ?? '');

  return {
    locale: hasLocalePrefix ? firstSeg! : defaultLanguage,
    pageSlug: hasLocalePrefix ? slug.slice(1) : slug,
  };
}

async function loadMarkdownForSlug(slug: string[], locale: string, hasI18n: boolean): Promise<string | undefined> {
  const rel = slug.join('/');
  const docsRoots = [
    join(process.cwd(), 'content', 'docs'),
    join(process.cwd(), '.velu-out', 'content', 'docs'),
  ];
  const roots = hasI18n
    ? docsRoots.flatMap((root) => [join(root, locale), root])
    : docsRoots;
  const paths = roots.flatMap((root) => [join(root, `${rel}.md`), join(root, `${rel}.mdx`)]);

  for (const filePath of paths) {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      // ignore and continue
    }
  }

  return undefined;
}

export async function generateStaticParams() {
  const generated = source.generateParams('slug') as Array<{ slug?: string[] }>;
  const seen = new Set<string>();
  const out: Array<{ slug: string[] }> = [];

  for (const entry of generated) {
    const slug = entry.slug ?? [];
    if (slug.length === 0) continue;
    const key = slug.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slug });
  }

  return out;
}

export async function GET(_request: Request, { params }: { params: Promise<RouteParams> }) {
  const resolvedParams = await params;
  const fullSlug = resolvedParams.slug ?? [];

  if (fullSlug.length === 0) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const { locale, pageSlug } = resolveLocaleSlug(fullSlug);
  const hasI18n = getLanguages().length > 1;
  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const fromFile = await loadMarkdownForSlug(pageSlug, locale, hasI18n);
  const fromData = ((page.data as unknown) as Record<string, unknown>).processedMarkdown;
  const markdown = typeof fromFile === 'string' && fromFile.trim().length > 0
    ? fromFile
    : (typeof fromData === 'string' ? fromData : undefined);
  const parsed = parseChangelogFromMarkdown(markdown);
  if (parsed.updates.length === 0) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const origin = getSiteOrigin();
  const pagePath = normalizePath(fullSlug.join('/'));
  const pageUrl = `${origin}${pagePath}`;
  const rssUrl = `${pageUrl.replace(/\/$/, '')}/rss.xml`;

  const channelTitle = parseFrontmatterValue(markdown, 'title') ?? page.data.title ?? 'Changelog';
  const channelDescription = parseFrontmatterValue(markdown, 'description')
    ?? page.data.description
    ?? 'Product updates and announcements';

  const items = parsed.updates.flatMap((update) => {
    const entries = getUpdateRssEntries(update);
    const pubDate = toUtcDate(update.date ?? update.label);
    return entries.map((entry) => {
      const link = `${pageUrl.replace(/\/$/, '')}#${entry.anchor || update.anchor}`;
      return `<item>
      <title>${cdata(entry.title)}</title>
      <description>${cdata(entry.description)}</description>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>${cdata(channelTitle)}</title>
    <description>${cdata(channelDescription)}</description>
    <link>${pageUrl}</link>
    <generator>Velu</generator>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${rssUrl}" rel="self" type="application/rss+xml"/>
    ${items.join('\n    ')}
  </channel>
</rss>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
