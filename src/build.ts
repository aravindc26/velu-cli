import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { generateThemeCss, type ThemeConfig, type VeluColors, type VeluStyling } from "./themes.js";

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
  theme?: string;
  colors?: VeluColors;
  appearance?: "system" | "light" | "dark";
  styling?: VeluStyling;
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
  theme?: string;
  colors?: { primary?: string; light?: string; dark?: string };
  appearance?: 'system' | 'light' | 'dark';
  styling?: { codeblocks?: { theme?: string | { light: string; dark: string } } };
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

  // ── 4. Generate theme CSS ─────────────────────────────────────────────────
  const themeCss = generateThemeCss({
    theme: config.theme,
    colors: config.colors,
    appearance: config.appearance,
    styling: config.styling,
  });
  writeFileSync(join(outDir, "src", "styles", "velu-theme.css"), themeCss, "utf-8");
  console.log(`🎨 Generated theme: ${config.theme || "mint"}`);

  // ── 5. Generate site config ────────────────────────────────────────────────
  // Build expressiveCode config for code block themes
  let expressiveCodeConfig = "";
  if (config.styling?.codeblocks?.theme) {
    const cbt = config.styling.codeblocks.theme;
    if (typeof cbt === "string") {
      expressiveCodeConfig = `\n      expressiveCode: { themes: ['${cbt}'] },`;
    } else {
      expressiveCodeConfig = `\n      expressiveCode: { themes: ['${cbt.dark}', '${cbt.light}'] },`;
    }
  }

  const astroConfig = `import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { ion } from 'starlight-ion-theme';
import { getSidebar } from './src/lib/velu.ts';

export default defineConfig({
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'Velu Docs',
      plugins: [ion()],
      components: {
        Sidebar: './src/components/Sidebar.astro',
        PageTitle: './src/components/PageTitle.astro',
        Footer: './src/components/Footer.astro',
      },
      customCss: ['./src/styles/velu-theme.css', './src/styles/tabs.css', './src/styles/assistant.css'],${expressiveCodeConfig}
      sidebar: getSidebar(),
    }),
  ],
});
`;
  writeFileSync(join(outDir, "_config.mjs"), astroConfig, "utf-8");
  console.log("⚙️  Generated site config");

  // ── 6. Generate Sidebar.astro — tabs at top + filtered content ─────────────
  const sidebarComponent = `---
import MobileMenuFooter from 'virtual:starlight/components/MobileMenuFooter';
import SidebarSublist from '@astrojs/starlight/components/SidebarSublist.astro';
import { getTabs, getTabSidebarMap } from '../lib/velu.ts';

const tabs = getTabs();
const tabSidebarMap = getTabSidebarMap();
const currentPath = Astro.url.pathname;

function isTabActive(tab: any, path: string): boolean {
  if (tab.href) return false;
  if (tab.pathPrefix === '__default__') {
    const otherPrefixes = tabs
      .filter((t: any) => t.pathPrefix && t.pathPrefix !== '__default__' && !t.href)
      .map((t: any) => t.pathPrefix);
    return !otherPrefixes.some((p: string) => path.startsWith('/' + p + '/'));
  }
  return path.startsWith('/' + tab.pathPrefix + '/');
}

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

<div class="velu-sidebar-tabs">
  {tabs.map((tab) => {
    if (tab.href) {
      return (
        <a href={tab.href} class="velu-sidebar-tab" target="_blank" rel="noopener noreferrer">
          {tab.icon && <span class="velu-sidebar-tab-icon" data-icon={tab.icon} />}
          <span>{tab.label}</span>
          <svg class="velu-external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
        </a>
      );
    }
    const active = isTabActive(tab, currentPath);
    const href = tab.firstPage ? '/' + tab.firstPage + '/' : '/';
    return (
      <a href={href} class:list={['velu-sidebar-tab', { active }]}>
        {tab.icon && <span class="velu-sidebar-tab-icon" data-icon={tab.icon} />}
        <span>{tab.label}</span>
      </a>
    );
  })}
</div>

<SidebarSublist sublist={filteredSidebar} />

<div class="md:sl-hidden">
  <MobileMenuFooter />
</div>
`;
  writeFileSync(join(outDir, "src", "components", "Sidebar.astro"), sidebarComponent, "utf-8");
  console.log("📋 Generated sidebar component");

  // ── 7. Generate PageTitle.astro — title row with copy page button ────────
  const pageTitleComponent = `---
const currentUrl = Astro.url.href;
const title = Astro.locals.starlightRoute.entry.data.title;
---

<div class="velu-title-row">
  <h1 id="_top">{title}</h1>
  <div class="velu-copy-page-container">
    <div class="velu-copy-split-btn">
      <button class="velu-copy-main-btn" data-action="direct-copy">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span class="velu-copy-label">Copy page</span>
      </button>
      <span class="velu-copy-sep"></span>
      <button class="velu-copy-caret-btn" aria-expanded="false" aria-haspopup="true">
        <svg class="velu-copy-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
    </div>
    <div class="velu-copy-dropdown" hidden>
      <button class="velu-copy-option" data-action="copy">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <div>
          <div class="velu-copy-option-title">Copy page</div>
          <div class="velu-copy-option-desc">Copy page as Markdown for LLMs</div>
        </div>
      </button>
      <a class="velu-copy-option" href={\`https://chatgpt.com/?prompt=Read+from+\${encodeURIComponent(currentUrl)}+so+I+can+ask+questions+about+it.\`} target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
        <div>
          <div class="velu-copy-option-title">Open in ChatGPT <span class="velu-external-arrow">&nearr;</span></div>
          <div class="velu-copy-option-desc">Ask questions about this page</div>
        </div>
      </a>
      <a class="velu-copy-option" href={\`https://claude.ai/new?q=Read+from+\${encodeURIComponent(currentUrl)}+so+I+can+ask+questions+about+it.\`} target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 200 200" style="overflow:visible" fill="currentColor"><path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></svg>
        <div>
          <div class="velu-copy-option-title">Open in Claude <span class="velu-external-arrow">&nearr;</span></div>
          <div class="velu-copy-option-desc">Ask questions about this page</div>
        </div>
      </a>
    </div>
  </div>
</div>

<script is:inline>
  (function init() {
    var caretBtn = document.querySelector('.velu-copy-caret-btn');
    var mainBtn = document.querySelector('.velu-copy-main-btn');
    var dropdown = document.querySelector('.velu-copy-dropdown');
    var label = document.querySelector('.velu-copy-label');
    if (!caretBtn || !mainBtn || !dropdown) return;

    function doCopy() {
      if (label) label.textContent = 'Copying...';
      var titleEl = document.querySelector('#_top');
      var article = document.querySelector('.sl-markdown-content') || document.querySelector('.content-panel') || document.querySelector('main');
      var text = '';
      if (titleEl) text = '# ' + titleEl.textContent + '\\n\\n';
      if (article) text += article.innerText;
      if (text) {
        navigator.clipboard.writeText(text).then(function() {
          if (label) label.textContent = 'Copied!';
          setTimeout(function() { if (label) label.textContent = 'Copy page'; }, 1500);
        });
      }
      dropdown.hidden = true;
      caretBtn.setAttribute('aria-expanded', 'false');
    }

    mainBtn.onclick = function(e) { e.stopPropagation(); doCopy(); };

    caretBtn.onclick = function(e) {
      e.stopPropagation();
      var open = dropdown.hidden;
      dropdown.hidden = !open;
      caretBtn.setAttribute('aria-expanded', String(open));
    };

    document.addEventListener('click', function() {
      dropdown.hidden = true;
      caretBtn.setAttribute('aria-expanded', 'false');
    });

    dropdown.onclick = function(e) { e.stopPropagation(); };

    var copyOpt = dropdown.querySelector('[data-action="copy"]');
    if (copyOpt) {
      copyOpt.onclick = function() { doCopy(); };
    }
  })();
</script>

<!-- AI Assistant Widget -->
<div class="velu-ask-bar" id="veluAskBar">
  <div class="velu-ask-bar-inner">
    <input type="text" class="velu-ask-input" id="veluAskInput" placeholder="Ask a question..." autocomplete="off" />
    <button class="velu-ask-submit" id="veluAskSubmit" aria-label="Send">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    </button>
  </div>
</div>

<div class="velu-assistant-panel velu-panel-closed" id="veluAssistantPanel">
  <div class="velu-assistant-header">
    <span class="velu-assistant-title">Assistant</span>
    <div class="velu-assistant-actions">
      <button class="velu-assistant-action" data-velu-action="expand" title="Expand" aria-label="Expand assistant" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
      <button class="velu-assistant-action" data-velu-action="reset" title="New chat" aria-label="New chat" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button class="velu-assistant-action" data-velu-action="close" title="Close" aria-label="Close assistant" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>
  <div class="velu-assistant-messages" id="veluAssistantMessages"></div>
  <div class="velu-assistant-input-area">
    <input type="text" class="velu-assistant-chat-input" id="veluAssistantChatInput" placeholder="Ask a question..." autocomplete="off" />
    <button class="velu-assistant-send" id="veluAssistantSend" aria-label="Send">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94l18-8.5a.75.75 0 000-1.38l-18-8.5z"/></svg>
    </button>
  </div>
</div>

<script is:inline>
(function veluAssistant() {
  var API_BASE = 'https://api.getvelu.com/api/v1/public/ai-assistant';
  var state = {
    conversationId: null,
    conversationToken: null,
    lastSeq: 0,
    eventSource: null,
    expanded: false,
    bootstrapped: false
  };

  var askBar = document.getElementById('veluAskBar');
  var askInput = document.getElementById('veluAskInput');
  var askSubmit = document.getElementById('veluAskSubmit');
  var panel = document.getElementById('veluAssistantPanel');
  var messagesEl = document.getElementById('veluAssistantMessages');
  var chatInput = document.getElementById('veluAssistantChatInput');
  var sendBtn = document.getElementById('veluAssistantSend');
  var closeBtn = document.getElementById('veluAssistantClose');
  var expandBtn = document.getElementById('veluAssistantExpand');
  var newChatBtn = document.getElementById('veluAssistantNewChat');

  if (!askBar || !panel) return;

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  if (askBar.parentElement !== document.body) {
    document.body.appendChild(askBar);
  }

  function saveState() {
    try {
      sessionStorage.setItem('velu-panel-open', isPanelOpen() ? '1' : '');
      sessionStorage.setItem('velu-panel-expanded', state.expanded ? '1' : '');
      sessionStorage.setItem('velu-panel-messages', messagesEl.innerHTML);
      sessionStorage.setItem('velu-conv-id', state.conversationId || '');
      sessionStorage.setItem('velu-conv-token', state.conversationToken || '');
      sessionStorage.setItem('velu-last-seq', String(state.lastSeq));
    } catch(e) {}
  }

  function openPanel() {
    panel.classList.remove('velu-panel-closed');
    askBar.classList.add('velu-ask-bar-hidden');
    document.documentElement.classList.add('velu-assistant-open');
    chatInput.focus();
    saveState();
  }

  function closePanel() {
    panel.classList.add('velu-panel-closed');
    askBar.classList.remove('velu-ask-bar-hidden');
    document.documentElement.classList.remove('velu-assistant-open');
    document.documentElement.classList.remove('velu-assistant-wide');
    if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
    saveState();
  }

  function resetChat() {
    state.conversationId = null;
    state.conversationToken = null;
    state.lastSeq = 0;
    if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
    messagesEl.innerHTML = '';
    chatInput.value = '';
    chatInput.focus();
    saveState();
  }

  function toggleExpand() {
    state.expanded = !state.expanded;
    panel.classList.toggle('velu-assistant-expanded', state.expanded);
    document.documentElement.classList.toggle('velu-assistant-wide', state.expanded);
    saveState();
  }

  // Expose to inline onclick handlers
  window._veluClosePanel = closePanel;
  window._veluResetChat = resetChat;
  window._veluToggleExpand = toggleExpand;

  function bootstrap() {
    if (state.bootstrapped) return Promise.resolve();
    return fetch(API_BASE + '/bootstrap', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(d) { state.bootstrapped = true; })
      .catch(function() {});
  }

  function isPanelOpen() {
    return !panel.classList.contains('velu-panel-closed');
  }

  function addMessage(role, content, citations) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'velu-msg velu-msg-' + role;
    var bubble = document.createElement('div');
    bubble.className = 'velu-msg-bubble velu-msg-bubble-' + role;
    bubble.innerHTML = formatContent(content, citations || []);
    msgDiv.appendChild(bubble);

    if (role === 'assistant' && citations && citations.length > 0) {
      var citDiv = document.createElement('div');
      citDiv.className = 'velu-msg-citations';
      citations.forEach(function(c, i) {
        var a = document.createElement('a');
        a.href = c.url || c.route_path || '#';
        a.className = 'velu-citation-link';
        a.textContent = '[' + (i + 1) + '] ' + (c.title || c.route_path || 'Source');
        a.target = '_blank';
        citDiv.appendChild(a);
      });
      msgDiv.appendChild(citDiv);
    }

    if (role === 'assistant') {
      var actions = document.createElement('div');
      actions.className = 'velu-msg-actions';
      actions.innerHTML = '<button class="velu-msg-action" title="Like"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>'
        + '<button class="velu-msg-action" title="Dislike"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></button>'
        + '<button class="velu-msg-action velu-msg-copy" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'
        + '<button class="velu-msg-action velu-msg-retry" title="Retry"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>';
      msgDiv.appendChild(actions);

      var copyBtn = actions.querySelector('.velu-msg-copy');
      if (copyBtn) {
        copyBtn.onclick = function() {
          navigator.clipboard.writeText(content);
          copyBtn.title = 'Copied!';
          setTimeout(function() { copyBtn.title = 'Copy'; }, 1500);
        };
      }
    }

    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    saveState();
    return bubble;
  }

  function formatContent(text, citations) {
    var html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\n/g, '<br>')
      .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
      .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    html = html.replace(/\\[(\\d+)\\]/g, function(m, n) {
      var idx = parseInt(n) - 1;
      var c = citations[idx];
      if (c) {
        return '<a href="' + (c.url || c.route_path || '#') + '" class="velu-citation-ref" target="_blank">[' + n + ']</a>';
      }
      return m;
    });
    return html;
  }

  function addThinking() {
    var div = document.createElement('div');
    div.className = 'velu-msg velu-msg-assistant';
    div.id = 'veluThinking';
    div.innerHTML = '<div class="velu-msg-bubble velu-msg-bubble-assistant"><span class="velu-thinking-dots"><span></span><span></span><span></span></span></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeThinking() {
    var el = document.getElementById('veluThinking');
    if (el) el.remove();
  }

  function connectSSE() {
    if (state.eventSource) state.eventSource.close();
    var url = API_BASE + '/conversations/' + state.conversationId + '/events?after_seq=' + state.lastSeq;
    state.eventSource = new EventSource(url);

    state.eventSource.addEventListener('assistant.completed', function(e) {
      removeThinking();
      try {
        var data = JSON.parse(e.data);
        var msg = data.message || data;
        if (msg.seq) state.lastSeq = msg.seq;
        addMessage('assistant', msg.content || '', msg.citations || []);
      } catch(err) {}
    });

    state.eventSource.addEventListener('assistant.error', function(e) {
      removeThinking();
      try {
        var data = JSON.parse(e.data);
        addMessage('assistant', data.error || 'Something went wrong. Please try again.', []);
      } catch(err) {
        addMessage('assistant', 'Something went wrong. Please try again.', []);
      }
    });

    state.eventSource.onerror = function() {};
  }

  function sendMessage(text) {
    if (!text.trim()) return;
    addMessage('user', text);
    addThinking();

    bootstrap().then(function() {
      return fetch(API_BASE + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          conversation_id: state.conversationId
        })
      });
    }).then(function(r) {
      if (r.status === 429) { removeThinking(); addMessage('assistant', 'Rate limited. Please wait a moment and try again.', []); return; }
      return r.json();
    }).then(function(data) {
      if (!data) return;
      if (data.conversation_id) state.conversationId = data.conversation_id;
      if (data.conversation_token) state.conversationToken = data.conversation_token;
      saveState();
      if (!state.eventSource || state.eventSource.readyState === 2) {
        connectSSE();
      }
    }).catch(function() {
      removeThinking();
      addMessage('assistant', 'Failed to connect. Please try again.', []);
    });
  }

  function handleAskSubmit() {
    var text = askInput.value.trim();
    if (!text) return;
    askInput.value = '';
    openPanel();
    sendMessage(text);
  }

  function handleChatSubmit() {
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    sendMessage(text);
  }

  askInput.onkeydown = function(e) { if (e.key === 'Enter') handleAskSubmit(); };
  askSubmit.onclick = handleAskSubmit;
  chatInput.onkeydown = function(e) { if (e.key === 'Enter') handleChatSubmit(); };
  sendBtn.onclick = handleChatSubmit;

  panel.addEventListener('click', function(e) {
    var actionBtn = e.target.closest('[data-velu-action]');
    if (!actionBtn) return;
    var action = actionBtn.getAttribute('data-velu-action');
    if (action === 'close') {
      closePanel();
    } else if (action === 'expand') {
      toggleExpand();
    } else if (action === 'reset') {
      resetChat();
    }
  });

  document.addEventListener('click', function(e) {
    var actionBtn = e.target.closest('[data-velu-action]');
    if (!actionBtn) return;
    var action = actionBtn.getAttribute('data-velu-action');
    if (action === 'close') {
      closePanel();
    } else if (action === 'expand') {
      toggleExpand();
    } else if (action === 'reset') {
      resetChat();
    }
  }, true);

  // Hide ask bar only when user scrolls to the very bottom
  window.addEventListener('scroll', function() {
    if (isPanelOpen()) return;
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight;
    var winHeight = window.innerHeight;
    if (docHeight <= winHeight + 10) return; // short pages: always show
    if (docHeight - scrollTop - winHeight < 60) {
      askBar.classList.add('velu-ask-bar-hidden');
    } else {
      askBar.classList.remove('velu-ask-bar-hidden');
    }
  }, { passive: true });

  document.onkeydown = function(e) {
    if (e.key === 'Escape' && isPanelOpen()) { closePanel(); }
  };

  // Restore panel state from sessionStorage on page load
  try {
    var savedOpen = sessionStorage.getItem('velu-panel-open');
    var savedExpanded = sessionStorage.getItem('velu-panel-expanded');
    var savedMessages = sessionStorage.getItem('velu-panel-messages');
    var savedConvId = sessionStorage.getItem('velu-conv-id');
    var savedConvToken = sessionStorage.getItem('velu-conv-token');
    var savedSeq = sessionStorage.getItem('velu-last-seq');
    if (savedConvId) state.conversationId = savedConvId;
    if (savedConvToken) state.conversationToken = savedConvToken;
    if (savedSeq) state.lastSeq = parseInt(savedSeq, 10) || 0;
    if (savedMessages) messagesEl.innerHTML = savedMessages;
    if (savedExpanded === '1') {
      state.expanded = true;
      panel.classList.add('velu-assistant-expanded');
      document.documentElement.classList.add('velu-assistant-wide');
    }
    if (savedOpen === '1') {
      openPanel();
      if (state.conversationId) connectSSE();
    }
  } catch(e) {}

  bootstrap();
})();
</script>
`;
  writeFileSync(join(outDir, "src", "components", "PageTitle.astro"), pageTitleComponent, "utf-8");
  console.log("📋 Generated page title component");

  // ── 7b. Generate Footer.astro — Powered by Velu ────────────────────────
  const footerComponent = `---
import EditLink from 'virtual:starlight/components/EditLink';
import LastUpdated from 'virtual:starlight/components/LastUpdated';
import Pagination from 'virtual:starlight/components/Pagination';
---

<footer class="sl-flex">
  <div class="meta sl-flex">
    <EditLink />
    <LastUpdated />
  </div>
  <Pagination />
  <div class="velu-powered-by">
    <a href="https://getvelu.com" target="_blank" rel="noopener noreferrer">Powered by Velu</a>
  </div>
</footer>

<style>
  footer {
    flex-direction: column;
    gap: 1.5rem;
  }
  .meta {
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
  }
  .velu-powered-by {
    text-align: right;
    padding: 1rem 2rem 0.5rem 0;
  }
  .velu-powered-by a {
    font-size: 1.4rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    color: rgba(160, 165, 180, 0.45);
    text-decoration: none;
    transition: color 0.25s ease;
  }
  .velu-powered-by a:hover {
    color: rgba(220, 225, 240, 0.95);
  }
</style>
`;
  writeFileSync(join(outDir, "src", "components", "Footer.astro"), footerComponent, "utf-8");
  console.log("📋 Generated footer component");

  // ── 8. Generate tabs.css ──────────────────────────────────────────────────
  const tabsCss = `/* ── Velu sidebar tabs ─────────────────────────────────────────────────── */

:root {
  --sl-sidebar-width: 16rem;
}

.velu-sidebar-tabs {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem;
  margin-bottom: 1rem;
  background-color: var(--sl-color-bg);
  border: 1px solid var(--sl-color-gray-5);
  border-radius: 0.5rem;
}

.velu-sidebar-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  font-size: var(--sl-text-sm);
  font-weight: 600;
  color: var(--sl-color-gray-3);
  text-decoration: none;
  border-radius: 0.375rem;
  transition: color 0.15s, background-color 0.15s;
}

.velu-sidebar-tab:hover {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-6);
}

.velu-sidebar-tab.active {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-6);
}

:root[data-theme='light'] .velu-sidebar-tab.active {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-7);
}

.velu-external-icon {
  opacity: 0.4;
  flex-shrink: 0;
  margin-inline-start: auto;
}

/* ── Copy page button ─────────────────────────────────────────────────── */

.velu-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.velu-title-row h1 {
  margin: 0;
}

.velu-copy-page-container {
  position: relative;
  flex-shrink: 0;
  margin-top: 0.35rem;
}

.velu-copy-split-btn {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--sl-color-gray-5);
  border-radius: 999px;
  background: var(--sl-color-bg-nav);
}

.velu-copy-main-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem 0.35rem 0.75rem;
  font-size: var(--sl-text-xs);
  font-weight: 500;
  color: var(--sl-color-gray-3);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s;
}

.velu-copy-main-btn:hover {
  color: var(--sl-color-white);
}

.velu-copy-sep {
  width: 1px;
  height: 14px;
  background-color: var(--sl-color-gray-5);
  flex-shrink: 0;
}

.velu-copy-caret-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.5rem;
  background: none;
  border: none;
  color: var(--sl-color-gray-3);
  cursor: pointer;
  transition: color 0.15s;
}

.velu-copy-caret-btn:hover {
  color: var(--sl-color-white);
}

.velu-copy-chevron {
  transition: transform 0.15s;
}

.velu-copy-caret-btn[aria-expanded='true'] .velu-copy-chevron {
  transform: rotate(180deg);
}

.velu-copy-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 100;
  min-width: 16rem;
  padding: 0.35rem;
  background: var(--sl-color-bg-nav);
  border: 1px solid var(--sl-color-gray-5);
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.velu-copy-option {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.6rem;
  font: inherit;
  font-size: var(--sl-text-sm);
  color: var(--sl-color-gray-2);
  text-align: left;
  text-decoration: none;
  background: none;
  border: none;
  border-radius: 0.35rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.velu-copy-option:hover {
  background-color: var(--sl-color-gray-6);
}

.velu-copy-option svg {
  flex-shrink: 0;
  opacity: 0.7;
  margin-top: 0.15rem;
  overflow: visible;
}

.velu-copy-option-title {
  font-weight: 500;
  line-height: 1.3;
}

.velu-copy-option-desc {
  font-size: var(--sl-text-xs);
  color: var(--sl-color-gray-3);
  line-height: 1.3;
}

.velu-external-arrow {
  font-size: 0.75em;
  opacity: 0.5;
}
`;
  writeFileSync(join(outDir, "src", "styles", "tabs.css"), tabsCss, "utf-8");
  console.log("🎨 Generated tabs.css");

  // ── 9. Generate assistant.css ───────────────────────────────────────────
  const assistantCss = `/* ── Velu AI Assistant ─────────────────────────────────────────────────── */

/* Fixed bottom ask bar */
.velu-ask-bar {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  width: 100%;
  max-width: 36rem;
  padding: 0 1rem;
  transition: opacity 0.2s, transform 0.2s;
}

.velu-ask-bar-hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(1rem);
}

.velu-ask-bar-inner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--sl-color-bg-nav);
  border: 1px solid var(--sl-color-gray-5);
  border-radius: 0.75rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.velu-ask-icon {
  flex-shrink: 0;
  color: var(--sl-color-gray-3);
}

.velu-ask-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font: inherit;
  font-size: var(--sl-text-sm);
  color: var(--sl-color-white);
}

.velu-ask-input::placeholder {
  color: var(--sl-color-gray-3);
}


.velu-ask-submit {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--sl-color-accent);
  color: var(--sl-color-accent-high);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: opacity 0.15s;
}

.velu-ask-submit:hover { opacity: 0.85; }

/* Right-side assistant panel */
.velu-assistant-panel {
  position: fixed;
  top: var(--sl-nav-height, 3.5rem);
  right: 0;
  bottom: 0;
  width: 22rem;
  z-index: 50;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--sl-color-bg);
  border-left: 1px solid var(--sl-color-gray-5);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
  transition: width 0.2s;
}

.velu-panel-closed { display: none !important; }

.velu-assistant-expanded { width: 40rem; }

.velu-assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--sl-color-gray-5);
  flex-shrink: 0;
}

.velu-assistant-title {
  font-weight: 600;
  font-size: var(--sl-text-base);
  color: var(--sl-color-white);
}

.velu-assistant-actions {
  display: flex;
  gap: 0.25rem;
}

.velu-assistant-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 0.25rem;
  color: var(--sl-color-gray-3);
  cursor: pointer;
  pointer-events: auto;
  transition: color 0.15s, background-color 0.15s;
}

.velu-assistant-action:hover {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-6);
}

/* Messages area */
.velu-assistant-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.velu-msg {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.velu-msg-user { align-items: flex-end; }
.velu-msg-assistant { align-items: flex-start; }

.velu-msg-bubble {
  max-width: 85%;
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  font-size: var(--sl-text-sm);
  line-height: 1.55;
  word-break: break-word;
}

.velu-msg-bubble code {
  background: var(--sl-color-gray-6);
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
  font-size: 0.85em;
}

.velu-msg-bubble-user {
  background: var(--sl-color-accent);
  color: var(--sl-color-accent-high);
  border-bottom-right-radius: 0.2rem;
}

.velu-msg-bubble-assistant {
  background: var(--sl-color-gray-6);
  color: var(--sl-color-white);
  border-bottom-left-radius: 0.2rem;
}

/* Citations */
.velu-msg-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding-left: 0.25rem;
}

.velu-citation-link {
  font-size: var(--sl-text-xs);
  color: var(--sl-color-accent);
  text-decoration: none;
  padding: 0.15rem 0.4rem;
  background: var(--sl-color-gray-6);
  border-radius: 0.25rem;
  transition: background-color 0.15s;
}

.velu-citation-link:hover {
  background: var(--sl-color-gray-5);
}

.velu-citation-ref {
  color: var(--sl-color-accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.8em;
  vertical-align: super;
}

/* Message actions */
.velu-msg-actions {
  display: flex;
  gap: 0.15rem;
  padding-left: 0.25rem;
}

.velu-msg-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 0.25rem;
  color: var(--sl-color-gray-4);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
}

.velu-msg-action:hover {
  color: var(--sl-color-white);
  background-color: var(--sl-color-gray-6);
}

/* Thinking dots */
.velu-thinking-dots {
  display: inline-flex;
  gap: 0.3rem;
  padding: 0.2rem 0;
}

.velu-thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sl-color-gray-3);
  animation: veluDotPulse 1.2s infinite;
}

.velu-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.velu-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes veluDotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* Chat input area */
.velu-assistant-input-area {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--sl-color-gray-5);
  flex-shrink: 0;
}

.velu-assistant-chat-input {
  flex: 1;
  background: var(--sl-color-gray-6);
  border: 1px solid var(--sl-color-gray-5);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font: inherit;
  font-size: var(--sl-text-sm);
  color: var(--sl-color-white);
  outline: none;
  transition: border-color 0.15s;
}

.velu-assistant-chat-input:focus {
  border-color: var(--sl-color-accent);
}

.velu-assistant-chat-input::placeholder {
  color: var(--sl-color-gray-3);
}

.velu-assistant-send {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--sl-color-accent);
  color: var(--sl-color-accent-high);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: opacity 0.15s;
}

.velu-assistant-send:hover { opacity: 0.85; }

/* Squeeze page layout when panel is open */
html.velu-assistant-open body {
  margin-right: 22rem;
  transition: margin-right 0.25s ease;
}

html.velu-assistant-wide body {
  margin-right: 40rem;
}

html.velu-assistant-open .header {
  padding-right: 22rem;
  transition: padding-right 0.25s ease;
}

html.velu-assistant-wide .header {
  padding-right: 40rem;
}

html.velu-assistant-open .velu-ask-bar {
  right: 22rem;
  left: auto;
  transform: none;
}

html.velu-assistant-wide .velu-ask-bar {
  right: 40rem;
}

/* Responsive */
@media (max-width: 50rem) {
  .velu-assistant-panel {
    width: 100%;
  }
  .velu-assistant-expanded {
    width: 100%;
  }
  .velu-ask-bar {
    max-width: calc(100% - 2rem);
  }
  html.velu-assistant-open body {
    margin-right: 0;
  }
  html.velu-assistant-wide body {
    margin-right: 0;
  }
}
`;
  writeFileSync(join(outDir, "src", "styles", "assistant.css"), assistantCss, "utf-8");
  console.log("🤖 Generated assistant.css");

  // ── 10. Static boilerplate ─────────────────────────────────────────────────
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
      astro: "^5.12.0",
      "@astrojs/starlight": "^0.35.0",
      sharp: "^0.33.0",
      "starlight-ion-theme": "^2.3.0",
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

  // ── 10. Generate _server.mjs — programmatic dev/build/preview ───────────────
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

  // ── 11. Generate .gitignore ──────────────────────────────────────────────
  writeFileSync(
    join(outDir, ".gitignore"),
    `.astro/\nnode_modules/\ndist/\n`,
    "utf-8"
  );

  console.log("📦 Generated boilerplate");
  console.log(`\n✅ Site generated at: ${outDir}`);
}

export { build };
