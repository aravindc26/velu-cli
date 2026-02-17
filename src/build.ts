import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generateThemeCss, resolveThemeName, type VeluColors, type VeluStyling } from "./themes.js";
import { normalizeConfigNavigation } from "./navigation-normalize.js";

// ── Engine directory (shipped with the CLI package) ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGED_ENGINE_DIR = join(__dirname, "engine");
const DEV_ENGINE_DIR = join(__dirname, "..", "src", "engine");
const ENGINE_DIR = existsSync(DEV_ENGINE_DIR) ? DEV_ENGINE_DIR : PACKAGED_ENGINE_DIR;
const PRIMARY_CONFIG_NAME = "docs.json";
const LEGACY_CONFIG_NAME = "velu.json";

function resolveConfigPath(docsDir: string): string {
  const primary = join(docsDir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  const legacy = join(docsDir, LEGACY_CONFIG_NAME);
  if (existsSync(legacy)) return legacy;
  throw new Error(`No ${PRIMARY_CONFIG_NAME} or ${LEGACY_CONFIG_NAME} found in ${docsDir}`);
}

// ── Types (used only by build.ts for page copying) ─────────────────────────────

interface VeluSeparator {
  separator: string;
}

interface VeluLink {
  href: string;
  label: string;
  icon?: string;
  iconType?: string;
}

interface VeluAnchor {
  anchor: string;
  href?: string;
  icon?: string;
  iconType?: string;
  color?: {
    light: string;
    dark: string;
  };
  tabs?: VeluTab[];
  hidden?: boolean;
}

interface VeluGlobalTab {
  tab: string;
  href: string;
  icon?: string;
  iconType?: string;
}

interface VeluGroup {
  group: string;
  slug: string;
  icon?: string;
  iconType?: string;
  expanded?: boolean;
  description?: string;
  hidden?: boolean;
  pages: (string | VeluGroup | VeluSeparator | VeluLink)[];
}

interface VeluMenuItem {
  item: string;
  icon?: string;
  iconType?: string;
  groups?: VeluGroup[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluTab {
  tab: string;
  slug: string;
  icon?: string;
  iconType?: string;
  href?: string;
  pages?: (string | VeluSeparator | VeluLink)[];
  groups?: VeluGroup[];
  menu?: VeluMenuItem[];
}

interface VeluLanguageNav {
  language: string;
  tabs: VeluTab[];
}

interface VeluProductNav {
  product: string;
  icon?: string;
  iconType?: string;
  tabs?: VeluTab[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluVersionNav {
  version: string;
  tabs: VeluTab[];
}

interface VeluConfig {
  $schema?: string;
  theme?: string;
  colors?: VeluColors;
  appearance?: "system" | "light" | "dark";
  styling?: VeluStyling;
  languages?: string[];
  navigation: {
    tabs?: VeluTab[];
    languages?: VeluLanguageNav[];
    products?: VeluProductNav[];
    versions?: VeluVersionNav[];
    anchors?: VeluAnchor[];
    global?: {
      anchors?: VeluAnchor[];
      tabs?: VeluGlobalTab[];
    };
  };
}

function isSeparator(item: unknown): item is VeluSeparator {
  return typeof item === "object" && item !== null && "separator" in item;
}

function isLink(item: unknown): item is VeluLink {
  return typeof item === "object" && item !== null && "href" in item && "label" in item;
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === "object" && item !== null && "group" in item;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadConfig(docsDir: string): VeluConfig {
  const raw = readFileSync(resolveConfigPath(docsDir), "utf-8");
  const parsed = JSON.parse(raw) as VeluConfig;
  return normalizeConfigNavigation(parsed);
}

const STATIC_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".avif",
  ".mp4", ".webm", ".ogg", ".mp3", ".wav", ".pdf", ".txt",
]);

function copyStaticAssets(docsDir: string, publicDir: string) {
  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }

      const ext = entry.name.includes(".")
        ? `.${entry.name.split(".").pop()!.toLowerCase()}`
        : "";
      if (!STATIC_EXTENSIONS.has(ext)) continue;

      const rel = relative(docsDir, srcPath);
      const destPath = join(publicDir, rel);
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }

  walk(docsDir);
}

function pageLabelFromSlug(slug: string): string {
  const last = slug.split("/").pop()!;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pageBasename(page: string): string {
  return page.split("/").pop()!;
}

interface PageMapping {
  src: string;   // original page reference (file path without .md)
  dest: string;  // destination path under content/docs (without extension)
}

interface MetaFile {
  dir: string;
  data: Record<string, unknown>;
}

interface BuildArtifacts {
  pageMap: PageMapping[];
  metaFiles: MetaFile[];
  firstPage: string;
}

function buildArtifacts(config: VeluConfig): BuildArtifacts {
  const pageMap: PageMapping[] = [];
  const metaFiles: MetaFile[] = [];
  const rootTabs = (config.navigation.tabs || []).filter((tab) => !tab.href);
  const rootPages = rootTabs.map((tab) => tab.slug);
  let firstPage = "quickstart";
  let hasFirstPage = false;

  function trackFirstPage(dest: string) {
    if (!hasFirstPage) {
      firstPage = dest;
      hasFirstPage = true;
    }
  }

  function metaEntry(item: string | VeluSeparator | VeluLink): string {
    if (typeof item === "string") return item;
    if (isSeparator(item)) return `---${item.separator}---`;
    if (isLink(item)) {
      return item.icon
        ? `[${item.icon}][${item.label}](${item.href})`
        : `[${item.label}](${item.href})`;
    }
    return String(item);
  }

  function addGroup(group: VeluGroup, parentDir: string) {
    const groupDir = `${parentDir}/${group.slug}`;
    const pages: string[] = [];

    for (const item of group.pages) {
      if (typeof item === "string") {
        const basename = pageBasename(item);
        const dest = `${groupDir}/${basename}`;
        pageMap.push({ src: item, dest });
        pages.push(basename);
        trackFirstPage(dest);
      } else if (isGroup(item)) {
        addGroup(item, groupDir);
        pages.push(item.hidden ? `!${item.slug}` : item.slug);
      } else if (isSeparator(item)) {
        pages.push(`---${item.separator}---`);
      } else if (isLink(item)) {
        pages.push(
          item.icon
            ? `[${item.icon}][${item.label}](${item.href})`
            : `[${item.label}](${item.href})`
        );
      }
    }

    const groupMeta: Record<string, unknown> = {
      title: group.group,
      pages,
      defaultOpen: group.expanded !== false,
    };

    if (group.icon) groupMeta.icon = group.icon;
    if (group.iconType) groupMeta.iconType = group.iconType;
    if (group.description) groupMeta.description = group.description;

    metaFiles.push({ dir: groupDir, data: groupMeta });
  }

  for (const tab of rootTabs) {
    const tabPages: string[] = [];

    if (tab.groups) {
      for (const group of tab.groups) {
        addGroup(group, tab.slug);
        tabPages.push(group.hidden ? `!${group.slug}` : group.slug);
      }
    }

    if (tab.pages) {
      for (const item of tab.pages) {
        if (typeof item === "string") {
          const basename = pageBasename(item);
          const dest = `${tab.slug}/${basename}`;
          pageMap.push({ src: item, dest });
          tabPages.push(basename);
          trackFirstPage(dest);
        } else {
          tabPages.push(metaEntry(item));
        }
      }
    }

    const tabMeta: Record<string, unknown> = {
      title: tab.tab,
      root: true,
      pages: tabPages,
    };

    if (tab.icon) tabMeta.icon = tab.icon;
    if (tab.iconType) tabMeta.iconType = tab.iconType;

    metaFiles.push({ dir: tab.slug, data: tabMeta });
  }

  if (rootPages.length > 0) {
    metaFiles.push({ dir: "", data: { pages: rootPages } });
  }

  return { pageMap, metaFiles, firstPage };
}

// ── Build ──────────────────────────────────────────────────────────────────────

function build(docsDir: string, outDir: string) {
  const configPath = resolveConfigPath(docsDir);
  const configName = configPath.endsWith(PRIMARY_CONFIG_NAME) ? PRIMARY_CONFIG_NAME : LEGACY_CONFIG_NAME;
  console.log(`📖 Loading ${configName} from: ${docsDir}`);
  const config = loadConfig(docsDir);

  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }

  // ── 1. Copy engine static files ──────────────────────────────────────────
  cpSync(ENGINE_DIR, outDir, { recursive: true });
  // Remove legacy Astro template leftovers if present in the packaged engine.
  rmSync(join(outDir, "src"), { recursive: true, force: true });
  console.log("📦 Copied engine files");

  // ── 2. Create additional directories ─────────────────────────────────────
  mkdirSync(join(outDir, "content", "docs"), { recursive: true });
  mkdirSync(join(outDir, "public"), { recursive: true });

  // ── 3. Copy config into the generated project ────────────────────────────
  copyFileSync(configPath, join(outDir, PRIMARY_CONFIG_NAME));
  copyFileSync(configPath, join(outDir, LEGACY_CONFIG_NAME));
  console.log(`📋 Copied ${configName} as ${PRIMARY_CONFIG_NAME} (and legacy ${LEGACY_CONFIG_NAME})`);

  // ── 3b. Copy static assets from docs project into public/ ─────────────────
  copyStaticAssets(docsDir, join(outDir, "public"));
  console.log("🖼️  Copied static assets");

  // ── 4. Build content + metadata artifacts ────────────────────────────────
  const contentDir = join(outDir, "content", "docs");
  const navLanguages = config.navigation.languages;
  const simpleLanguages = config.languages || [];

  function processPage(srcPath: string, destPath: string, slug: string) {
    mkdirSync(dirname(destPath), { recursive: true });
    let content = readFileSync(srcPath, "utf-8");
    if (!content.startsWith("---")) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
      if (titleMatch) {
        content = content.replace(/^#\s+.+$/m, "").trimStart();
      }
      content = `---\ntitle: "${title}"\n---\n\n${content}`;
    }
    writeFileSync(destPath, content, "utf-8");
  }

  function writeLangContent(
    langCode: string,
    artifacts: BuildArtifacts,
    isDefault: boolean,
    useLangFolders = false
  ) {
    const storagePrefix = useLangFolders ? langCode : (isDefault ? "" : langCode);
    const urlPrefix = isDefault ? "" : langCode;

    // Write meta files
    const metas = storagePrefix
      ? artifacts.metaFiles.map((m) => ({ dir: m.dir ? `${storagePrefix}/${m.dir}` : storagePrefix, data: { ...m.data } }))
      : artifacts.metaFiles;
    for (const meta of metas) {
      const metaPath = join(contentDir, meta.dir, "meta.json");
      mkdirSync(dirname(metaPath), { recursive: true });
      writeFileSync(metaPath, JSON.stringify(meta.data, null, 2) + "\n", "utf-8");
    }

    // Copy pages using explicit source paths from docs.json/velu.json
    for (const { src, dest } of artifacts.pageMap) {
      // Check for .mdx first, then .md
      let srcPath = join(docsDir, `${src}.mdx`);
      let ext = '.mdx';
      if (!existsSync(srcPath)) {
        srcPath = join(docsDir, `${src}.md`);
        ext = '.md';
      }
      if (!existsSync(srcPath)) {
        console.warn(`⚠️  Missing page source: ${src}${ext} (language: ${langCode})`);
        continue;
      }
      const destPath = join(contentDir, storagePrefix ? `${storagePrefix}/${dest}.mdx` : `${dest}.mdx`);
      processPage(srcPath, destPath, src);
    }

    // Index page
    const href = urlPrefix ? `/${urlPrefix}/${artifacts.firstPage}/` : `/${artifacts.firstPage}/`;
    const indexPath = storagePrefix ? join(contentDir, storagePrefix, "index.mdx") : join(contentDir, "index.mdx");
    writeFileSync(
      indexPath,
      `---\ntitle: "Overview"\ndescription: Documentation powered by Velu\n---\n\nimport { Card, Cards } from "fumadocs-ui/components/card"\nimport { Callout } from "fumadocs-ui/components/callout"\n\n<Callout type="info">\n  Welcome to your documentation site.\n</Callout>\n\n## Start here\n\n<Cards>\n  <Card\n    title="Read the docs"\n    href="${href}"\n    description="Begin with the first page in your configured navigation."\n  />\n</Cards>\n`,
      "utf-8"
    );
  }

  let totalPages = 0;
  let totalMeta = 0;

  if (navLanguages && navLanguages.length > 0) {
    // ── Mode 1: Per-language navigation (Mintlify-style) ──────────────
    const rootPages: string[] = [];

    for (let i = 0; i < navLanguages.length; i++) {
      const langEntry = navLanguages[i];
      const isDefault = i === 0;
      const langConfig = { ...config, navigation: { ...config.navigation, tabs: langEntry.tabs } } as VeluConfig;
      const artifacts = buildArtifacts(langConfig);
      writeLangContent(langEntry.language, artifacts, isDefault, true);
      totalPages += artifacts.pageMap.length;
      totalMeta += artifacts.metaFiles.length;
      rootPages.push(`!${langEntry.language}`);
    }

    const rootMetaPath = join(contentDir, "meta.json");
    writeFileSync(rootMetaPath, JSON.stringify({ pages: rootPages }, null, 2) + "\n", "utf-8");
  } else {
    // ── Mode 2: Simple (single-lang or same-nav multi-lang) ───────────
    const artifacts = buildArtifacts(config);
    const useLangFolders = simpleLanguages.length > 1;
    writeLangContent(simpleLanguages[0] || "en", artifacts, true, useLangFolders);
    totalPages += artifacts.pageMap.length;
    totalMeta += artifacts.metaFiles.length;

    if (simpleLanguages.length > 1) {
      const rootMetaPath = join(contentDir, "meta.json");
      const rootPages = [`!${simpleLanguages[0] || "en"}`];
      for (const lang of simpleLanguages.slice(1)) {
        writeLangContent(lang, artifacts, false, true);
        rootPages.push(`!${lang}`);
        totalPages += artifacts.pageMap.length;
        totalMeta += artifacts.metaFiles.length;
      }
      writeFileSync(rootMetaPath, JSON.stringify({ pages: rootPages }, null, 2) + "\n", "utf-8");
    }
  }

  console.log(`📄 Generated ${totalPages} pages + ${totalMeta} navigation meta files`);

  // ── 5. Generate theme CSS (dynamic — depends on user config) ─────────────
  const themeCss = generateThemeCss({
    theme: config.theme,
    colors: config.colors,
    appearance: config.appearance,
    styling: config.styling,
  });
  writeFileSync(join(outDir, "app", "velu-theme.css"), themeCss, "utf-8");
  console.log(`🎨 Generated theme: ${resolveThemeName(config.theme)}`);


  // ── 7. Generate minimal package.json (type: module, no local deps) ───────
  const sitePkg = {
    name: "velu-docs-site",
    version: "0.0.1",
    private: true,
    type: "module",
  };
  writeFileSync(join(outDir, "package.json"), JSON.stringify(sitePkg, null, 2) + "\n", "utf-8");

  console.log("📦 Generated boilerplate");
  console.log(`\n✅ Site generated at: ${outDir}`);
}

export { build };
