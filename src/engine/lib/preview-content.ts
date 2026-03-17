/**
 * Content generator for preview sessions.
 *
 * Reads a workspace directory (docs.json + MDX source files) and writes
 * processed content to an output directory that fumadocs-mdx scans.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { normalizeConfigNavigation } from './navigation-normalize';

const PREVIEW_CONTENT_DIR = process.env.PREVIEW_CONTENT_DIR || './content';
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/mnt/nfs_share/editor_sessions';

const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

/**
 * Copy only spec files (JSON/YAML) from workspace to public/ so the
 * OpenAPI component can resolve them. Images and other assets are served
 * on-demand through the session assets API route, so we skip them here
 * to keep session init fast.
 */
const SPEC_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

function copySpecFiles(docsDir: string): void {
  const publicDir = resolve('public');

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (!SPEC_EXTENSIONS.has(ext)) continue;
      const rel = relative(docsDir, srcPath);
      const destPath = join(publicDir, rel);
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }

  mkdirSync(publicDir, { recursive: true });
  walk(docsDir);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface VeluConfig {
  navigation: {
    tabs?: VeluTab[];
    languages?: Array<{ language: string; tabs: VeluTab[] }>;
    anchors?: any[];
    [key: string]: unknown;
  };
  languages?: string[];
  openapi?: unknown;
  variables?: Record<string, string>;
  [key: string]: unknown;
}

interface VeluTab {
  tab: string;
  slug?: string;
  href?: string;
  pages?: Array<string | VeluSeparator | VeluLink>;
  groups?: VeluGroup[];
  openapi?: unknown;
  [key: string]: unknown;
}

interface VeluGroup {
  group: string;
  slug?: string;
  pages: Array<string | VeluGroup | VeluSeparator | VeluLink>;
  description?: string;
  openapi?: unknown;
  [key: string]: unknown;
}

interface VeluSeparator { separator: string }
interface VeluLink { href: string; label: string; icon?: string }

interface PageMapping {
  src: string;
  dest: string;
  kind: 'file' | 'openapi-operation';
  title?: string;
  description?: string;
  openapiSpec?: string;
  openapiMethod?: string;
  openapiEndpoint?: string;
  deprecated?: boolean;
  version?: string;
  content?: string;
}

interface MetaFile {
  dir: string;
  data: { pages: string[]; title?: string; description?: string; [key: string]: unknown };
}

interface BuildArtifacts {
  pageMap: PageMapping[];
  metaFiles: MetaFile[];
  firstPage: string;
}

// ── Config loading ─────────────────────────────────────────────────────────

function resolveConfigPath(docsDir: string): string | null {
  const primary = join(docsDir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  const legacy = join(docsDir, LEGACY_CONFIG_NAME);
  if (existsSync(legacy)) return legacy;
  return null;
}

function resolveVariables(
  variables: Record<string, string> | undefined,
): Record<string, string> {
  if (!variables) return {};
  const resolved: Record<string, string> = {};
  const MAX_DEPTH = 10;

  for (const [key, rawValue] of Object.entries(variables)) {
    let value = rawValue;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const replaced = value.replace(
        /\{\{(\w+)\}\}/g,
        (_, name) => variables[name] ?? `{{${name}}}`,
      );
      if (replaced === value) break;
      value = replaced;
    }
    resolved[key] = value;
  }
  return resolved;
}

function replaceVariablesInString(
  content: string,
  variables: Record<string, string>,
): string {
  if (!content || Object.keys(variables).length === 0) return content;
  return content.replace(
    /\{\{(\w+)\}\}/g,
    (match, name) => variables[name] ?? match,
  );
}

