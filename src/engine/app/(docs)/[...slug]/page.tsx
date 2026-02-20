import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/mdx-components';
import { source } from '@/lib/source';
import { getLanguages, getVersionOptions, getProductOptions } from '@/lib/velu';
import { CopyPageButton } from '@/components/copy-page';
import { TocExamples } from '@/components/toc-examples';

interface RouteParams {
  slug?: string[];
}

interface PageProps {
  params: Promise<RouteParams>;
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

function resolveContextFromSlug(slugInput: string[] | undefined) {
  const languages = getLanguages();
  const versions = getVersionOptions();
  const products = getProductOptions();
  const slug = slugInput ?? [];
  
  // Check for language prefix
  const firstSeg = slug[0];
  const hasLocalePrefix = languages.includes(firstSeg ?? '');
  const locale = hasLocalePrefix ? firstSeg! : (languages[0] ?? 'en');
  const remainingSlug = hasLocalePrefix ? slug.slice(1) : slug;
  
  // Check for version/product in remaining slug
  const contextSeg = remainingSlug[0] ?? '';
  const version = versions.find((v) => v.slug === contextSeg);
  const product = products.find((p) => p.slug === contextSeg);
  
  return {
    locale,
    version: version?.slug,
    product: product?.slug,
  };
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const { locale, pageSlug } = resolveLocaleSlug(resolvedParams.slug);
  const { locale: filterLocale, version, product } = resolveContextFromSlug(resolvedParams.slug);
  const hasI18n = getLanguages().length > 1;

  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) notFound();

  const MDX = page.data.body;
  const sourceMarkdown = await loadMarkdownForSlug(pageSlug, locale, hasI18n);
  const hasPanelExamples = typeof sourceMarkdown === 'string'
    && /<(?:Panel|RequestExample|ResponseExample)(?:\s|>)/.test(sourceMarkdown);

  // Build pagefind filter attributes
  const metaAttrs: string[] = [`title:${page.data.title}`];
  const filterAttrs: string[] = [];
  if (hasI18n) {
    metaAttrs.push(`language:${filterLocale}`);
    filterAttrs.push(`language:${filterLocale}`);
  }
  if (version) {
    metaAttrs.push(`version:${version}`);
    filterAttrs.push(`version:${version}`);
  }
  if (product) {
    metaAttrs.push(`product:${product}`);
    filterAttrs.push(`product:${product}`);
  }

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      tableOfContent={hasPanelExamples ? { header: <div className="velu-toc-panel-rail" /> } : undefined}
    >
      <div
        data-pagefind-body
        data-pagefind-meta={metaAttrs.join(',')}
        data-pagefind-filter={filterAttrs.length > 0 ? filterAttrs.join(',') : undefined}
      >
        <TocExamples />
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

  return nonRoot;
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
