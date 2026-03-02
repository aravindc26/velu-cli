import { loader } from 'fumadocs-core/source';
import { statusBadgesPlugin } from 'fumadocs-core/source/status-badges';
import * as mdxCollections from 'fumadocs-mdx:collections/server';
import { createElement } from 'react';
import { getLanguages } from '@/lib/velu';

const languages = getLanguages();
const defaultLanguage = languages[0] ?? 'en';
const OPENAPI_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'WEBHOOK']);
const docsCollection = (mdxCollections as { docs?: { toFumadocsSource?: () => unknown } }).docs;

if (!docsCollection?.toFumadocsSource) {
  throw new Error('MDX collections are not ready yet. Please retry in a moment.');
}

function methodBadgeClass(method: string): string {
  const upper = method.toUpperCase();
  if (upper === 'POST') return 'velu-openapi-method-badge velu-openapi-method-post';
  if (upper === 'PUT') return 'velu-openapi-method-badge velu-openapi-method-put';
  if (upper === 'PATCH') return 'velu-openapi-method-badge velu-openapi-method-patch';
  if (upper === 'DELETE') return 'velu-openapi-method-badge velu-openapi-method-delete';
  if (upper === 'WEBHOOK') return 'velu-openapi-method-badge velu-openapi-method-webhook';
  return 'velu-openapi-method-badge velu-openapi-method-get';
}

function parseOperationReference(value: string, requireUppercaseMethod = false): { method: string; target: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withSpec) {
    const rawMethod = withSpec[2];
    const method = withSpec[2].toUpperCase();
    if (requireUppercaseMethod && rawMethod !== method) return null;
    if (!OPENAPI_METHODS.has(method)) return null;
    return { method, target: withSpec[3].trim() };
  }
  const noSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (noSpec) {
    const rawMethod = noSpec[1];
    const method = noSpec[1].toUpperCase();
    if (requireUppercaseMethod && rawMethod !== method) return null;
    if (!OPENAPI_METHODS.has(method)) return null;
    return { method, target: noSpec[2].trim() };
  }
  return null;
}

function stripMethodPrefix(name: string, method: string): string {
  const regex = new RegExp(`^${method}\\s+`, 'i');
  return name.replace(regex, '').trim();
}

function openApiSidebarMethodBadgePlugin() {
  return {
    name: 'velu:openapi-sidebar-method-badge',
    transformPageTree: {
      file(node: Record<string, unknown>, filePath?: string) {
        let data: Record<string, unknown> = {};
        if (filePath) {
          const file = (this as { storage?: { read?: (path: string) => unknown } }).storage?.read?.(filePath) as
            | { format?: string; data?: Record<string, unknown> }
            | undefined;
          if (file?.format === 'page') data = file.data ?? {};
        }

        const nameCandidate = typeof node.name === 'string' ? node.name.trim() : '';
        const titleCandidate = typeof data.title === 'string' ? data.title.trim() : '';
        const openApiCandidate = typeof data.openapi === 'string' ? data.openapi.trim() : '';
        const parsed = openApiCandidate
          ? parseOperationReference(openApiCandidate)
          : parseOperationReference(nameCandidate, true) ?? parseOperationReference(titleCandidate, true);
        if (!parsed) return node;

        const method = parsed.method;
        const rawName = nameCandidate || titleCandidate || parsed.target;
        const text = stripMethodPrefix(rawName, method) || parsed.target || rawName || method;
        const stableIdRaw = filePath || openApiCandidate || rawName || `${method}-${parsed.target}`;
        const stableId = stableIdRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        node.name = createElement(
          'span',
          { className: 'velu-openapi-sidebar-item', key: `openapi-item-${stableId || 'unknown'}` },
          createElement(
            'span',
            { className: methodBadgeClass(method), key: `openapi-item-${stableId || 'unknown'}-method` },
            method,
          ),
          createElement(
            'span',
            { className: 'velu-openapi-sidebar-label', key: `openapi-item-${stableId || 'unknown'}-label` },
            text,
          ),
        );
        return node;
      },
    },
  };
}

export const source = loader({
  baseUrl: '/',
  source: docsCollection.toFumadocsSource() as any,
  plugins: [
    openApiSidebarMethodBadgePlugin() as any,
    statusBadgesPlugin({
      renderBadge: (status: string) => {
        const normalized = status.trim().toLowerCase();
        const label = normalized === 'deprecated' ? 'Deprecated' : status;
        const className = normalized === 'deprecated'
          ? 'velu-status-badge velu-status-badge-deprecated'
          : 'velu-status-badge';
        return createElement('span', { className, 'data-status': normalized }, label);
      },
    }),
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