function loadConfig(docsDir: string): {
  config: VeluConfig;
  variables: Record<string, string>;
} {
  const configPath = resolveConfigPath(docsDir);
  if (!configPath) {
    throw new Error(`No docs.json or velu.json found in ${docsDir}`);
  }
  const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
  const raw = normalizeConfigNavigation(parsed) as VeluConfig;
  const variables = resolveVariables(raw.variables);
  return { config: raw, variables };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isSeparator(item: unknown): item is VeluSeparator {
  return typeof item === 'object' && item !== null && 'separator' in item;
}

function isLink(item: unknown): item is VeluLink {
  return typeof item === 'object' && item !== null && 'href' in item && 'label' in item;
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === 'object' && item !== null && 'group' in item;
}

function pageBasename(page: string): string {
  const parts = page.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? page;
}

function pageLabelFromSlug(slug: string): string {
  const base = pageBasename(slug);
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizeFrontmatterValue(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/"/g, '\\"').trim();
}

// ── OpenAPI helpers ───────────────────────────────────────────────────────

const OPENAPI_PATH_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function extractOpenApiSource(openapi: unknown): string | string[] | undefined {
  if (typeof openapi === 'string' || Array.isArray(openapi)) return openapi;
  if (openapi && typeof openapi === 'object') {
    const source = (openapi as Record<string, unknown>).source;
    if (typeof source === 'string' || Array.isArray(source)) return source;
  }
  return undefined;
}

function resolveOpenApiSpecList(openapi: unknown): string[] {
  const source = extractOpenApiSource(openapi);
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(source)) {
    return source.filter((e): e is string => typeof e === 'string' && e.trim().length > 0).map(e => e.trim());
  }
  return [];
}

function normalizeOpenApiSpecForFrontmatter(spec: string | undefined): string | undefined {
  if (!spec) return undefined;
  const trimmed = String(spec).trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\.?\/*/, '')}`;
}

function slugFromOpenApiOperation(method: string, endpoint: string): string {
  const cleaned = endpoint
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-z0-9/._-]+/g, '-')
    .replace(/\/+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return `${method.toLowerCase()}-${cleaned || 'endpoint'}`;
}

interface OpenApiOperation {
  spec: string;
  method: string;
  endpoint: string;
  title?: string;
  description?: string;
  deprecated?: boolean;
}

function loadOpenApiOperations(specSource: string, docsDir: string): OpenApiOperation[] {
  const resolvedPath = /^https?:\/\//i.test(specSource)
    ? undefined
    : join(docsDir, specSource.replace(/^\/+/, ''));
  if (!resolvedPath || !existsSync(resolvedPath)) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
  } catch {
    return [];
  }

  const output: OpenApiOperation[] = [];
  const paths = parsed.paths;
  if (paths && typeof paths === 'object') {
    for (const [endpoint, methods] of Object.entries(paths as Record<string, unknown>)) {
      if (!endpoint.startsWith('/') || !methods || typeof methods !== 'object') continue;
      for (const method of Object.keys(methods as Record<string, unknown>)) {
        if (!OPENAPI_PATH_METHODS.has(method.toLowerCase())) continue;
        const operation = (methods as Record<string, unknown>)[method];
        if (!operation || typeof operation !== 'object') continue;
        const op = operation as Record<string, unknown>;
        output.push({
          spec: specSource,
          method: method.toUpperCase(),
          endpoint,
          title: typeof op.summary === 'string' ? op.summary : undefined,
          description: typeof op.description === 'string' ? op.description : undefined,
          deprecated: op.deprecated === true,
        });
      }
    }
  }

  // Webhooks
  const webhooks = parsed.webhooks;
  if (webhooks && typeof webhooks === 'object') {
    for (const [webhookName, pathItem] of Object.entries(webhooks as Record<string, unknown>)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      // Pick the first valid HTTP method from the webhook path item
      const pi = pathItem as Record<string, unknown>;
      const resolvedMethod = Array.from(OPENAPI_PATH_METHODS).find(m => pi[m] && typeof pi[m] === 'object');
      if (!resolvedMethod) continue;
      const operation = pi[resolvedMethod] as Record<string, unknown>;
      output.push({
        spec: specSource,
        method: 'WEBHOOK',
        endpoint: webhookName,
        title: typeof operation.summary === 'string' ? operation.summary : undefined,
        description: typeof operation.description === 'string' ? operation.description : undefined,
        deprecated: operation.deprecated === true,
      });
    }
  }

  return output;
}

// ── Build artifacts ────────────────────────────────────────────────────────

function buildArtifacts(config: VeluConfig, docsDir?: string): BuildArtifacts {
  const pageMap: PageMapping[] = [];
  const metaFiles: MetaFile[] = [];
  const rootTabs = (config.navigation?.tabs || []).filter((tab) => !tab.href);
  const rootPages = rootTabs.map((tab) => tab.slug);
  let firstPage = 'quickstart';
  let hasFirstPage = false;
  const usedDestinations = new Set<string>();

  function trackFirstPage(dest: string) {
    if (!hasFirstPage) {
      firstPage = dest;
      hasFirstPage = true;
    }
  }

  function metaEntry(item: string | VeluSeparator | VeluLink): string {
    if (typeof item === 'string') return item;
    if (isSeparator(item)) return `---${item.separator}---`;
    if (isLink(item)) {
      return item.icon
        ? `[${item.icon}][${item.label}](${item.href})`
        : `[${item.label}](${item.href})`;
    }
    return String(item);
  }

  function uniqueDestination(dest: string): string {
    if (!usedDestinations.has(dest)) {
      usedDestinations.add(dest);
      return dest;
    }
    let count = 2;
    while (usedDestinations.has(`${dest}-${count}`)) count += 1;
    const candidate = `${dest}-${count}`;
    usedDestinations.add(candidate);
    return candidate;
  }

  function processGroup(
    group: VeluGroup,
    parentDir: string,
    inheritedSpec?: string,
  ) {
    const groupSlug = group.slug || pageBasename(group.group).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const groupDir = `${parentDir}/${groupSlug}`;
    const groupMetaPages: string[] = [];
    const groupSpec = typeof group.openapi === 'string' ? group.openapi : inheritedSpec;

    for (const item of group.pages) {
      if (typeof item === 'string') {
        const dest = uniqueDestination(`${groupDir}/${pageBasename(item)}`);
        pageMap.push({ src: item, dest, kind: 'file' });
        groupMetaPages.push(pageBasename(item));
        trackFirstPage(dest);
      } else if (isGroup(item)) {
        const nestedSlug = item.slug || pageBasename(item.group).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        groupMetaPages.push(nestedSlug);
        processGroup(item, groupDir, groupSpec);
      } else if (isSeparator(item) || isLink(item)) {
        groupMetaPages.push(metaEntry(item));
      }
    }

    // Auto-generate pages from OpenAPI spec when group has no explicit pages
    if (group.pages.length === 0 && groupSpec && docsDir) {
      const specs = resolveOpenApiSpecList(group.openapi ?? groupSpec);
      if (specs.length === 0 && groupSpec) specs.push(groupSpec);
      const seen = new Set<string>();
      for (const spec of specs) {
        for (const op of loadOpenApiOperations(spec, docsDir)) {
          const key = `${op.method}::${op.endpoint}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const slug = slugFromOpenApiOperation(op.method, op.endpoint);
          const dest = uniqueDestination(`${groupDir}/${slug}`);
          pageMap.push({
            src: `${op.spec} ${op.method} ${op.endpoint}`,
            dest,
            kind: 'openapi-operation',
            openapiSpec: op.spec,
            openapiMethod: op.method,
            openapiEndpoint: op.endpoint,
            title: op.title,
            description: op.description,
            deprecated: op.deprecated,
          });
          groupMetaPages.push(slug);
          trackFirstPage(dest);
        }
      }
    }

    const groupMetaData: MetaFile['data'] = {
      title: group.group,
      pages: groupMetaPages,
      defaultOpen: group.expanded !== false,
    };
    if (group.description) groupMetaData.description = group.description;
    if (group.icon) groupMetaData.icon = group.icon;
    if (group.iconType) groupMetaData.iconType = group.iconType;

    metaFiles.push({
      dir: groupDir,
      data: groupMetaData,
    });
  }

  function processTab(tab: VeluTab) {
    const tabSlug = tab.slug || tab.tab.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tabDir = tabSlug;
    const tabMetaPages: string[] = [];
    const tabSpec = typeof tab.openapi === 'string' ? tab.openapi : undefined;

    if (tab.pages) {
      for (const item of tab.pages) {
        if (typeof item === 'string') {
          const dest = uniqueDestination(`${tabDir}/${pageBasename(item)}`);
          pageMap.push({ src: item, dest, kind: 'file' });
          tabMetaPages.push(pageBasename(item));
          trackFirstPage(dest);
        } else if (isSeparator(item) || isLink(item)) {
          tabMetaPages.push(metaEntry(item));
        }
      }
    }

    if (tab.groups) {
      for (const group of tab.groups) {
        const groupSlug = group.slug || pageBasename(group.group).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        tabMetaPages.push(groupSlug);
        processGroup(group, tabDir, tabSpec);
      }
    }

    // Auto-generate pages from OpenAPI spec when tab has no explicit pages/groups
    if (!tab.pages?.length && !tab.groups?.length && tab.openapi !== undefined && docsDir) {
      const specs = resolveOpenApiSpecList(tab.openapi);
      if (specs.length === 0 && tabSpec) specs.push(tabSpec);
      const seen = new Set<string>();
      for (const spec of specs) {
        for (const op of loadOpenApiOperations(spec, docsDir)) {
          const key = `${op.method}::${op.endpoint}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const slug = slugFromOpenApiOperation(op.method, op.endpoint);
          const dest = uniqueDestination(`${tabDir}/${slug}`);
          pageMap.push({
            src: `${op.spec} ${op.method} ${op.endpoint}`,
            dest,
            kind: 'openapi-operation',
            openapiSpec: op.spec,
            openapiMethod: op.method,
            openapiEndpoint: op.endpoint,
            title: op.title,
            description: op.description,
            deprecated: op.deprecated,
          });
          tabMetaPages.push(slug);
          trackFirstPage(dest);
        }
      }
    }

    metaFiles.push({
      dir: tabDir,
      data: { title: tab.tab, pages: tabMetaPages },
    });
  }

  for (const tab of rootTabs) {
    processTab(tab);
  }

  metaFiles.push({
    dir: '',
    data: { pages: rootPages.filter((p): p is string => typeof p === 'string') },
  });

  return { pageMap, metaFiles, firstPage };
}

// ── Page processing ────────────────────────────────────────────────────────

function processPage(
  srcPath: string,
  destPath: string,
  slug: string,
  variables: Record<string, string>,
): void {
  let content = readFileSync(srcPath, 'utf-8');
  content = replaceVariablesInString(content, variables);

  if (!content.startsWith('---')) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
    if (titleMatch) {
      content = content.replace(/^#\s+.+$/m, '').trimStart();
    }
    content = `---\ntitle: "${sanitizeFrontmatterValue(title)}"\n---\n\n${content}`;
  }

  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, 'utf-8');
}

// ── Content writing ────────────────────────────────────────────────────────

function writeLangContent(
  docsDir: string,
  contentDir: string,
  langCode: string,
  artifacts: BuildArtifacts,
  variables: Record<string, string>,
  isDefault: boolean,
  useLangFolders = false,
) {
  const storagePrefix = useLangFolders ? langCode : (isDefault ? '' : langCode);

  const metas = storagePrefix
    ? artifacts.metaFiles.map((m) => ({
        dir: m.dir ? `${storagePrefix}/${m.dir}` : storagePrefix,
        data: { ...m.data },
      }))
    : artifacts.metaFiles;

  for (const meta of metas) {
    const metaPath = join(contentDir, meta.dir, 'meta.json');
    mkdirSync(dirname(metaPath), { recursive: true });
    writeFileSync(metaPath, JSON.stringify(meta.data, null, 2) + '\n', 'utf-8');
  }

  for (const mapping of artifacts.pageMap) {
    const destPath = join(
      contentDir,
      storagePrefix ? `${storagePrefix}/${mapping.dest}.mdx` : `${mapping.dest}.mdx`,
    );

    if (mapping.kind === 'openapi-operation') {
      mkdirSync(dirname(destPath), { recursive: true });
      const operationLabel = `${mapping.openapiMethod ?? 'GET'} ${mapping.openapiEndpoint ?? '/'}`;
      const normalizedSpec = normalizeOpenApiSpecForFrontmatter(mapping.openapiSpec);
      const openapiValue = normalizedSpec
        ? `${normalizedSpec} ${operationLabel}`
        : operationLabel;
      const title = sanitizeFrontmatterValue(mapping.title ?? operationLabel);
      const openapi = openapiValue.replace(/"/g, '\\"');
      const descriptionLine = mapping.description
        ? `\ndescription: "${sanitizeFrontmatterValue(mapping.description)}"`
        : '';
      const deprecatedLine = mapping.deprecated === true ? `\ndeprecated: true` : '';
      writeFileSync(
        destPath,
        `---\ntitle: "${title}"${descriptionLine}${deprecatedLine}\nopenapi: "${openapi}"\n---\n`,
        'utf-8',
      );
      continue;
    }

    const src = mapping.src;
    let srcPath = join(docsDir, `${src}.mdx`);
    if (!existsSync(srcPath)) {
      srcPath = join(docsDir, `${src}.md`);
    }
    if (!existsSync(srcPath)) continue;

    processPage(srcPath, destPath, src, variables);
  }

  const indexPath = storagePrefix
    ? join(contentDir, storagePrefix, 'index.mdx')
    : join(contentDir, 'index.mdx');
  writeFileSync(
    indexPath,
    `---\ntitle: "Overview"\n---\n\nWelcome to the documentation.\n`,
    'utf-8',
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate all content for a session from its workspace.
 */
export function generateSessionContent(sessionId: string): {
  firstPage: string;
  pageCount: number;
} {
  const workspaceDir = join(WORKSPACE_DIR, sessionId);
  const outputDir = join(PREVIEW_CONTENT_DIR, sessionId);

  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  // Copy spec files (JSON/YAML) to public/ so the OpenAPI component can resolve them
  copySpecFiles(workspaceDir);

  const { config, variables } = loadConfig(workspaceDir);
  const navLanguages = config.navigation?.languages;
  const simpleLanguages = config.languages || [];

  if (navLanguages && navLanguages.length > 0) {
    const rootPages: string[] = [];
    let totalPages = 0;
    let firstPage = 'quickstart';

    for (let i = 0; i < navLanguages.length; i++) {
      const langEntry = navLanguages[i];
      const isDefault = i === 0;
      const langConfig = {
        ...config,
        navigation: { ...config.navigation, tabs: langEntry.tabs },
      } as VeluConfig;
      const artifacts = buildArtifacts(langConfig, workspaceDir);
      writeLangContent(workspaceDir, outputDir, langEntry.language, artifacts, variables, isDefault, true);
      totalPages += artifacts.pageMap.length;
      if (i === 0) firstPage = artifacts.firstPage;
      rootPages.push(`!${langEntry.language}`);
    }

    writeFileSync(
      join(outputDir, 'meta.json'),
      JSON.stringify({ pages: rootPages }, null, 2) + '\n',
      'utf-8',
    );

    return { firstPage, pageCount: totalPages };
  }

  const artifacts = buildArtifacts(config, workspaceDir);
  const useLangFolders = simpleLanguages.length > 1;
  writeLangContent(
    workspaceDir, outputDir,
    simpleLanguages[0] || 'en', artifacts, variables,
    true, useLangFolders,
  );

  let totalPages = artifacts.pageMap.length;

  if (simpleLanguages.length > 1) {
    const rootPages = [`!${simpleLanguages[0] || 'en'}`];
    for (const lang of simpleLanguages.slice(1)) {
      writeLangContent(workspaceDir, outputDir, lang, artifacts, variables, false, true);
      rootPages.push(`!${lang}`);
      totalPages += artifacts.pageMap.length;
    }
    writeFileSync(
      join(outputDir, 'meta.json'),
      JSON.stringify({ pages: rootPages }, null, 2) + '\n',
      'utf-8',
    );
  }

  return { firstPage: artifacts.firstPage, pageCount: totalPages };
}

/**
 * Sync a single file after an edit in the workspace.
 */
export function syncSessionFile(
  sessionId: string,
  filePath: string,
): { synced: boolean } {
  const workspaceDir = join(WORKSPACE_DIR, sessionId);
  const outputDir = join(PREVIEW_CONTENT_DIR, sessionId);

  if (filePath === PRIMARY_CONFIG_NAME || filePath === LEGACY_CONFIG_NAME) {
    generateSessionContent(sessionId);
    return { synced: true };
  }

  let variables: Record<string, string> = {};
  try {
    const result = loadConfig(workspaceDir);
    variables = result.variables;
  } catch {
    // Config might not exist yet
  }

  const stripped = filePath.replace(/\.(mdx?|md)$/, '');
  let srcPath = join(workspaceDir, filePath);
  if (!existsSync(srcPath)) {
    srcPath = join(workspaceDir, `${stripped}.mdx`);
  }
  if (!existsSync(srcPath)) {
    srcPath = join(workspaceDir, `${stripped}.md`);
  }
  if (!existsSync(srcPath)) {
    return { synced: false };
  }

  try {
    const { config } = loadConfig(workspaceDir);
    const artifacts = buildArtifacts(config, workspaceDir);
    const mapping = artifacts.pageMap.find((m) => {
      return m.src === stripped || m.src === filePath;
    });

    if (mapping) {
      const destPath = join(outputDir, `${mapping.dest}.mdx`);
      processPage(srcPath, destPath, stripped, variables);
      return { synced: true };
    }
  } catch {
    // Fall through to direct copy
  }

  const destPath = join(outputDir, `${stripped}.mdx`);
  processPage(srcPath, destPath, stripped, variables);
  return { synced: true };
}

/**
 * Remove all preview content for a session.
 */
export function removeSessionContent(sessionId: string): void {
  const outputDir = join(PREVIEW_CONTENT_DIR, sessionId);
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
