import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { source } from '@/lib/source';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getApiConfig, getLanguages } from '@/lib/velu';

interface RouteParams {
  slug?: string[];
}

interface ParsedOpenApiFrontmatter {
  spec?: string;
  method: string;
  endpoint: string;
  kind: 'path' | 'webhook';
}

const OPENAPI_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

export const dynamic = 'force-static';

export async function generateStaticParams() {
  const generated = source.generateParams('slug') as Array<{ slug?: string[] }>;
  const seen = new Set<string>();
  const out: Array<{ slug: string[] }> = [];

  for (const entry of generated) {
    const slug = entry.slug ?? [];
    if (slug.length === 0) continue;
    const mdSlug = [...slug];
    mdSlug[mdSlug.length - 1] = `${mdSlug[mdSlug.length - 1]}.md`;
    const key = mdSlug.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ slug: mdSlug });
  }

  return out;
}

function resolveLocaleSlug(slugInput: string[] | undefined) {
  const languages = getLanguages();
  const defaultLanguage = languages[0] ?? 'en';
  const slug = slugInput ?? [];
  const firstSeg = slug[0];
  const hasLocalePrefix = languages.includes(firstSeg ?? '');

  return {
    locale: hasLocalePrefix ? firstSeg! : defaultLanguage,
    pageSlug: hasLocalePrefix ? slug.slice(1) : slug,
  };
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

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function parseOpenApiFrontmatter(rawValue: string | undefined, defaultSpec?: string): ParsedOpenApiFrontmatter | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const withInlineSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withInlineSpec) {
    const method = withInlineSpec[2].toUpperCase();
    const endpoint = withInlineSpec[3].trim();
    if (!endpoint) return null;
    const kind = method === 'WEBHOOK' ? 'webhook' : 'path';
    if (kind === 'path' && !endpoint.startsWith('/')) return null;
    return {
      spec: withInlineSpec[1].trim(),
      method,
      endpoint,
      kind,
    };
  }

  const withDefaultSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (withDefaultSpec) {
    const method = withDefaultSpec[1].toUpperCase();
    const endpoint = withDefaultSpec[2].trim();
    if (!endpoint) return null;
    const kind = method === 'WEBHOOK' ? 'webhook' : 'path';
    if (kind === 'path' && !endpoint.startsWith('/')) return null;
    return {
      spec: defaultSpec,
      method,
      endpoint,
      kind,
    };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseOpenApiDocument(rawSource: string): Record<string, unknown> | null {
  const sourceText = rawSource.trim();
  if (!sourceText) return null;

  try {
    const parsed = JSON.parse(sourceText);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // Fall through to YAML parse.
  }

  try {
    const parsed = parseYaml(sourceText);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }

  return null;
}

async function loadOpenApiDocument(specSource: string): Promise<Record<string, unknown> | null> {
  const sourceText = specSource.trim();
  if (!sourceText) return null;

  if (/^https?:\/\//i.test(sourceText)) {
    try {
      const response = await fetch(sourceText, { cache: 'force-cache' });
      if (!response.ok) return null;
      const text = await response.text();
      return parseOpenApiDocument(text);
    } catch {
      return null;
    }
  }

  const relative = sourceText.replace(/^\/+/, '');
  const candidates = sourceText.startsWith('/')
    ? [
        join(process.cwd(), 'public', relative),
        join(process.cwd(), relative),
        join(process.cwd(), 'content', 'docs', relative),
      ]
    : [
        join(process.cwd(), sourceText),
        join(process.cwd(), 'public', sourceText),
        join(process.cwd(), 'content', 'docs', sourceText),
      ];

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, 'utf-8');
      const parsed = parseOpenApiDocument(text);
      if (parsed) return parsed;
    } catch {
      // ignore and continue
    }
  }

  return null;
}

function pickOperationMethod(pathItem: Record<string, unknown>, preferred?: string): string | undefined {
  const preferredLower = preferred?.toLowerCase();
  if (preferredLower && OPENAPI_METHODS.includes(preferredLower as (typeof OPENAPI_METHODS)[number])) {
    const selected = asRecord(pathItem[preferredLower]);
    if (selected) return preferredLower;
  }
  for (const method of OPENAPI_METHODS) {
    if (asRecord(pathItem[method])) return method;
  }
  return undefined;
}

function resolvePathOperation(
  document: Record<string, unknown>,
  endpoint: string,
  method: string,
): { endpoint: string; method: string; operation: Record<string, unknown> } | null {
  const paths = asRecord(document.paths);
  if (!paths) return null;

  const candidates = endpoint.startsWith('/')
    ? [endpoint, endpoint.replace(/^\/+/, '')]
    : [`/${endpoint}`, endpoint];
  const methodLower = method.toLowerCase();

  for (const candidate of candidates) {
    const pathItem = asRecord(paths[candidate]);
    if (!pathItem) continue;
    const resolvedMethod = pickOperationMethod(pathItem, methodLower);
    if (!resolvedMethod) continue;
    const operation = asRecord(pathItem[resolvedMethod]);
    if (!operation) continue;
    const resolvedEndpoint = candidate.startsWith('/') ? candidate : `/${candidate}`;
    return { endpoint: resolvedEndpoint, method: resolvedMethod, operation };
  }

  return null;
}

