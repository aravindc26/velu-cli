/**
 * Dynamic MDX source for preview mode.
 *
 * Instead of relying on fumadocs-mdx's build-time file scanning (which requires
 * `next dev` + chokidar), this module uses the `dynamic()` runtime API to compile
 * MDX files on-demand at request time. Content written after `next build` is
 * discovered by scanning the filesystem directly.
 *
 * Used only in preview mode (PREVIEW_MODE=true) — production builds still use
 * the standard `source.ts` with build-time collections.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loader } from 'fumadocs-core/source';
import { dynamic } from 'fumadocs-mdx/runtime/dynamic';
import type { LazyEntry } from 'fumadocs-mdx/runtime/dynamic';
import { openApiSidebarMethodBadgePlugin, createStatusBadgesPlugin } from '../engine-core/lib/source-plugins';
import { getLanguages } from '@/lib/velu';
import { loadSessionConfigSource } from '@/lib/preview-config';

// Import config exports + core options from source.config.ts so that dynamic()
// picks up the schema, remark/rehype plugins, etc.
import * as sourceConfigExports from '../source.config';

const PREVIEW_CONTENT_DIR = process.env.PREVIEW_CONTENT_DIR || './content';

function log(tag: string, msg: string, data?: Record<string, unknown>) {
  const payload = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[PREVIEW:${tag}] ${msg}${payload}`);
}

// ── Cache ──────────────────────────────────────────────────────────────────

// File-based invalidation signal. Next.js bundles API routes and page routes
// into separate module instances, so in-memory invalidation from the sync/init
// route handler does NOT clear the cache seen by the page renderer. Instead,
// the invalidation writes a timestamp to a file on disk which both sides can see.
const INVALIDATION_DIR = join(PREVIEW_CONTENT_DIR, '.invalidation');

function getInvalidationPath(sessionId: string): string {
  return join(INVALIDATION_DIR, `${sessionId}.stamp`);
}

function readInvalidationStamp(sessionId: string): number {
  const p = getInvalidationPath(sessionId);
  try {
    return Number(readFileSync(p, 'utf-8').trim()) || 0;
  } catch {
    return 0;
  }
}

function writeInvalidationStamp(sessionId: string): void {
  mkdirSync(INVALIDATION_DIR, { recursive: true });
  writeFileSync(getInvalidationPath(sessionId), String(Date.now()), 'utf-8');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sourceCache = new Map<string, { source: any; createdAt: number }>();

// Dynamic instance — singleton, initialized lazily
let dynamicInstance: Awaited<ReturnType<typeof dynamic>> | null = null;
let dynamicInitPromise: Promise<Awaited<ReturnType<typeof dynamic>>> | null = null;

async function getDynamic() {
  if (dynamicInstance) return dynamicInstance;
  if (dynamicInitPromise) return dynamicInitPromise;

  log('dynamic', 'Initializing new dynamic() instance');
  dynamicInitPromise = dynamic(
    sourceConfigExports,
    {
      environment: 'runtime',
      configPath: 'source.config.ts',
      outDir: '.source',
    },
  ).then((inst) => {
    dynamicInstance = inst;
    dynamicInitPromise = null;
    log('dynamic', 'dynamic() instance ready');
    return inst;
  });

  return dynamicInitPromise;
}

// ── File scanning ──────────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const output: Record<string, unknown> = {};
  const lines = match[1].split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const entry = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!entry) continue;
    const key = entry[1];
    let rawValue = entry[2].trim();
    // Strip quotes
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      rawValue = rawValue.slice(1, -1);
    }
    // Parse booleans
    if (rawValue === 'true') { output[key] = true; continue; }
    if (rawValue === 'false') { output[key] = false; continue; }
    output[key] = rawValue;
  }

  return output;
}

function scanContentDir(sessionDir: string): {
  entries: LazyEntry<Record<string, unknown>>[];
  metaFiles: Record<string, unknown>;
} {
  const entries: LazyEntry<Record<string, unknown>>[] = [];
  const metaFiles: Record<string, unknown> = {};

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.')) continue;
      const fullPath = join(dir, item.name);

      if (item.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relPath = relative(sessionDir, fullPath).replace(/\\/g, '/');

      if (item.name === 'meta.json') {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          metaFiles[relPath] = JSON.parse(content);
        } catch { /* skip invalid meta */ }
        continue;
      }

      if (!item.name.endsWith('.mdx') && !item.name.endsWith('.md')) continue;

      try {
        const content = readFileSync(fullPath, 'utf-8');
        const frontmatter = parseFrontmatter(content);

        // Ensure title exists
        if (!frontmatter.title) {
          const titleMatch = content.match(/^#\s+(.+)$/m);
          frontmatter.title = titleMatch ? titleMatch[1] : item.name.replace(/\.mdx?$/, '');
        }

        entries.push({
          info: {
            path: relPath,
            fullPath,
          },
          data: frontmatter,
        });
      } catch { /* skip unreadable files */ }
    }
  }

  walk(sessionDir);
  return { entries, metaFiles };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a fumadocs source loader for a specific session's content.
 * Scans the content directory at call time and compiles MDX on-demand.
 */
