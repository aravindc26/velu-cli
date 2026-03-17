export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSessionPageTree } from '@/lib/preview-source';

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
  const tree = await getSessionPageTree(sessionId);
  const firstUrl = findFirstPageUrl(tree);

  if (firstUrl) {
    redirect(firstUrl.endsWith('/') ? firstUrl : `${firstUrl}/`);
  }

  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
      <p>No pages found for session <code>{sessionId}</code>.</p>
      <p>Initialize the session via <code>POST /api/sessions/{sessionId}/init</code></p>
    </div>
  );
}
