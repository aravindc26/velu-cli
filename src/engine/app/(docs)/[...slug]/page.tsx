import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/notebook/page';
import { getMDXComponents } from '@/mdx-components';
import { source } from '@/lib/source';
import { VeluManualApiPlayground } from '@/components/manual-api-playground';
import { VeluOpenAPI, VeluOpenAPISchema } from '@/components/openapi';
import { getApiConfig, getLanguages, getVersionOptions, getProductOptions, getSeoConfig, getSiteName, getSiteOrigin } from '@/lib/velu';
import { CopyPageButton } from '@/components/copy-page';
import { ChangelogFilters } from '@/components/changelog-filters';
import { VeluImageZoomFallback } from '@/components/image-zoom-fallback';
import { OpenApiTocSync } from '@/components/openapi-toc-sync';
import { TocExamples } from '@/components/toc-examples';
import { PageFeedback } from '@/components/page-feedback';
import { parseChangelogFromMarkdown, parseFrontmatterBoolean } from '@/lib/changelog';

interface RouteParams {
  slug?: string[];
}

interface PageProps {
  params: Promise<RouteParams>;
}

type PlaygroundDisplayMode = 'interactive' | 'simple' | 'none' | 'auth';
type ApiAuthMethod = 'bearer' | 'basic' | 'key' | 'none';

interface ParsedApiFrontmatter {
  method: string;
  url: string;
  endpoint: string;
  servers?: Array<{ url: string }>;
}

interface ParsedOpenApiFrontmatter {
  spec: string;
  method: string;
  endpoint: string;
}

interface ParsedOpenApiSchemaFrontmatter {
  spec: string;
  schema: string;
}

interface InlineApiDoc {
  document: Record<string, unknown>;
  endpoint: string;
  method: string;
}

async function loadMarkdownForSlug(slug: string[], locale: string, hasI18n: boolean): Promise<string | undefined> {
  const rel = slug.join('/');
  const docsRoots = [
    join(process.cwd(), 'content', 'docs'),
    join(process.cwd(), '.velu-out', 'content', 'docs'),
  ];
  const roots = hasI18n
    ? docsRoots.flatMap((root) => [join(root, locale), root])
    : docsRoots;
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

function parseFrontmatterMap(markdown?: string): Record<string, string> {
  if (!markdown) return {};
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const output: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!entry) continue;
    const key = entry[1];
    const rawValue = entry[2].trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '').trim();
    output[key] = value;
  }

  return output;
}

function parseFrontmatterData(markdown?: string): Record<string, unknown> {
  if (!markdown) return {};
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  }
  return undefined;
}

function normalizeMetatagMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const tag = key.trim();
    if (!tag) continue;
    if (typeof raw === 'string') {
      const normalized = raw.trim();
      if (normalized) output[tag] = normalized;
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      output[tag] = String(raw);
    }
  }
  return output;
}

function parseRobotsDirectives(value: string | undefined): Metadata['robots'] | undefined {
  if (!value) return undefined;
  const tokens = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return undefined;

  const hasNoindex = tokens.includes('noindex') || tokens.includes('none');
  const hasIndex = tokens.includes('index') || tokens.includes('all');
  const hasNofollow = tokens.includes('nofollow') || tokens.includes('none');
  const hasFollow = tokens.includes('follow') || tokens.includes('all');

  if (!hasNoindex && !hasIndex && !hasNofollow && !hasFollow) return undefined;

  return {
    ...(hasNoindex ? { index: false } : hasIndex ? { index: true } : {}),
    ...(hasNofollow ? { follow: false } : hasFollow ? { follow: true } : {}),
  };
}