export async function getSessionSource(sessionId: string) {
  const cached = sourceCache.get(sessionId);
  if (cached) {
    const stamp = readInvalidationStamp(sessionId);
    if (stamp <= cached.createdAt) {
      const age = Date.now() - cached.createdAt;
      log('source', `Cache HIT for session ${sessionId}`, { ageMs: age });
      return cached.source;
    }
    log('source', `Cache STALE for session ${sessionId} (stamp=${stamp} > created=${cached.createdAt}), rebuilding`);
    sourceCache.delete(sessionId);
  } else {
    log('source', `Cache MISS for session ${sessionId}`);
  }

  const sessionDir = join(PREVIEW_CONTENT_DIR, sessionId);
  if (!existsSync(sessionDir)) {
    log('source', `Session dir does not exist: ${sessionDir}`);
    const emptySource = loader({
      baseUrl: '/',
      source: { files: [] },
    });
    return emptySource;
  }

  const dyn = await getDynamic();
  const { entries, metaFiles } = scanContentDir(sessionDir);

  log('source', `Scanned ${sessionDir}`, {
    entryCount: entries.length,
    metaFileCount: Object.keys(metaFiles).length,
  });

  const collection = await dyn.docs('docs', sessionDir, metaFiles, entries);
  const fumadocsSource = collection.toFumadocsSource();

  const configSource = loadSessionConfigSource(sessionId);
  const languages = configSource ? getLanguages(configSource) : [];
  const defaultLanguage = languages[0] ?? 'en';

  const src = loader({
    baseUrl: '/',
    source: fumadocsSource as any,
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

  sourceCache.set(sessionId, { source: src, createdAt: Date.now() });
  log('source', `Built and cached source for session ${sessionId}`, {
    pageCount: src.getPages().length,
  });
  return src;
}

/**
 * Invalidate the cached source for a session.
 * Writes a file-based timestamp so that ALL Next.js module instances
 * (API routes AND page routes) see the invalidation, even though they
 * run in separate bundles with separate in-memory Maps.
 */
export function invalidateSessionSource(sessionId: string): void {
  const had = sourceCache.has(sessionId);
  sourceCache.delete(sessionId);
  writeInvalidationStamp(sessionId);
  log('invalidate', `session=${sessionId} hadCache=${had} wroteStamp=true`);
}

/**
 * Get the page tree filtered to a specific session's content.
 * Unlike source.ts's synchronous version, this is async because
 * it may need to initialize the dynamic MDX compiler.
 */
export async function getSessionPageTree(sessionId: string) {
  const src = await getSessionSource(sessionId);
  const fullTree = src.getPageTree();

  // In preview-source, content is loaded directly from the session dir,
  // so the page tree is already scoped to that session's content.
  // No need to filter by session prefix — URLs are relative to the session.
  return fullTree;
}