function resolveWebhookOperation(
  document: Record<string, unknown>,
  endpoint: string,
): { endpoint: string; method: string; operation: Record<string, unknown> } | null {
  const webhooks = asRecord(document.webhooks);
  if (!webhooks) return null;

  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const candidates = [endpoint, normalized, endpoint.replace(/^\/+/, ''), normalized.replace(/^\/+/, '')];

  for (const candidate of candidates) {
    const pathItem = asRecord(webhooks[candidate]);
    if (!pathItem) continue;
    const resolvedMethod = pickOperationMethod(pathItem);
    if (!resolvedMethod) continue;
    const operation = asRecord(pathItem[resolvedMethod]);
    if (!operation) continue;
    return { endpoint: candidate, method: resolvedMethod, operation };
  }

  return null;
}

function displaySpecName(specSource: string | undefined): string {
  if (!specSource || !specSource.trim()) return 'openapi.json';
  const trimmed = specSource.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const name = basename(url.pathname || '');
      return name || 'openapi.json';
    } catch {
      return 'openapi.json';
    }
  }
  return basename(trimmed.replace(/\\/g, '/')) || 'openapi.json';
}

function buildMintlifyStyleApiMarkdown(input: {
  title: string;
  description?: string;
  body?: string;
  specLabel: string;
  endpoint: string;
  method: string;
  kind: 'path' | 'webhook';
  snippet: Record<string, unknown>;
}): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  lines.push('');
  if (input.description) {
    lines.push(`> ${input.description}`);
    lines.push('');
  }
  if (input.body) {
    lines.push(input.body.trim());
    lines.push('');
  }
  lines.push('## OpenAPI');
  lines.push('');

  const opLabel = input.kind === 'webhook'
    ? `webhook ${input.endpoint}`
    : `${input.method.toLowerCase()} ${input.endpoint}`;
  const yaml = stringifyYaml(input.snippet).trimEnd();
  lines.push(`\`\`\`\`yaml ${input.specLabel} ${opLabel}`);
  lines.push(yaml);
  lines.push('````');
  lines.push('');
  return lines.join('\n');
}

export async function GET(_request: Request, { params }: { params: Promise<RouteParams> }) {
  const resolvedParams = await params;
  const fullSlug = resolvedParams.slug ?? [];
  if (fullSlug.length === 0) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const normalized = [...fullSlug];
  const lastIndex = normalized.length - 1;
  const last = normalized[lastIndex] ?? '';
  if (last.toLowerCase().endsWith('.md')) {
    const stripped = last.slice(0, -3);
    if (stripped) normalized[lastIndex] = stripped;
  }

  const { locale, pageSlug } = resolveLocaleSlug(normalized);
  const hasI18n = getLanguages().length > 1;
  const page = hasI18n ? source.getPage(pageSlug, locale) : source.getPage(pageSlug);

  if (!page) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const fromFile = await loadMarkdownForSlug(pageSlug, locale, hasI18n);
  const fromData = ((page.data as unknown) as Record<string, unknown>).processedMarkdown;
  const markdown = typeof fromFile === 'string' && fromFile.trim().length > 0
    ? fromFile
    : (typeof fromData === 'string' ? fromData : `# ${page.data.title}\n`);

  const frontmatter = parseFrontmatterMap(markdown);
  const markdownBody = stripFrontmatter(markdown).trim();
  const apiConfig = getApiConfig();
  const parsedOpenApi = parseOpenApiFrontmatter(frontmatter.openapi, apiConfig.defaultOpenApiSpec);
  if (parsedOpenApi?.spec) {
    const document = await loadOpenApiDocument(parsedOpenApi.spec);
    if (document) {
      const resolved = parsedOpenApi.kind === 'webhook'
        ? resolveWebhookOperation(document, parsedOpenApi.endpoint)
        : resolvePathOperation(document, parsedOpenApi.endpoint, parsedOpenApi.method);

      if (resolved) {
        const title = frontmatter.title
          || (typeof resolved.operation.summary === 'string' ? resolved.operation.summary : '')
          || `${resolved.method.toUpperCase()} ${resolved.endpoint}`;
        const description = frontmatter.description
          || (typeof resolved.operation.description === 'string' ? resolved.operation.description : undefined);
        const snippet: Record<string, unknown> = {
          openapi: typeof document.openapi === 'string' ? document.openapi : '3.0.0',
          info: asRecord(document.info) ?? { title: 'API', version: '1.0.0' },
          ...(Array.isArray(document.servers) ? { servers: document.servers } : {}),
          ...(Array.isArray(document.security) ? { security: document.security } : {}),
          ...(parsedOpenApi.kind === 'webhook'
            ? { webhooks: { [resolved.endpoint]: { [resolved.method]: resolved.operation } } }
            : { paths: { [resolved.endpoint]: { [resolved.method]: resolved.operation } } }),
          ...(asRecord(document.components) ? { components: document.components } : {}),
        };
        const output = buildMintlifyStyleApiMarkdown({
          title,
          description,
          body: markdownBody || undefined,
          specLabel: displaySpecName(parsedOpenApi.spec),
          endpoint: resolved.endpoint,
          method: resolved.method,
          kind: parsedOpenApi.kind,
          snippet,
        });
        return new Response(output, {
          status: 200,
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'content-disposition': 'inline',
            'x-content-type-options': 'nosniff',
          },
        });
      }
    }
  }

  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    },
  });
}