function normalizeImageList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeDocPath(value: string): string {
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  const collapsed = withLeading.replace(/\/{2,}/g, '/');
  if (collapsed !== '/' && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed;
}

function toAbsoluteMetaUrl(origin: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${origin}${normalizeDocPath(trimmed)}`;
}

function parseKeywords(frontmatterData: Record<string, unknown>, fromMetatags: string | undefined): string[] | undefined {
  if (fromMetatags) {
    const entries = fromMetatags.split(',').map((entry) => entry.trim()).filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }

  const raw = frontmatterData.keywords;
  if (typeof raw === 'string') {
    const entries = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }

  if (Array.isArray(raw)) {
    const entries = raw
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : undefined;
  }

  return undefined;
}

function buildGeneratedOgImagePath(pageUrl: string): string {
  const normalized = normalizeDocPath(pageUrl);
  if (normalized === '/') return '/og/index.svg';
  return `/og${normalized}.svg`;
}

function extractFrontmatterMetatags(frontmatterData: Record<string, unknown>): Record<string, string> {
  const allowedSimpleKeys = new Set([
    'title',
    'description',
    'canonical',
    'robots',
    'keywords',
    'author',
    'googlebot',
    'google',
    'google-site-verification',
    'generator',
    'theme-color',
    'color-scheme',
    'format-detection',
    'referrer',
    'refresh',
    'rating',
    'revisit-after',
    'language',
    'copyright',
    'reply-to',
    'distribution',
    'coverage',
    'category',
    'target',
    'HandheldFriendly',
    'MobileOptimized',
    'apple-mobile-web-app-capable',
    'apple-mobile-web-app-status-bar-style',
    'apple-mobile-web-app-title',
    'application-name',
    'msapplication-TileColor',
    'msapplication-TileImage',
    'msapplication-config',
    'viewport',
    'charset',
  ]);

  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(frontmatterData)) {
    if (key === 'metatags' || key === 'keywords' || key === 'noindex' || key === 'hidden') continue;
    if (!key.includes(':') && !allowedSimpleKeys.has(key)) continue;

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) output[key] = trimmed;
      continue;
    }

    if (typeof raw === 'number' || typeof raw === 'boolean') {
      output[key] = String(raw);
      continue;
    }

    if (Array.isArray(raw)) {
      const entries = raw
        .filter((entry): entry is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof entry))
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      if (entries.length > 0) output[key] = entries.join(', ');
    }
  }

  return output;
}

function resolveCanonicalUrl(siteOrigin: string, pageUrl: string, canonicalMeta?: string): string {
  const normalizedPagePath = normalizeDocPath(pageUrl);
  if (!canonicalMeta) return `${siteOrigin}${normalizedPagePath}`;

  const raw = canonicalMeta.trim();
  if (!raw) return `${siteOrigin}${normalizedPagePath}`;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const hasOnlyOriginPath = parsed.pathname === '/' && !parsed.search && !parsed.hash;
      if (hasOnlyOriginPath) return `${parsed.origin}${normalizedPagePath}`;
      return parsed.toString();
    } catch {
      return `${siteOrigin}${normalizedPagePath}`;
    }
  }

  return toAbsoluteMetaUrl(siteOrigin, raw);
}

function normalizePlaygroundDisplay(value: string | undefined, fallback: PlaygroundDisplayMode): PlaygroundDisplayMode {
  if (value === 'interactive' || value === 'simple' || value === 'none') return value;
  if (value === 'auth') return 'none';
  if (value === 'show') return 'interactive';
  if (value === 'hide') return 'none';
  return fallback === 'auth' ? 'none' : fallback;
}

function normalizeAuthMethod(value: string | undefined, fallback: ApiAuthMethod): ApiAuthMethod {
  if (value === 'bearer' || value === 'basic' || value === 'key' || value === 'none') return value;
  return fallback;
}

function normalizeServerList(servers: string[] | undefined): string[] {
  if (!servers || servers.length === 0) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawServer of servers) {
    const trimmed = String(rawServer ?? '').trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      const normalizedServer = parsed.toString().replace(/\/+$/, '');
      if (seen.has(normalizedServer)) continue;
      seen.add(normalizedServer);
      normalized.push(normalizedServer);
    } catch {
      // ignore invalid server URLs from config
    }
  }
  return normalized;
}

function resolveAbsoluteUrl(server: string, endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const parsed = new URL(server);
  const basePath = parsed.pathname.replace(/\/+$/, '');
  const endpointPath = normalizedEndpoint.replace(/^\/+/, '');
  const path = `${basePath}/${endpointPath}`.replace(/\/{2,}/g, '/');
  return `${parsed.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function parseApiFrontmatter(rawValue: string | undefined, serverUrls?: string[]): ParsedApiFrontmatter | null {
  if (!rawValue) return null;
  const match = rawValue.match(/^([A-Za-z]+)\s+(.+)$/);
  if (!match) return null;

  const method = match[1].toUpperCase();
  const target = match[2].trim();
  if (!target) return null;

  const configuredServers = normalizeServerList(serverUrls);

  if (/^https?:\/\//i.test(target)) {
    try {
      const parsedUrl = new URL(target);
      const endpoint = parsedUrl.pathname || '/';
      return {
        method,
        url: target,
        endpoint,
        servers: [{ url: `${parsedUrl.protocol}//${parsedUrl.host}` }],
      };
    } catch {
      // Fall back to raw URL handling below.
    }

    const endpoint = target.startsWith('/') ? target : `/${target.replace(/^\/+/, '')}`;
    return { method, url: target, endpoint };
  }

  const endpoint = target.startsWith('/') ? target : `/${target.replace(/^\/+/, '')}`;
  if (configuredServers.length > 0) {
    const url = resolveAbsoluteUrl(configuredServers[0], endpoint);
    return {
      method,
      url,
      endpoint,
      servers: configuredServers.map((server) => ({ url: server })),
    };
  }

  return { method, url: endpoint, endpoint };
}

function parseOpenApiFrontmatter(rawValue: string | undefined, defaultSpec?: string): ParsedOpenApiFrontmatter | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const withInlineSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withInlineSpec) {
    const method = withInlineSpec[2].toUpperCase();
    const endpoint = withInlineSpec[3].trim();
    if (method !== 'WEBHOOK' && !endpoint.startsWith('/')) return null;
    if (!endpoint) return null;
    return {
      spec: withInlineSpec[1],
      method,
      endpoint,
    };
  }

  const withDefaultSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (withDefaultSpec && defaultSpec) {
    const method = withDefaultSpec[1].toUpperCase();
    const endpoint = withDefaultSpec[2].trim();
    if (method !== 'WEBHOOK' && !endpoint.startsWith('/')) return null;
    if (!endpoint) return null;
    return {
      spec: defaultSpec,
      method,
      endpoint,
    };
  }

  return null;
}

function parseOpenApiSchemaFrontmatter(rawValue: string | undefined, defaultSpec?: string): ParsedOpenApiSchemaFrontmatter | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const withInlineSpec = trimmed.match(/^(\S+)\s+(.+)$/);
  if (withInlineSpec) {
    const schema = withInlineSpec[2].trim();
    if (!schema) return null;
    return {
      spec: withInlineSpec[1],
      schema,
    };
  }

  if (!defaultSpec) return null;
  return {
    spec: defaultSpec,
    schema: trimmed,
  };
}

