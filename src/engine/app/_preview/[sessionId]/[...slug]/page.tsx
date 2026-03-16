import { createElement } from 'react';
import { notFound } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/notebook/page';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';
import { loadSessionConfigSource } from '@/lib/preview-config';
import {
  getApiConfig,
  getContextualOptions,
  getFooterSocials,
  getIconLibrary,
} from '@/lib/velu';
import { CopyPageButton } from '@/components/copy-page';
import { VeluImageZoomFallback } from '@/components/image-zoom-fallback';
import { VeluOpenAPI } from '@/components/openapi';
import { OpenApiTocSync } from '@/components/openapi-toc-sync';
import { TocExamples } from '@/components/toc-examples';
import { VeluIcon } from '@/components/icon';

interface PageProps {
  params: Promise<{ sessionId: string; slug: string[] }>;
}

/**
 * Parse raw frontmatter key-value pairs from markdown source.
 * This bypasses fumadocs' Zod schema stripping so we can access custom fields like `openapi`.
 */
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

interface ParsedOpenApiFrontmatter {
  spec: string;
  method: string;
  endpoint: string;
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
    return { spec: withInlineSpec[1], method, endpoint };
  }

  const withDefaultSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (withDefaultSpec && defaultSpec) {
    const method = withDefaultSpec[1].toUpperCase();
    const endpoint = withDefaultSpec[2].trim();
    if (method !== 'WEBHOOK' && !endpoint.startsWith('/')) return null;
    if (!endpoint) return null;
    return { spec: defaultSpec, method, endpoint };
  }

  return null;
}

function withTrailingSlashPath(path: string): string {
  if (!path.startsWith('/')) return path;
  if (path === '/' || path.endsWith('/')) return path;
  if (/\.[a-zA-Z0-9]+$/.test(path)) return path;
  return `${path}/`;
}

/**
 * Prefix absolute internal hrefs with the session ID so that
 * MDX content links like /core-api/quickstart become /mint-test/core-api/quickstart.
 */
function prefixHref(href: unknown, sessionPrefix: string): unknown {
  if (typeof href !== 'string') return href;
  if (!href.startsWith('/')) return href;
  if (href.startsWith(sessionPrefix + '/') || href === sessionPrefix) return href;
  return `${sessionPrefix}${href}`;
}

/**
 * Wrap MDX components so that all internal link hrefs include the session prefix.
 * Handles: <a> tags, <Card> hrefs, and any other element rendered with href.
 */
