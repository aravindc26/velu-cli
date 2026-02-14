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
import { CopyPageButton } from '@/components/copy-page';

interface RouteParams {
  slug?: string[];
}

interface PageProps {
  params: Promise<RouteParams>;
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const page = source.getPage(resolvedParams.slug);

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
  const params = source.generateParams();
  // Include root path for the optional catch-all [[...slug]]
  return [{ slug: [] }, ...params];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const page = source.getPage(resolvedParams.slug);

  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
