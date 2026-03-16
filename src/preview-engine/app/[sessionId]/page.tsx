import { redirect } from 'next/navigation';
import { source, getSessionPageTree } from '@/lib/source';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

function findFirstPageUrl(node: any): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'page' && !node.external && typeof node.url === 'string') {
    return node.url;
  }
  if (node.type === 'folder' && typeof node.index?.url === 'string') {
    return node.index.url;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    const url = findFirstPageUrl(child);
    if (url) return url;
  }
  return undefined;
}

export default async function SessionIndexPage({ params }: PageProps) {
  const { sessionId } = await params;
  const tree = getSessionPageTree(sessionId);
  const firstUrl = findFirstPageUrl(tree);

  if (firstUrl) {
    redirect(firstUrl.endsWith('/') ? firstUrl : `${firstUrl}/`);
  }

  // Fallback: redirect to session root
  redirect(`/${sessionId}/`);
}
