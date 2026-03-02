import { redirect } from 'next/navigation';
import { source } from '@/lib/source';
import { getLanguages } from '@/lib/velu';

interface PageTreeNode {
  type?: string;
  url?: string;
  external?: boolean;
  index?: { url?: string };
  children?: unknown[];
}

function findFirstPageUrl(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const entry = node as PageTreeNode;

  if (entry.type === 'page' && !entry.external && typeof entry.url === 'string' && entry.url.length > 0) {
    return entry.url;
  }

  if (entry.type === 'folder') {
    if (typeof entry.index?.url === 'string' && entry.index.url.length > 0) {
      return entry.index.url;
    }
  }

  const children = Array.isArray(entry.children) ? entry.children : [];
  for (const child of children) {
    const nested = findFirstPageUrl(child);
    if (nested) return nested;
  }

  return undefined;
}

function resolveDefaultDocsHref(): string {
  const defaultLanguage = getLanguages()[0] ?? 'en';
  const tree = source.getPageTree(defaultLanguage);
  const first = findFirstPageUrl(tree);
  if (!first || first === '/') return '/';
  if (!first.startsWith('/')) return first;
  if (first.endsWith('/')) return first;
  return `${first}/`;
}

export default function HomePage() {
  redirect(resolveDefaultDocsHref());
}
