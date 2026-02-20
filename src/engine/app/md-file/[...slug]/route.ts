import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { source } from '@/lib/source';
import { getLanguages } from '@/lib/velu';

interface RouteParams {
  slug?: string[];
}

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const generated = source.generateParams('slug') as Array<{ slug?: string[] }>;
  const seen = new Set<string>();
  const out: Array<{ slug: string[] }> = [];

  for (const entry of generated) {
    const slug = entry.slug ?? [];
    if (slug.length === 0) continue;
    const mdSlug = [...slug];
    mdSlug[mdSlug.length - 1] = `${mdSlug[mdSlug.length - 1]}.md`;
    const key = mdSlug.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slug: mdSlug });
  }

  return out;
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
  const roots = hasI18n
    ? [join(process.cwd(), 'content', 'docs', locale), join(process.cwd(), 'content', 'docs')]
    : [join(process.cwd(), 'content', 'docs')];
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

export async function GET(_request: Request, { params }: { params: Promise<RouteParams> }) {
  const resolvedParams = await params;
  const fullSlug = resolvedParams.slug ?? [];
  if (fullSlug.length === 0) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const normalized = [...fullSlug];
  const lastIndex = normalized.length - 1;
  const last = normalized[lastIndex] ?? '';
  if (last.toLowerCase().endsWith('.md')) {
    const stripped = last.slice(0, -3);
    if (stripped) normalized[lastIndex] = stripped;
  }

  const { locale, pageSlug } = resolveLocaleSlug(normalized);
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
    : (typeof fromData === 'string' ? fromData : `# ${page.data.title}\n`);

  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    },
  });
}