function prefixMdxComponentLinks(
  components: Record<string, any>,
  sessionPrefix: string,
): Record<string, any> {
  const patched = { ...components };

  // Wrap the <a> component
  const OriginalA = patched.a;
  if (OriginalA) {
    patched.a = (props: any) => {
      const href = prefixHref(props.href, sessionPrefix);
      return typeof OriginalA === 'function'
        ? OriginalA({ ...props, href })
        : createElement('a', { ...props, href });
    };
  }

  // Wrap the Card component
  const OriginalCard = patched.Card;
  if (OriginalCard) {
    patched.Card = (props: any) => {
      const href = prefixHref(props.href, sessionPrefix);
      return createElement(OriginalCard, { ...props, href });
    };
  }

  return patched;
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

  const configSource = loadSessionConfigSource(sessionId);
  const iconLibrary = configSource ? getIconLibrary(configSource) : 'fontawesome';
  const footerSocials = configSource ? getFooterSocials(configSource) : [];
  const apiConfig = getApiConfig(configSource ?? undefined);

  const effectiveMarkdown = typeof pageDataRecord.processedMarkdown === 'string'
    ? String(pageDataRecord.processedMarkdown)
    : undefined;
  const hasPanelExamples = typeof effectiveMarkdown === 'string'
    && /<(?:Panel|RequestExample|ResponseExample)(?:\s|>)/.test(effectiveMarkdown);

  // OpenAPI rendering — parse from raw markdown to bypass Zod schema stripping
  const frontmatter = parseFrontmatterMap(effectiveMarkdown);
  const frontmatterOpenapi = frontmatter.openapi ?? (typeof pageDataRecord.openapi === 'string' ? pageDataRecord.openapi : undefined);
  const parsedOpenApi = parseOpenApiFrontmatter(
    frontmatterOpenapi,
    apiConfig.defaultOpenApiSpec,
  );
  const hasExplicitApiRendering = typeof effectiveMarkdown === 'string'
    && /<(?:APIPlayground|ApiPlayground|OpenAPI)\b/.test(effectiveMarkdown);
  const shouldShowOpenApi = !hasExplicitApiRendering && Boolean(parsedOpenApi);
  const proxyUrl = apiConfig.playgroundProxyEnabled ? '/api/proxy' : '';
  const isDeprecatedPage = (pageDataRecord.deprecated === true)
    || String((pageDataRecord.status ?? '')).trim().toLowerCase() === 'deprecated';
  const pageToc = pageDataRecord.toc as any;
  const pageFull = typeof pageDataRecord.full === 'boolean' ? pageDataRecord.full : undefined;
  const hasApiTocRail = shouldShowOpenApi || hasPanelExamples;
  const tableOfContentHeader = hasApiTocRail
    ? <div className={shouldShowOpenApi ? 'velu-api-toc-rail' : 'velu-toc-panel-rail'}><div id="velu-api-toc-rail-host" /></div>
    : undefined;

  // Prev/next navigation
  const sessionPrefix = `/${sessionId}`;
  const allPages = source.getPages();
  const orderedSessionPages = allPages.filter((p) => p.url.startsWith(`${sessionPrefix}/`));
  const sourcePageUrl = (page as unknown as { url?: string }).url;
  const fallbackPath = `/${fullSlug.join('/')}`.replace(/\/{2,}/g, '/');
  const pageUrl = (typeof sourcePageUrl === 'string' && sourcePageUrl.trim())
    ? sourcePageUrl
    : (fallbackPath === '' ? '/' : fallbackPath);
  const currentIndex = orderedSessionPages.findIndex((entry) => entry.url === pageUrl);
  const previousPage = currentIndex > 0 ? orderedSessionPages[currentIndex - 1] : undefined;
  const nextPage = currentIndex >= 0 && currentIndex < orderedSessionPages.length - 1 ? orderedSessionPages[currentIndex + 1] : undefined;

  return (
    <DocsPage
      toc={pageToc}
      full={pageFull}
      tableOfContent={tableOfContentHeader ? { header: tableOfContentHeader } : undefined}
      footer={{ enabled: false }}
    >
      <TocExamples />
      <OpenApiTocSync enabled={hasApiTocRail} />
      <VeluImageZoomFallback />
      <div className="velu-title-row">
        <div className="velu-title-main">
          <DocsTitle>{page.data.title}</DocsTitle>
          {isDeprecatedPage ? <span className="velu-pill velu-pill-deprecated velu-page-deprecated-badge">Deprecated</span> : null}
        </div>
        <div className="velu-title-actions">
          <CopyPageButton options={getContextualOptions(configSource ?? undefined)} mcpUrl="" />
        </div>
      </div>
      {page.data.description ? (
        <DocsDescription>{page.data.description}</DocsDescription>
      ) : null}
      <DocsBody>
        {shouldShowOpenApi && parsedOpenApi ? (
          <VeluOpenAPI
            className="velu-api-playground"
            schemaSource={parsedOpenApi.spec}
            endpoint={parsedOpenApi.endpoint}
            method={parsedOpenApi.method}
            proxyUrl={proxyUrl}
            exampleLanguages={apiConfig.exampleLanguages}
            exampleAutogenerate={apiConfig.exampleAutogenerate}
            layout="playground"
            showTitle={false}
            showDescription={false}
          />
        ) : null}
        <MDX
          components={prefixMdxComponentLinks(
            getMDXComponents({
              a: createRelativeLink(source, page),
            }, configSource ?? undefined),
            sessionPrefix,
          )}
        />
      </DocsBody>
      <section className="velu-page-feedback-wrap" aria-label="Page navigation">
        {(previousPage || nextPage) ? (
          <div className={['velu-page-nav-grid', previousPage && nextPage ? 'velu-page-nav-grid-two' : 'velu-page-nav-grid-one'].join(' ')}>
            {previousPage ? (
              <a href={withTrailingSlashPath(previousPage.url)} className="velu-page-nav-card">
                <p className="velu-page-nav-title">{previousPage.data.title}</p>
                <p className="velu-page-nav-meta">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                  <span>{previousPage.data.description ?? 'Previous'}</span>
                </p>
              </a>
            ) : null}
            {nextPage ? (
              <a href={withTrailingSlashPath(nextPage.url)} className="velu-page-nav-card velu-page-nav-card-next">
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
      <footer className="velu-footer">
        {footerSocials.length > 0 ? (
          <div className="velu-footer-socials" aria-label="Social links">
            {footerSocials.map((social) => (
              <a
                key={`${social.key}:${social.href}`}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="velu-footer-social-link"
                aria-label={social.label}
                title={social.label}
              >
                <VeluIcon
                  name={social.icon}
                  iconType={social.iconType}
                  library="fontawesome"
                  className="velu-footer-social-icon"
                  fallback={false}
                />
              </a>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="velu-footer-powered">
          Powered by <a href="https://getvelu.com" target="_blank" rel="noopener noreferrer">Velu</a>
        </div>
      </footer>
    </DocsPage>
  );
}

