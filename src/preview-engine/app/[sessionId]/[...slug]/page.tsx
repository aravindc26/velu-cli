import { notFound } from 'next/navigation';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/notebook/page';
import { source } from '@/lib/source';

interface PageProps {
  params: Promise<{ sessionId: string; slug: string[] }>;
}

export default async function PreviewPage({ params }: PageProps) {
  const { sessionId, slug } = await params;

  // The full slug for fumadocs lookup includes the session ID prefix
  const fullSlug = [sessionId, ...slug];
  const page = source.getPage(fullSlug);

  if (!page) notFound();

  const pageDataRecord = page.data as unknown as Record<string, unknown>;
  const MDX = pageDataRecord.body as any;
  if (typeof MDX !== 'function') notFound();

  return (
    <DocsPage
      toc={pageDataRecord.toc as any}
      footer={{ enabled: false }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description ? (
        <DocsDescription>{page.data.description}</DocsDescription>
      ) : null}
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}