function buildInlineApiDoc(
  parsed: ParsedApiFrontmatter,
  pageTitle: string,
  pageDescription: string | undefined,
  authMethod: ApiAuthMethod,
  authName: string | undefined,
): InlineApiDoc {
  const method = parsed.method.toUpperCase();
  let endpointPath = parsed.endpoint.trim();
  if (!endpointPath.startsWith('/')) endpointPath = `/${endpointPath.replace(/^\/+/, '')}`;

  const lowerMethod = method.toLowerCase();
  const operation: Record<string, unknown> = {
    summary: pageTitle,
    description: pageDescription,
    responses: {
      200: {
        description: 'Successful response',
      },
    },
  };

  const securitySchemes: Record<string, unknown> = {};
  if (authMethod === 'bearer') {
    securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer' };
    operation.security = [{ bearerAuth: [] }];
  }
  if (authMethod === 'basic') {
    securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
    operation.security = [{ basicAuth: [] }];
  }
  if (authMethod === 'key') {
    securitySchemes.apiKeyAuth = { type: 'apiKey', in: 'header', name: authName || 'x-api-key' };
    operation.security = [{ apiKeyAuth: [] }];
  }

  const document: Record<string, unknown> = {
    openapi: '3.1.0',
    info: {
      title: pageTitle || 'API',
      version: '1.0.0',
      ...(pageDescription ? { description: pageDescription } : {}),
    },
    paths: {
      [endpointPath]: {
        [lowerMethod]: operation,
      },
    },
  };

  if (Array.isArray(parsed.servers) && parsed.servers.length > 0) {
    document.servers = parsed.servers;
  }

  if (Object.keys(securitySchemes).length > 0) {
    document.components = { securitySchemes };
  }

  return {
    document,
    endpoint: endpointPath,
    method,
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
  const pageDataRecord = (page.data as unknown) as Record<string, unknown>;
  const dataMarkdown = typeof pageDataRecord.processedMarkdown === 'string'
    ? String(pageDataRecord.processedMarkdown)
    : undefined;
  const effectiveMarkdown = sourceMarkdown ?? dataMarkdown;
  const frontmatter = parseFrontmatterMap(effectiveMarkdown);
  const apiConfig = getApiConfig();
  const hasExplicitApiRendering = typeof effectiveMarkdown === 'string'
    && (/<(?:APIPlayground|ApiPlayground|OpenAPI)\b/.test(effectiveMarkdown)
      || /@scalar\/api-reference|id=['"]api-reference['"]|createApiReference/.test(effectiveMarkdown));
  const configuredMdxServers = (apiConfig.mdxServers && apiConfig.mdxServers.length > 0)
    ? apiConfig.mdxServers
    : [
      ...(apiConfig.mdxServer ? [apiConfig.mdxServer] : []),
      ...(apiConfig.baseUrl ? [apiConfig.baseUrl] : []),
    ];
  const parsedApiFrontmatter = parseApiFrontmatter(
    frontmatter.api ?? (typeof pageDataRecord.api === 'string' ? pageDataRecord.api : undefined),
    configuredMdxServers,
  );
  const parsedOpenApiFrontmatter = parseOpenApiFrontmatter(
    frontmatter.openapi ?? (typeof pageDataRecord.openapi === 'string' ? pageDataRecord.openapi : undefined),
    apiConfig.defaultOpenApiSpec,
  );
  const parsedOpenApiSchemaFrontmatter = parseOpenApiSchemaFrontmatter(
    frontmatter['openapi-schema'] ?? (typeof pageDataRecord['openapi-schema'] === 'string' ? pageDataRecord['openapi-schema'] : undefined),
    apiConfig.defaultOpenApiSpec,
  );
  const playgroundDisplay = normalizePlaygroundDisplay(frontmatter.playground, apiConfig.playgroundDisplay);
  const proxyUrl = apiConfig.playgroundProxyEnabled ? '/api/proxy' : '';
  const authMethod = normalizeAuthMethod(frontmatter.authMethod, apiConfig.authMethod);
  const inlineApiDoc = parsedApiFrontmatter
    ? buildInlineApiDoc(parsedApiFrontmatter, page.data.title, page.data.description, authMethod, apiConfig.authName)
    : null;
  const hasPanelExamples = typeof effectiveMarkdown === 'string'
    && /<(?:Panel|RequestExample|ResponseExample)(?:\s|>)/.test(effectiveMarkdown);
  const parsedChangelog = parseChangelogFromMarkdown(effectiveMarkdown);
  const hasChangelog = parsedChangelog.updates.length > 0;
  const hasChangelogTags = parsedChangelog.tags.length > 0;
  const isDeprecatedPage = parseFrontmatterBoolean(effectiveMarkdown, 'deprecated')
    || frontmatter.status?.trim().toLowerCase() === 'deprecated'
    || (pageDataRecord.deprecated === true)
    || String((pageDataRecord.status ?? '')).trim().toLowerCase() === 'deprecated';
  const showRssButton = hasChangelog && parseFrontmatterBoolean(effectiveMarkdown, 'rss');
  const sourcePageUrl = (page as unknown as { url?: string }).url;
  const fallbackPath = `/${(resolvedParams.slug ?? []).join('/')}`.replace(/\/{2,}/g, '/');
  const pageUrl = (typeof sourcePageUrl === 'string' && sourcePageUrl.trim())
    ? sourcePageUrl
    : (fallbackPath === '' ? '/' : fallbackPath);
  const rssHref = `${pageUrl.replace(/\/$/, '') || ''}/rss.xml`;
  const shouldReplaceTocWithApiExample = !hasExplicitApiRendering && Boolean(inlineApiDoc) && playgroundDisplay === 'interactive';
  const shouldShowOpenApiExampleInToc = !hasExplicitApiRendering && !parsedApiFrontmatter && Boolean(parsedOpenApiFrontmatter);
  const hasApiTocRail = shouldReplaceTocWithApiExample || shouldShowOpenApiExampleInToc;
  const apiTocHeader = hasApiTocRail ? (
    <div className="velu-api-toc-rail">
      <div id="velu-api-toc-rail-host" />
    </div>
  ) : undefined;
  const toc = hasChangelog ? parsedChangelog.toc : page.data.toc;
  const tableOfContentHeader = apiTocHeader ?? (hasPanelExamples ? <div className="velu-toc-panel-rail" /> : undefined);
  const orderedPages = hasI18n ? source.getPages(locale) : source.getPages();
  const currentPageUrl = (typeof sourcePageUrl === 'string' && sourcePageUrl.trim())
    ? sourcePageUrl
    : pageUrl;
  const currentIndex = orderedPages.findIndex((entry) => entry.url === currentPageUrl);
  const previousPage = currentIndex > 0 ? orderedPages[currentIndex - 1] : undefined;
  const nextPage = currentIndex >= 0 && currentIndex < orderedPages.length - 1 ? orderedPages[currentIndex + 1] : undefined;

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
      toc={toc}
      full={hasChangelog ? false : (hasApiTocRail ? false : page.data.full)}
      tableOfContent={tableOfContentHeader ? { header: tableOfContentHeader } : undefined}
      footer={{ enabled: false }}
    >
      <div
        data-pagefind-body
        data-pagefind-meta={metaAttrs.join(',')}
        data-pagefind-filter={filterAttrs.length > 0 ? filterAttrs.join(',') : undefined}
      >
        <TocExamples />
        <OpenApiTocSync enabled={hasApiTocRail} />
        {hasChangelogTags ? <ChangelogFilters tags={parsedChangelog.tags} /> : null}
        <VeluImageZoomFallback />
        <div className="velu-title-row">
          <div className="velu-title-main">
            <DocsTitle>{page.data.title}</DocsTitle>
            {isDeprecatedPage ? <span className="velu-pill velu-pill-deprecated velu-page-deprecated-badge">Deprecated</span> : null}
          </div>
          <div className="velu-title-actions">
            <CopyPageButton />
            {showRssButton ? (
              <a className="velu-rss-button" href={rssHref} aria-label="Subscribe to this changelog RSS feed">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1.5" />
                </svg>
              </a>
            ) : null}
          </div>
        </div>
        {page.data.description ? <DocsDescription>{page.data.description}</DocsDescription> : null}
        <DocsBody>
          {!hasExplicitApiRendering && inlineApiDoc && playgroundDisplay === 'interactive' ? (
            <VeluOpenAPI
              className="velu-api-playground"
              inlineDocument={inlineApiDoc.document}
              inlineDocumentId={`velu-inline-${pageUrl.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'api'}`}
              endpoint={inlineApiDoc.endpoint}
              method={inlineApiDoc.method}
              proxyUrl={proxyUrl}
              exampleLanguages={apiConfig.exampleLanguages}
              exampleAutogenerate={apiConfig.exampleAutogenerate}
              layout="playground"
              showTitle={false}
              showDescription={false}
            />
          ) : null}
          {!hasExplicitApiRendering && parsedApiFrontmatter && playgroundDisplay === 'simple' ? (
            <VeluManualApiPlayground
              method={parsedApiFrontmatter.method}
              url={parsedApiFrontmatter.url}
              display="simple"
            />
          ) : null}
          {!hasExplicitApiRendering && !parsedApiFrontmatter && parsedOpenApiFrontmatter ? (
            <VeluOpenAPI
              className="velu-api-playground"
              schemaSource={parsedOpenApiFrontmatter.spec}
              endpoint={parsedOpenApiFrontmatter.endpoint}
              method={parsedOpenApiFrontmatter.method}
              proxyUrl={proxyUrl}
              exampleLanguages={apiConfig.exampleLanguages}
              exampleAutogenerate={apiConfig.exampleAutogenerate}
              layout="playground"
              showTitle={false}
              showDescription={false}
            />
          ) : null}
          {!hasExplicitApiRendering && !parsedApiFrontmatter && !parsedOpenApiFrontmatter && parsedOpenApiSchemaFrontmatter ? (
            <VeluOpenAPISchema
              className="velu-openapi-schema-wrapper"
              schemaSource={parsedOpenApiSchemaFrontmatter.spec}
              schema={parsedOpenApiSchemaFrontmatter.schema}
            />
          ) : null}
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
        <section className="velu-page-feedback-wrap" aria-label="Page feedback">
          <PageFeedback />
          {(previousPage || nextPage) ? (
            <div className={['velu-page-nav-grid', previousPage && nextPage ? 'velu-page-nav-grid-two' : 'velu-page-nav-grid-one'].join(' ')}>
              {previousPage ? (
                <a href={previousPage.url} className="velu-page-nav-card">
                  <p className="velu-page-nav-title">{previousPage.data.title}</p>
                  <p className="velu-page-nav-meta">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                    <span>{previousPage.data.description ?? 'Previous'}</span>
                  </p>
                </a>
              ) : null}
              {nextPage ? (
                <a href={nextPage.url} className="velu-page-nav-card velu-page-nav-card-next">
                  <p className="velu-page-nav-title">{nextPage.data.title}</p>
                  <p className="velu-page-nav-meta velu-page-nav-meta-next">
                    <span>{nextPage.data.description ?? 'Next'}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                  </p>
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
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
  const seo = getSeoConfig();
  const siteName = getSiteName();
  const siteOrigin = getSiteOrigin();

  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) notFound();

  const sourceMarkdown = await loadMarkdownForSlug(pageSlug, locale, hasI18n);
  const pageDataRecord = (page.data as unknown) as Record<string, unknown>;
  const dataMarkdown = typeof pageDataRecord.processedMarkdown === 'string'
    ? String(pageDataRecord.processedMarkdown)
    : undefined;
  const effectiveMarkdown = sourceMarkdown ?? dataMarkdown;
  const frontmatterData = parseFrontmatterData(effectiveMarkdown);
  const pageTopLevelMetatags = extractFrontmatterMetatags(frontmatterData);
  const pageNestedMetatags = normalizeMetatagMap(frontmatterData.metatags);
  const mergedMetatags: Record<string, string> = {
    ...seo.metatags,
    ...pageTopLevelMetatags,
    ...pageNestedMetatags,
  };
  const sourcePageUrl = (page as unknown as { url?: string }).url;
  const fallbackPath = `/${(resolvedParams.slug ?? []).join('/')}`.replace(/\/{2,}/g, '/');
  const pageUrl = (typeof sourcePageUrl === 'string' && sourcePageUrl.trim())
    ? sourcePageUrl
    : (fallbackPath === '' ? '/' : fallbackPath);

  const canonical = resolveCanonicalUrl(siteOrigin, pageUrl, mergedMetatags.canonical);
  const keywords = parseKeywords(frontmatterData, mergedMetatags.keywords);
  const robotsFromMetatag = parseRobotsDirectives(mergedMetatags.robots);
  const noindex = normalizeBoolean(frontmatterData.noindex) === true
    || normalizeBoolean(frontmatterData.hidden) === true
    || parseFrontmatterBoolean(effectiveMarkdown, 'noindex')
    || parseFrontmatterBoolean(effectiveMarkdown, 'hidden')
    || (mergedMetatags.robots ?? '').toLowerCase().includes('noindex')
    || (mergedMetatags.robots ?? '').toLowerCase().includes('none');
  const titleOverride = mergedMetatags.title?.trim();
  const resolvedTitle = titleOverride || `${page.data.title} - ${siteName}`;
  const resolvedDescription = (mergedMetatags.description?.trim() || page.data.description || '').trim() || undefined;
  const generatedSocialImage = buildGeneratedOgImagePath(pageUrl);
  const fallbackImage = mergedMetatags['og:image']
    || mergedMetatags['twitter:image']
    || generatedSocialImage;
  const openGraphImagesRaw = normalizeImageList(mergedMetatags['og:image'] ?? fallbackImage);
  const twitterImagesRaw = normalizeImageList(mergedMetatags['twitter:image'] ?? fallbackImage);
  const ogImageWidth = mergedMetatags['og:image:width'] || '1200';
  const ogImageHeight = mergedMetatags['og:image:height'] || '630';
  const twitterImageWidth = mergedMetatags['twitter:image:width'] || '1200';
  const twitterImageHeight = mergedMetatags['twitter:image:height'] || '630';
  const openGraphImages = openGraphImagesRaw.map((entry) => ({
    url: toAbsoluteMetaUrl(siteOrigin, entry),
    width: Number(ogImageWidth),
    height: Number(ogImageHeight),
  }));
  const twitterImages = twitterImagesRaw.map((entry) => toAbsoluteMetaUrl(siteOrigin, entry));
  const openGraph: NonNullable<Metadata['openGraph']> = {
    type: (mergedMetatags['og:type'] as NonNullable<Metadata['openGraph']>['type']) || 'website',
    siteName: mergedMetatags['og:site_name'] || siteName,
    title: mergedMetatags['og:title'] || resolvedTitle,
    ...(resolvedDescription ? { description: mergedMetatags['og:description'] || resolvedDescription } : {}),
    url: mergedMetatags['og:url'] ? toAbsoluteMetaUrl(siteOrigin, mergedMetatags['og:url']) : canonical,
    ...(mergedMetatags['og:locale'] ? { locale: mergedMetatags['og:locale'] } : {}),
    ...(openGraphImages.length > 0 ? { images: openGraphImages as NonNullable<Metadata['openGraph']>['images'] } : {}),
  };
  const twitter: NonNullable<Metadata['twitter']> = {
    card: (mergedMetatags['twitter:card'] as NonNullable<Metadata['twitter']>['card']) || 'summary_large_image',
    title: mergedMetatags['twitter:title'] || resolvedTitle,
    ...(resolvedDescription ? { description: mergedMetatags['twitter:description'] || resolvedDescription } : {}),
    ...(mergedMetatags['twitter:site'] ? { site: mergedMetatags['twitter:site'] } : {}),
    ...(mergedMetatags['twitter:creator'] ? { creator: mergedMetatags['twitter:creator'] } : {}),
    ...(twitterImages.length > 0 ? { images: twitterImages } : {}),
  };

  const handledTags = new Set([
    'canonical',
    'keywords',
    'robots',
    'application-name',
    'apple-mobile-web-app-title',
    'apple-mobile-web-app-capable',
    'apple-mobile-web-app-status-bar-style',
    'msapplication-TileColor',
    'og:title',
    'og:description',
    'og:url',
    'og:site_name',
    'og:type',
    'og:locale',
    'og:image',
    'twitter:card',
    'twitter:title',
      'twitter:description',
      'twitter:site',
      'twitter:creator',
      'twitter:image',
      'og:image:width',
      'og:image:height',
      'twitter:image:width',
      'twitter:image:height',
      'title',
      'description',
      'generator',
    ]);
  const otherMetatags = Object.fromEntries(
    Object.entries(mergedMetatags).filter(([key]) => !handledTags.has(key)),
  );
  if (openGraphImages.length > 0) {
    otherMetatags['og:image:width'] = ogImageWidth;
    otherMetatags['og:image:height'] = ogImageHeight;
  }
  if (twitterImages.length > 0) {
    otherMetatags['twitter:image:width'] = twitterImageWidth;
    otherMetatags['twitter:image:height'] = twitterImageHeight;
  }
  if (noindex) {
    otherMetatags.noindex = 'true';
  }

  return {
    ...(titleOverride ? { title: { absolute: titleOverride } } : { title: page.data.title }),
    ...(resolvedDescription ? { description: resolvedDescription } : {}),
    ...(keywords && keywords.length > 0 ? { keywords } : {}),
    alternates: { canonical },
    openGraph,
    twitter,
    ...(mergedMetatags.generator ? { generator: mergedMetatags.generator } : {}),
    ...(noindex
      ? { robots: { index: false, follow: false } }
      : robotsFromMetatag
        ? { robots: robotsFromMetatag }
        : { robots: { index: true, follow: true } }),
    ...(Object.keys(otherMetatags).length > 0 ? { other: otherMetatags } : {}),
  };
}
