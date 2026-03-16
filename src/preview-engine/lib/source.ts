import { loader } from 'fumadocs-core/source';
import * as mdxCollections from 'fumadocs-mdx:collections/server';

const docsCollection = (mdxCollections as { docs?: { toFumadocsSource?: () => unknown } }).docs;

if (!docsCollection?.toFumadocsSource) {
  throw new Error('MDX collections are not ready yet. Please retry in a moment.');
}

export const source = loader({
  baseUrl: '/',
  source: docsCollection.toFumadocsSource() as any,
});

/**
 * Get the page tree filtered to a specific session's content.
 * The content directory has files at {sessionId}/{slug}.mdx,
 * so the page tree has top-level folders per session.
 */
export function getSessionPageTree(sessionId: string) {
  const fullTree = source.getPageTree();
  const children = Array.isArray(fullTree.children) ? fullTree.children : [];

  // Find the root folder matching this session ID
  const sessionFolder = children.find((child: any) => {
    if (child?.type !== 'folder') return false;
    // The folder's URL or name should match the session ID
    const urls = collectUrls(child);
    for (const url of urls) {
      const firstSegment = url.replace(/^\/+/, '').split('/')[0];
      if (firstSegment === sessionId) return true;
    }
    return false;
  }) as any;

  if (sessionFolder && Array.isArray(sessionFolder.children)) {
    return { ...fullTree, children: sessionFolder.children };
  }

  // Fallback: filter children by URL prefix
  const filtered = children.filter((child: any) => {
    const urls = collectUrls(child);
    return urls.some((url: string) => {
      const segments = url.replace(/^\/+/, '').split('/');
      return segments[0] === sessionId;
    });
  });

  return { ...fullTree, children: filtered };
}

function collectUrls(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.url === 'string') out.push(node.url);
  if (node.index && typeof node.index.url === 'string') out.push(node.index.url);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectUrls(child, out);
  }
  return out;
}
