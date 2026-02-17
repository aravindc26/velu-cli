import { redirect } from 'next/navigation';
import { source } from '@/lib/source';

function resolveDefaultDocsHref(): string {
  const params = source.generateParams('slug') as Array<{ slug?: string[] }>;
  const first = params.find((entry) => Array.isArray(entry.slug) && entry.slug.length > 0);

  if (!first?.slug) return '/';
  return `/${first.slug.join('/')}`;
}

export default function HomePage() {
  redirect(resolveDefaultDocsHref());
}

