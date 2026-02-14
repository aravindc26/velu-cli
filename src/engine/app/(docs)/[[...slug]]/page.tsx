import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/mdx-components';
import { source } from '@/lib/source';
import { getLanguages } from '@/lib/velu';
import { CopyPageButton } from '@/components/copy-page';

interface RouteParams {
  slug?: string[];
}

interface PageProps {
  params: Promise<RouteParams>;
}

function resolveLocaleSlug(slugInput: string[] | undefined) {
  const languages = getLanguages();
  const defaultLanguage = languages[0] ?? 'en';
  const slug = slugInput ?? [];
  const firstSeg = slug[0];
  const hasLocalePrefix = languages.includes(firstSeg ?? '');

  return {
    defaultLanguage,
    locale: hasLocalePrefix ? firstSeg! : defaultLanguage,
    pageSlug: hasLocalePrefix ? slug.slice(1) : slug,
  };
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const { locale, pageSlug } = resolveLocaleSlug(resolvedParams.slug);
  const hasI18n = getLanguages().length > 1;

  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <div data-pagefind-body data-pagefind-meta={`title:${page.data.title}`}>
        <div className="velu-title-row">
          <DocsTitle>{page.data.title}</DocsTitle>
          <CopyPageButton />
        </div>
        {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
        <DocsBody>
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </div>
      <footer className="velu-footer">
        Powered by <a href="https://getvelu.com" target="_blank" rel="noopener noreferrer">Velu</a>
      </footer>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const generated = source.generateParams('slug') as Array<{ slug?: string[] }>;
  const seen = new Set<string>();

  const nonRoot = generated.filter((entry) => {
    const slug = entry.slug ?? [];
    if (slug.length === 0) return false;
    const key = slug.join('/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Include root variants for optional catch-all [[...slug]] in export mode.
  return [{}, { slug: undefined }, { slug: [] }, ...nonRoot];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const { locale, pageSlug } = resolveLocaleSlug(resolvedParams.slug);
  const hasI18n = getLanguages().length > 1;

  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
