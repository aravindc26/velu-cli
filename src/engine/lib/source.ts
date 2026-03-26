import { loader } from 'fumadocs-core/source';
import * as mdxCollections from 'fumadocs-mdx:collections/server';
import { getLanguages } from '@/lib/velu';
import { openApiSidebarMethodBadgePlugin, createStatusBadgesPlugin } from '../engine-core/lib/source-plugins';

const languages = getLanguages();
const defaultLanguage = languages[0] ?? 'en';
const docsCollection = (mdxCollections as { docs?: { toFumadocsSource?: () => unknown } }).docs;

if (!docsCollection?.toFumadocsSource) {
  throw new Error('MDX collections are not ready yet. Please retry in a moment.');
}

export const source = loader({
  baseUrl: '/',
  source: docsCollection.toFumadocsSource() as any,
  plugins: [
    openApiSidebarMethodBadgePlugin() as any,
    createStatusBadgesPlugin(),
  ],
  i18n:
    languages.length > 1
      ? {
          languages,
          defaultLanguage,
          hideLocale: 'default-locale',
          parser: 'dir',
          fallbackLanguage: defaultLanguage,
        }
      : undefined,
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
    const urls = collectUrls(child);
    for (const url of urls) {
      const firstSegment = url.replace(/^\/+/, '').split('/')[0];
      if (firstSegment === sessionId) return true;
    }
    return false;
  }) as any;

  if (sessionFolder && Array.isArray(sessionFolder.children)) {
    // Mark first-level folders as root (fumadocs sets root:true on top-level folders,
    // but after extracting session children they lose that flag)
    const children = sessionFolder.children.map((child: any) => {
      if (child?.type === 'folder') return { ...child, root: true };
      return child;
    });
    return stripUrlPrefix({ ...fullTree, children }, sessionId);
  }

  // Fallback: filter children by URL prefix
  const filtered = children.filter((child: any) => {
    const urls = collectUrls(child);
    return urls.some((url: string) => {
      const segments = url.replace(/^\/+/, '').split('/');
      return segments[0] === sessionId;
    });
  });

  return stripUrlPrefix({ ...fullTree, children: filtered }, sessionId);
}

/**
 * Recursively strip the session prefix from all URLs in the tree
 * so that /mint-test/platform/... becomes /platform/...
 */
function stripUrlPrefix(tree: any, sessionId: string): any {
  const prefix = `/${sessionId}`;
  function stripUrl(url: string): string {
    if (url === prefix || url === `${prefix}/`) return '/';
    if (url.startsWith(`${prefix}/`)) return url.slice(prefix.length);
    return url;
  }
  function walk(node: any): any {
    if (!node || typeof node !== 'object') return node;
    const copy = { ...node };
    if (typeof copy.url === 'string') copy.url = stripUrl(copy.url);
    if (copy.index && typeof copy.index.url === 'string') {
      copy.index = { ...copy.index, url: stripUrl(copy.index.url) };
    }
    if (Array.isArray(copy.children)) {
      copy.children = copy.children.map(walk);
    }
    return copy;
  }
  return walk(tree);
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
