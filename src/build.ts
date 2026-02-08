import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";

// ── Types (used only by build.ts for page copying) ─────────────────────────────

interface VeluGroup {
  group: string;
  pages: (string | VeluGroup)[];
}

interface VeluTab {
  tab: string;
  href?: string;
  pages?: string[];
  groups?: VeluGroup[];
}

interface VeluConfig {
  $schema?: string;
  navigation: {
    tabs?: VeluTab[];
    groups?: VeluGroup[];
    pages?: string[];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadConfig(docsDir: string): VeluConfig {
  const raw = readFileSync(join(docsDir, "velu.json"), "utf-8");
  return JSON.parse(raw);
}

function pageLabelFromSlug(slug: string): string {
  const last = slug.split("/").pop()!;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function collectPagesFromGroup(group: VeluGroup): string[] {
  const pages: string[] = [];
  for (const item of group.pages) {
    if (typeof item === "string") pages.push(item);
    else pages.push(...collectPagesFromGroup(item));
  }
  return pages;
}

function collectAllPages(config: VeluConfig): string[] {
  const pages: string[] = [];
  const nav = config.navigation;
  if (nav.pages) pages.push(...nav.pages);
  if (nav.groups) for (const g of nav.groups) pages.push(...collectPagesFromGroup(g));
  if (nav.tabs) {
    for (const tab of nav.tabs) {
      if (tab.pages) pages.push(...tab.pages);
      if (tab.groups) for (const g of tab.groups) pages.push(...collectPagesFromGroup(g));
    }
  }
  return pages;
}

// ── Build ──────────────────────────────────────────────────────────────────────

function build(docsDir: string, outDir: string) {
  console.log(`📖 Loading velu.json from: ${docsDir}`);
  const config = loadConfig(docsDir);

  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }

  // Create directories
  mkdirSync(join(outDir, "src", "content", "docs"), { recursive: true });
  mkdirSync(join(outDir, "src", "components"), { recursive: true });
  mkdirSync(join(outDir, "src", "lib"), { recursive: true });
  mkdirSync(join(outDir, "src", "styles"), { recursive: true });
  mkdirSync(join(outDir, "public"), { recursive: true });

  // ── 1. Copy velu.json into the Astro project ─────────────────────────────
  copyFileSync(join(docsDir, "velu.json"), join(outDir, "velu.json"));
  console.log("📋 Copied velu.json");

  // ── 2. Copy all referenced .md files ──────────────────────────────────────
  const allPages = collectAllPages(config);
  for (const page of allPages) {
    const srcPath = join(docsDir, `${page}.md`);
    const destPath = join(outDir, "src", "content", "docs", `${page}.md`);

    if (!existsSync(srcPath)) {
      console.warn(`⚠️  Missing: ${srcPath}`);
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });

    let content = readFileSync(srcPath, "utf-8");
    if (!content.startsWith("---")) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(page);
      if (titleMatch) {
        content = content.replace(/^#\s+.+$/m, "").trimStart();
      }
      content = `---\ntitle: "${title}"\n---\n\n${content}`;
    }

    writeFileSync(destPath, content, "utf-8");
  }
  console.log(`📄 Copied ${allPages.length} pages`);

  // ── 3. Generate src/lib/velu.ts — the single source of truth ──────────────
  // This module reads velu.json at Astro build/render time. No hardcoded data.
  const veluLib = `import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VeluGroup {
  group: string;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  pages: (string | VeluGroup)[];
}

export interface VeluTab {
  tab: string;
  icon?: string;
  href?: string;
  pages?: string[];
  groups?: VeluGroup[];
}

export interface VeluConfig {
  $schema?: string;
  navigation: {
    tabs?: VeluTab[];
    groups?: VeluGroup[];
    pages?: string[];
  };
}

export interface TabMeta {
  label: string;
  icon?: string;
  href?: string;
  pathPrefix: string;
  firstPage?: string;
}

// ── Load config ─────────────────────────────────────────────────────────────

let _cachedConfig: VeluConfig | null = null;

export function loadVeluConfig(): VeluConfig {
  if (_cachedConfig) return _cachedConfig;
  const configPath = resolve(process.cwd(), 'velu.json');
  const raw = readFileSync(configPath, 'utf-8');
  _cachedConfig = JSON.parse(raw);
  return _cachedConfig!;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectPagesFromGroup(group: VeluGroup): string[] {
  const pages: string[] = [];
  for (const item of group.pages) {
    if (typeof item === 'string') pages.push(item);
    else pages.push(...collectPagesFromGroup(item));
  }
  return pages;
}

function collectTabPages(tab: VeluTab): string[] {
  const pages: string[] = [];
  if (tab.pages) pages.push(...tab.pages);
  if (tab.groups) for (const g of tab.groups) pages.push(...collectPagesFromGroup(g));
  return pages;
}

function detectPathPrefix(slugs: string[]): string {
  if (slugs.length === 0) return '';
  const first = slugs[0];
  const idx = first.indexOf('/');
  if (idx === -1) return '';
  const prefix = first.substring(0, idx);
  if (slugs.every((s) => s.startsWith(prefix + '/'))) return prefix;
  return '';
}

function veluGroupToSidebar(group: VeluGroup): any {
  const items: any[] = [];
  for (const item of group.pages) {
    if (typeof item === 'string') items.push(item);
    else items.push(veluGroupToSidebar(item));
  }
  const result: any = { label: group.group, items };
  if (group.tag) result.badge = group.tag;
  if (group.expanded === false) result.collapsed = true;
  return result;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Build the full Starlight sidebar array from velu.json */
export function getSidebar(): any[] {
  const config = loadVeluConfig();
  const nav = config.navigation;
  const sidebar: any[] = [];

  // Default groups
  if (nav.groups) {
    for (const group of nav.groups) sidebar.push(veluGroupToSidebar(group));
  }

  // Default standalone pages
  if (nav.pages) {
    for (const page of nav.pages) sidebar.push(page);
  }

  // Tab content as top-level groups
  if (nav.tabs) {
    for (const tab of nav.tabs) {
      if (tab.href) continue;
      const items: any[] = [];
      if (tab.groups) for (const g of tab.groups) items.push(veluGroupToSidebar(g));
      if (tab.pages) for (const p of tab.pages) items.push(p);
      sidebar.push({ label: tab.tab, items });
    }
  }

  return sidebar;
}

/** Get tab metadata for the header navigation */
export function getTabs(): TabMeta[] {
  const config = loadVeluConfig();
  const nav = config.navigation;
  const tabs: TabMeta[] = [];

  // Default "Docs" tab from groups/pages
  const defaultPages: string[] = [];
  if (nav.groups) for (const g of nav.groups) defaultPages.push(...collectPagesFromGroup(g));
  if (nav.pages) defaultPages.push(...nav.pages);

  if (defaultPages.length > 0) {
    tabs.push({
      label: 'Docs',
      icon: 'book-open',
      pathPrefix: detectPathPrefix(defaultPages) || '__default__',
      firstPage: defaultPages[0],
    });
  }

  if (nav.tabs) {
    for (const tab of nav.tabs) {
      if (tab.href) {
        tabs.push({ label: tab.tab, icon: tab.icon, href: tab.href, pathPrefix: '' });
      } else {
        const tabPages = collectTabPages(tab);
        tabs.push({
          label: tab.tab,
          icon: tab.icon,
          pathPrefix: detectPathPrefix(tabPages) || tabPages[0]?.split('/')[0] || '',
          firstPage: tabPages[0],
        });
      }
    }
  }

  return tabs;
}

/** Get the mapping of path prefix → sidebar group labels for filtering */
export function getTabSidebarMap(): Record<string, string[]> {
  const config = loadVeluConfig();
  const nav = config.navigation;
  const map: Record<string, string[]> = {};

  // Default tab owns top-level groups
  const defaultLabels: string[] = [];
  if (nav.groups) for (const g of nav.groups) defaultLabels.push(g.group);
  map['__default__'] = defaultLabels;

  if (nav.tabs) {
    for (const tab of nav.tabs) {
      if (tab.href) continue;
      const tabPages = collectTabPages(tab);
      const prefix = detectPathPrefix(tabPages) || tabPages[0]?.split('/')[0] || '';
      map[prefix] = [tab.tab];
    }
  }

  return map;
}
`;
  writeFileSync(join(outDir, "src", "lib", "velu.ts"), veluLib, "utf-8");
  console.log("📚 Generated config module");

  // ── 4. Generate site config ────────────────────────────────────────────────
  const astroConfig = `import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { getSidebar } from './src/lib/velu.ts';

export default defineConfig({
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'Velu Docs',
      components: {
        Header: './src/components/Header.astro',
        Sidebar: './src/components/Sidebar.astro',
      },
      customCss: ['./src/styles/tabs.css'],
      sidebar: getSidebar(),
    }),
  ],
});
`;
  writeFileSync(join(outDir, "_config.mjs"), astroConfig, "utf-8");
  console.log("⚙️  Generated site config");

  // ── 5. Generate Header.astro — reads tabs from velu.ts ────────────────────
  const headerComponent = `---
import Default from '@astrojs/starlight/components/Header.astro';
import { getTabs } from '../lib/velu.ts';

const tabs = getTabs();
const currentPath = Astro.url.pathname;

function isTabActive(tab: any, path: string): boolean {
  if (tab.href) return false;
  if (tab.pathPrefix === '__default__') {
    const otherPrefixes = tabs
      .filter((t) => t.pathPrefix && t.pathPrefix !== '__default__' && !t.href)
      .map((t) => t.pathPrefix);
    return !otherPrefixes.some((p) => path.startsWith('/' + p + '/'));
  }
  return path.startsWith('/' + tab.pathPrefix + '/');
}
---

<Default {...Astro.props}>
  <slot />
</Default>

<nav class="velu-tabs">
  <div class="velu-tabs-inner">
    {tabs.map((tab) => {
      if (tab.href) {
        return (
          <a href={tab.href} class="velu-tab" target="_blank" rel="noopener noreferrer">
            {tab.label}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
          </a>
        );
      }
      const active = isTabActive(tab, currentPath);
      const href = tab.firstPage ? '/' + tab.firstPage + '/' : '/';
      return (
        <a href={href} class:list={['velu-tab', { active }]}>
          {tab.label}
        </a>
      );
    })}
  </div>
</nav>
`;
  writeFileSync(join(outDir, "src", "components", "Header.astro"), headerComponent, "utf-8");
  console.log("🧩 Generated header component");

  // ── 6. Generate Sidebar.astro — reads filter map from velu.ts ─────────────
  const sidebarComponent = `---
import MobileMenuFooter from 'virtual:starlight/components/MobileMenuFooter';
import SidebarPersister from '@astrojs/starlight/components/SidebarPersister.astro';
import SidebarSublist from '@astrojs/starlight/components/SidebarSublist.astro';
import { getTabSidebarMap } from '../lib/velu.ts';

const tabSidebarMap = getTabSidebarMap();
const currentPath = Astro.url.pathname;

function getActivePrefix(path: string): string {
  const prefixes = Object.keys(tabSidebarMap).filter(p => p !== '__default__');
  for (const prefix of prefixes) {
    if (path.startsWith('/' + prefix + '/')) return prefix;
  }
  return '__default__';
}

const activePrefix = getActivePrefix(currentPath);
const visibleLabels = new Set(tabSidebarMap[activePrefix] || []);

const { sidebar } = Astro.locals.starlightRoute;
const filteredSidebar = sidebar.filter((entry: any) => {
  if (entry.type === 'group') return visibleLabels.has(entry.label);
  return activePrefix === '__default__';
});
---

<SidebarPersister>
  <SidebarSublist sublist={filteredSidebar} />
</SidebarPersister>

<div class="md:sl-hidden">
  <MobileMenuFooter />
</div>
`;
  writeFileSync(join(outDir, "src", "components", "Sidebar.astro"), sidebarComponent, "utf-8");
  console.log("📋 Generated sidebar component");

  // ── 7. Generate tabs.css ──────────────────────────────────────────────────
  const tabsCss = `/* ── Velu layout overrides ──────────────────────────────────────────────── */

:root {
  --sl-nav-height: 6rem;
}

/* Fixed header: flex column, no bottom padding — tab bar sits at the bottom */
.page > header.header {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

/* Standard nav content fills the top */
.page > header.header > .header.sl-flex {
  height: auto;
  flex: 1;
}

/* ── Tab bar ───────────────────────────────────────────────────────────── */

.velu-tabs {
  flex-shrink: 0;
  /* Stretch to full header width past its padding */
  margin-inline: calc(-1 * var(--sl-nav-pad-x));
  padding-inline: var(--sl-nav-pad-x);
  background: var(--sl-color-bg-nav);
}

.velu-tabs-inner {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
}

.velu-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.85rem;
  font-size: var(--sl-text-sm);
  font-weight: 500;
  color: var(--sl-color-gray-3);
  text-decoration: none;
  border-radius: 0.375rem;
  transition: color 0.15s, background-color 0.15s;
  white-space: nowrap;
}

.velu-tab:hover {
  color: var(--sl-color-gray-1);
  background-color: var(--sl-color-gray-6);
}

.velu-tab.active {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-5);
}

.velu-tab svg {
  opacity: 0.5;
  flex-shrink: 0;
}
`;
  writeFileSync(join(outDir, "src", "styles", "tabs.css"), tabsCss, "utf-8");
  console.log("🎨 Generated tabs.css");

  // ── 8. Static boilerplate ─────────────────────────────────────────────────
  const astroPkg = {
    name: "velu-docs-site",
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      dev: "astro dev",
      build: "astro build",
      preview: "astro preview",
    },
    dependencies: {
      astro: "^5.1.0",
      "@astrojs/starlight": "^0.32.0",
      sharp: "^0.33.0",
    },
  };
  writeFileSync(join(outDir, "package.json"), JSON.stringify(astroPkg, null, 2) + "\n", "utf-8");

