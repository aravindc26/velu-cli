import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, posix as posixPath } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getApiConfig, getLanguages, getSeoConfig } from '@/lib/velu';

export interface LlmsPageEntry {
  slug: string[];
  path: string;
  locale: string;
  pageSlug: string[];
  section: string;
  title: string;
  description?: string;
  markdown?: string;
  sourceKind: 'source' | 'generated';
  openapiSpec?: string;
  isOpenApiOperation: boolean;
  noindex: boolean;
}

interface CollectLlmsPagesOptions {
  includeMarkdown?: boolean;
  indexing?: 'navigable' | 'all';
}

const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

function resolveConfigPath(): string | null {
  const docsPath = join(process.cwd(), PRIMARY_CONFIG_NAME);
  if (existsSync(docsPath)) return docsPath;
  const legacyPath = join(process.cwd(), LEGACY_CONFIG_NAME);
  if (existsSync(legacyPath)) return legacyPath;
  return null;
}

function resolveDocsDir(): string {
  const envDocsDir = process.env.VELU_DOCS_DIR?.trim();
  if (envDocsDir) return envDocsDir;
  return process.cwd();
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
    output[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
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

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function humanizeSlug(value: string): string {
  const cleaned = String(value ?? '').trim().replace(/[-_]+/g, ' ');
  if (!cleaned) return 'Docs';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugToPath(slug: string[]): string {
  const joined = slug.join('/');
  if (!joined) return '/';
  return `/${joined}`.replace(/\/{2,}/g, '/');
}

function pathToSlug(path: string): string {
  return normalizePath(path).replace(/^\/+/, '');
}

function sectionFromSlug(pageSlug: string[], locale: string, hasI18n: boolean): string {
  const root = pageSlug[0] ? humanizeSlug(pageSlug[0]) : 'Docs';
  if (!hasI18n) return root;
  return `${locale.toUpperCase()} - ${root}`;
}

function hasSourceFileForPage(pageSlug: string[], locale: string, hasI18n: boolean): boolean {
  const docsDir = resolveDocsDir();
  const rel = pageSlug.join('/');
  const candidates = hasI18n
    ? [
        join(docsDir, locale, `${rel}.md`),
        join(docsDir, locale, `${rel}.mdx`),
        join(docsDir, `${rel}.md`),
        join(docsDir, `${rel}.mdx`),
      ]
    : [
        join(docsDir, `${rel}.md`),
        join(docsDir, `${rel}.mdx`),
      ];

  return candidates.some((candidate) => existsSync(candidate));
}

const HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT', 'WEBHOOK',
]);

function parseOpenApiFrontmatter(rawValue: string | undefined, defaultSpec?: string): { spec?: string; isOperation: boolean } {
  if (!rawValue) return { spec: undefined, isOperation: false };
  const trimmed = rawValue.trim();
  if (!trimmed) return { spec: undefined, isOperation: false };

  const withSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withSpec) {
    const method = withSpec[2].toUpperCase();
    const endpoint = withSpec[3].trim();
    if (!HTTP_METHODS.has(method) || !endpoint) return { spec: undefined, isOperation: false };
    if (method !== 'WEBHOOK' && !endpoint.startsWith('/')) return { spec: undefined, isOperation: false };
    return { spec: withSpec[1].trim(), isOperation: true };
  }

  const noSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (noSpec) {
    const method = noSpec[1].toUpperCase();
    const endpoint = noSpec[2].trim();
    if (!HTTP_METHODS.has(method) || !endpoint) return { spec: undefined, isOperation: false };
    if (method !== 'WEBHOOK' && !endpoint.startsWith('/')) return { spec: undefined, isOperation: false };
    return { spec: defaultSpec?.trim(), isOperation: true };
  }

  return { spec: undefined, isOperation: false };
}

function resolveGeneratedDocsRoot(): string {
  const primary = join(process.cwd(), 'content', 'docs');
  if (existsSync(primary)) return primary;
  return join(process.cwd(), '.velu-out', 'content', 'docs');
}

