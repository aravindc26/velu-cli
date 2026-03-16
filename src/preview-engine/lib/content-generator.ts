/**
 * Content generator for preview sessions.
 *
 * Reads a workspace directory (docs.json + MDX source files) and writes
 * processed content to an output directory that fumadocs-mdx scans.
 *
 * This is a simplified version of the build pipeline in build.ts/_server.mjs,
 * focused only on content generation (no engine scaffolding, theme CSS, etc.).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

const PREVIEW_CONTENT_DIR = process.env.PREVIEW_CONTENT_DIR || './content';
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/mnt/nfs_share/editor_sessions';

const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

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
  data: { pages: string[]; title?: string; description?: string };
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
  const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as VeluConfig;
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

// ── Build artifacts ────────────────────────────────────────────────────────

function buildArtifacts(config: VeluConfig): BuildArtifacts {
  const pageMap: PageMapping[] = [];
  const metaFiles: MetaFile[] = [];
  const rootTabs = (config.navigation.tabs || []).filter((tab) => !tab.href);
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

    metaFiles.push({
      dir: groupDir,
      data: {
        title: group.group,
        ...(group.description ? { description: group.description } : {}),
        pages: groupMetaPages,
      },
    });
  }

  function processTab(tab: VeluTab) {
    const tabSlug = tab.slug || tab.tab.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tabDir = tabSlug;
    const tabMetaPages: string[] = [];
    const tabSpec = typeof tab.openapi === 'string' ? tab.openapi : undefined;

    // Process top-level pages in this tab
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

    // Process groups
    if (tab.groups) {
      for (const group of tab.groups) {
        const groupSlug = group.slug || pageBasename(group.group).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        tabMetaPages.push(groupSlug);
        processGroup(group, tabDir, tabSpec);
      }
    }

    metaFiles.push({
      dir: tabDir,
      data: { title: tab.tab, pages: tabMetaPages },
    });
  }

  // Process all tabs
  for (const tab of rootTabs) {
    processTab(tab);
  }

  // Root meta.json lists the tab slugs
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

  // Write meta files
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

  // Copy and process pages
  for (const mapping of artifacts.pageMap) {
    const destPath = join(
      contentDir,
      storagePrefix ? `${storagePrefix}/${mapping.dest}.mdx` : `${mapping.dest}.mdx`,
    );

    if (mapping.kind === 'openapi-operation') {
      mkdirSync(dirname(destPath), { recursive: true });
      const operationLabel = `${mapping.openapiMethod ?? 'GET'} ${mapping.openapiEndpoint ?? '/'}`;
      const title = sanitizeFrontmatterValue(mapping.title ?? operationLabel);
      const openapi = operationLabel.replace(/"/g, '\\"');
      const descriptionLine = mapping.description
        ? `\ndescription: "${sanitizeFrontmatterValue(mapping.description)}"`
        : '';
      writeFileSync(
        destPath,
        `---\ntitle: "${title}"${descriptionLine}\nopenapi: "${openapi}"\n---\n`,
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

  // Index page redirect
  const urlPrefix = isDefault ? '' : langCode;
  const href = urlPrefix
    ? `/${urlPrefix}/${artifacts.firstPage}/`
    : `/${artifacts.firstPage}/`;
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
 * Reads from workspaceDir (docs.json + MDX sources) and writes
 * processed content to outputDir.
 */
export function generateSessionContent(sessionId: string): {
  firstPage: string;
  pageCount: number;
} {
  const workspaceDir = join(WORKSPACE_DIR, sessionId);
  const outputDir = join(PREVIEW_CONTENT_DIR, sessionId);

  // Clean previous content
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const { config, variables } = loadConfig(workspaceDir);
  const navLanguages = config.navigation.languages;
  const simpleLanguages = config.languages || [];

  if (navLanguages && navLanguages.length > 0) {
    // Per-language navigation
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
      const artifacts = buildArtifacts(langConfig);
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

  // Simple (single-lang or same-nav multi-lang)
  const artifacts = buildArtifacts(config);
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
 * Re-reads the file from the workspace and writes the processed
 * version to the preview content directory.
 */
export function syncSessionFile(
  sessionId: string,
  filePath: string,
): { synced: boolean } {
  const workspaceDir = join(WORKSPACE_DIR, sessionId);
  const outputDir = join(PREVIEW_CONTENT_DIR, sessionId);

  // If this is a config file change, do a full regeneration
  if (filePath === PRIMARY_CONFIG_NAME || filePath === LEGACY_CONFIG_NAME) {
    generateSessionContent(sessionId);
    return { synced: true };
  }

  // Load config for variable substitution
  let variables: Record<string, string> = {};
  try {
    const result = loadConfig(workspaceDir);
    variables = result.variables;
  } catch {
    // Config might not exist yet
  }

  // Find the source file
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

  // We need to figure out where this file maps in the output.
  // Rebuild from config to get the page map, then find the mapping for this file.
  try {
    const { config } = loadConfig(workspaceDir);
    const artifacts = buildArtifacts(config);
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

  // Fallback: try to process the file directly
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