  writeFileSync(
    join(outDir, "tsconfig.json"),
    JSON.stringify({ extends: "astro/tsconfigs/strict" }, null, 2) + "\n",
    "utf-8"
  );

  const firstPage = allPages[0] || "quickstart";
  writeFileSync(
    join(outDir, "src", "content", "docs", "index.mdx"),
    `---\ntitle: "Welcome to Velu Docs"\ndescription: Documentation powered by Velu\n---\n\nWelcome to the documentation. Head over to the [Quickstart](/${firstPage}/) to get started.\n`,
    "utf-8"
  );

  writeFileSync(
    join(outDir, "src", "content.config.ts"),
    `import { defineCollection } from 'astro:content';\nimport { docsSchema } from '@astrojs/starlight/schema';\n\nexport const collections = {\n  docs: defineCollection({ schema: docsSchema() }),\n};\n`,
    "utf-8"
  );

  // ── 9. Generate _server.mjs — programmatic dev/build/preview ────────────────
  const serverScript = `import { dev, build, preview } from 'astro';
import { watch } from 'node:fs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative, extname, join } from 'node:path';

// ── Docs directory (parent of .velu-out) ────────────────────────────────────
const docsDir = resolve('..');
const contentDir = resolve('src', 'content', 'docs');

// ── Page processing (mirrors build.ts logic) ────────────────────────────────
function pageLabelFromSlug(slug) {
  const last = slug.split('/').pop() || slug;
  return last.replace(/[-_]/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
}

function processPage(srcPath, destPath, slug) {
  let content = readFileSync(srcPath, 'utf-8');
  if (!content.startsWith('---')) {
    const titleMatch = content.match(/^#\\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
    if (titleMatch) {
      content = content.replace(/^#\\s+.+$/m, '').trimStart();
    }
    content = '---\\ntitle: "' + title + '"\\n---\\n\\n' + content;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, 'utf-8');
}

function startWatcher() {
  const debounce = new Map();

  watch(docsDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Ignore changes inside .velu-out itself
    if (filename.startsWith('.velu-out')) return;
    // Ignore node_modules, hidden dirs
    if (filename.includes('node_modules') || filename.startsWith('.')) return;

    // Debounce — avoid duplicate events
    if (debounce.has(filename)) clearTimeout(debounce.get(filename));
    debounce.set(filename, setTimeout(() => {
      debounce.delete(filename);
      const srcPath = join(docsDir, filename);
      if (!existsSync(srcPath)) return;

      if (filename === 'velu.json') {
        copyFileSync(srcPath, resolve('velu.json'));
        console.log('  \\x1b[32m↻\\x1b[0m  velu.json updated');
        return;
      }

      if (extname(filename) === '.md') {
        const slug = filename.replace(/\\\\/g, '/').replace(/\\.md$/, '');
        const destPath = join(contentDir, slug + '.md');
        try {
          processPage(srcPath, destPath, slug);
          console.log('  \\x1b[32m↻\\x1b[0m  ' + slug);
        } catch (e) {
          console.error('  \\x1b[31m✗\\x1b[0m  Failed to sync ' + filename + ': ' + e.message);
        }
      }
    }, 100));
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'dev';
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : 4321;

if (command === 'dev') {
  const server = await dev({
    root: '.',
    configFile: './_config.mjs',
    server: { port },
    logLevel: 'silent',
  });
  const addr = server.address;
  console.log('');
  console.log('  \\x1b[36mvelu\\x1b[0m  v0.1.0  ready');
  console.log('');
  console.log('  ┃ Local    \\x1b[36mhttp://localhost:' + addr.port + '/\\x1b[0m');
  console.log('  ┃ Network  use --host to expose');
  console.log('');
  console.log('  watching for file changes...');
  startWatcher();
} else if (command === 'build') {
  console.log('\\n  Building site...\\n');
  await build({ root: '.', configFile: './_config.mjs', logLevel: 'warn' });
  console.log('\\n  ✅ Site built successfully.\\n');
} else if (command === 'preview') {
  const server = await preview({
    root: '.',
    configFile: './_config.mjs',
    server: { port },
    logLevel: 'silent',
  });
  const addr = server.address;
  console.log('');
  console.log('  \\x1b[36mvelu\\x1b[0m  preview');
  console.log('');
  console.log('  ┃ Local    \\x1b[36mhttp://localhost:' + addr.port + '/\\x1b[0m');
  console.log('');
}
`;
  writeFileSync(join(outDir, "_server.mjs"), serverScript, "utf-8");

  // ── 10. Generate .gitignore ──────────────────────────────────────────────
  writeFileSync(
    join(outDir, ".gitignore"),
    `.astro/\nnode_modules/\ndist/\n`,
    "utf-8"
  );

  console.log("📦 Generated boilerplate");
  console.log(`\n✅ Site generated at: ${outDir}`);
}

export { build };