function collectMarkdownRelativePaths(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string, relPrefix: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const absPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!relPath.endsWith('.md') && !relPath.endsWith('.mdx')) continue;
      files.push(relPath.replace(/\\/g, '/'));
    }
  }

  if (!existsSync(rootDir)) return files;
  walk(rootDir, '');
  return files;
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

function normalizeMetaTagMap(value: unknown): Record<string, string> {
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

function parseNoindex(frontmatterData: Record<string, unknown>, frontmatterMap: Record<string, string>): boolean {
  const direct = normalizeBoolean(frontmatterData.noindex);
  if (direct === true) return true;

  const fallback = normalizeBoolean(frontmatterMap.noindex);
  if (fallback === true) return true;

  const metatags = normalizeMetaTagMap(frontmatterData.metatags);
  const robots = (metatags.robots ?? '').toLowerCase();
  if (!robots) return false;
  return robots.includes('noindex') || robots.includes('none');
}

function isDecorativeMetaEntry(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return true;
  if (/^---.*---$/.test(trimmed)) return true;
  if (/^\[[^\]]+\](?:\[[^\]]+\])?\([^)]+\)$/.test(trimmed)) return true;
  return false;
}

function resolveMetaEntry(baseDir: string, entry: string): string | null {
  const normalized = posixPath.normalize(posixPath.join(baseDir || '.', entry));
  if (normalized === '.' || normalized === '') return null;
  if (normalized.startsWith('..')) return null;
  return normalized.replace(/^\.\//, '');
}

export function collectNavigablePagePaths(): Set<string> {
  const rootDir = resolveGeneratedDocsRoot();
  const visible = new Set<string>();
  const visited = new Set<string>();

  function hasMeta(dir: string): boolean {
    const metaPath = join(rootDir, dir, 'meta.json');
    return existsSync(metaPath);
  }

  function hasPage(dir: string): boolean {
    return existsSync(join(rootDir, `${dir}.md`)) || existsSync(join(rootDir, `${dir}.mdx`));
  }

  function readMetaPages(dir: string): string[] {
    const metaPath = join(rootDir, dir, 'meta.json');
    try {
      const parsed = JSON.parse(readFileSync(metaPath, 'utf-8')) as { pages?: unknown };
      return Array.isArray(parsed.pages)
        ? parsed.pages.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  }

  function walkMeta(dir: string, hiddenAncestor: boolean) {
    const visitKey = `${dir}|${hiddenAncestor ? '1' : '0'}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    for (const raw of readMetaPages(dir)) {
      const hiddenSelf = raw.startsWith('!');
      const rawEntry = hiddenSelf ? raw.slice(1) : raw;
      if (isDecorativeMetaEntry(rawEntry)) continue;

      const resolved = resolveMetaEntry(dir, rawEntry);
      if (!resolved) continue;

      const hidden = hiddenAncestor || hiddenSelf;
      if (hasPage(resolved) && !hidden) visible.add(resolved);
      if (hasMeta(resolved)) walkMeta(resolved, hidden);
    }
  }

  if (hasMeta('')) {
    walkMeta('', false);
    return visible;
  }

  // Fallback for projects without generated meta files.
  for (const rel of collectMarkdownRelativePaths(rootDir)) {
    const slug = rel.replace(/\.(md|mdx)$/i, '');
    if (slug && slug !== 'index') visible.add(slug);
  }
  return visible;
}

export async function collectLlmsPages(options: CollectLlmsPagesOptions = {}): Promise<LlmsPageEntry[]> {
  const includeMarkdown = options.includeMarkdown === true;
  const indexing = options.indexing ?? getSeoConfig().indexing;
  const generatedDocsRoot = resolveGeneratedDocsRoot();
  const markdownPaths = collectMarkdownRelativePaths(generatedDocsRoot);
  const navigable = indexing === 'navigable' ? collectNavigablePagePaths() : null;
  const hasI18n = getLanguages().length > 1;
  const defaultOpenApiSpec = getApiConfig().defaultOpenApiSpec;
  const seen = new Set<string>();
  const pages: LlmsPageEntry[] = [];

  for (const relFilePath of markdownPaths) {
    const withoutExt = relFilePath.replace(/\.(md|mdx)$/i, '');
    if (withoutExt === 'index') continue;
    const slug = withoutExt.split('/').filter((segment) => segment.length > 0);
    if (slug.length === 0) continue;

    const path = slugToPath(slug);
    const slugPath = pathToSlug(path);
    if (navigable && !navigable.has(slugPath)) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    const { locale, pageSlug } = resolveLocaleSlug(slug);
    const filePath = join(generatedDocsRoot, relFilePath);
    let markdown = '';
    try {
      markdown = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatterMap(markdown);
    const frontmatterData = parseFrontmatterData(markdown);
    const openapiRaw = typeof frontmatter.openapi === 'string' ? frontmatter.openapi : undefined;
    const openapi = parseOpenApiFrontmatter(openapiRaw, defaultOpenApiSpec);
    const sourceKind: 'source' | 'generated' = hasSourceFileForPage(pageSlug, locale, hasI18n) ? 'source' : 'generated';
    const noindex = parseNoindex(frontmatterData, frontmatter);

    const title = frontmatter.title || humanizeSlug(pageSlug[pageSlug.length - 1] ?? slug[slug.length - 1]);
    const description = frontmatter.description || undefined;

    const content = includeMarkdown
      ? stripFrontmatter(markdown ?? `# ${title}\n`).trim()
      : undefined;

    pages.push({
      slug,
      path,
      locale,
      pageSlug,
      section: sectionFromSlug(pageSlug, locale, hasI18n),
      title,
      description,
      markdown: content,
      sourceKind,
      openapiSpec: openapi.spec,
      isOpenApiOperation: openapi.isOperation,
      noindex,
    });
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  return pages;
}

export function getSiteTitle(): string {
  const configPath = resolveConfigPath();
  if (!configPath) return 'Documentation';

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) return parsed.name.trim();
    if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) return parsed.title.trim();
  } catch {
    // ignore parse/read errors and fallback.
  }

  return 'Documentation';
}

export function normalizePath(value: string): string {
  if (!value) return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  if (collapsed !== '/' && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed;
}

export function resolveRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
  const devPort = process.env.PORT?.trim();
  const fallbackOrigin = (requestUrl.hostname === 'localhost' && requestUrl.port === '3000' && devPort)
    ? `${requestUrl.protocol}//${requestUrl.hostname}:${devPort}`
    : requestUrl.origin;
  return forwardedHost ? `${forwardedProto}://${forwardedHost}` : fallbackOrigin;
}

const LLMS_FILE_CANDIDATES: Record<'llms.txt' | 'llms-full.txt', string[]> = {
  'llms.txt': ['llms.txt'],
  'llms-full.txt': ['llms-full.txt', 'llmfull.txt', 'llmfull', 'llms-full'],
};

export async function readCustomLlmsFile(filename: 'llms.txt' | 'llms-full.txt'): Promise<string | null> {
  const names = LLMS_FILE_CANDIDATES[filename] ?? [filename];
  const docsDir = process.env.VELU_DOCS_DIR?.trim();
  if (docsDir) {
    for (const name of names) {
      const docsPath = join(docsDir, name);
      if (!existsSync(docsPath)) continue;
      try {
        return await readFile(docsPath, 'utf-8');
      } catch {
        // ignore and continue
      }
    }
    // In dev mode, trust source docs directory for override existence.
    return null;
  }

  const candidates = names.flatMap((name) => [
    join(process.cwd(), name),
    join(process.cwd(), 'public', name),
  ]);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return await readFile(candidate, 'utf-8');
    } catch {
      // ignore and continue
    }
  }

  return null;
}
