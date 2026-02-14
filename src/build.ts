import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateThemeCss, resolveThemeName, type VeluColors, type VeluStyling } from "./themes.js";

// ── Engine directory (shipped with the CLI package) ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENGINE_DIR = join(__dirname, "engine");

// ── Types (used only by build.ts for page copying) ─────────────────────────────

interface VeluGroup {
  group: string;
  slug: string;
  icon?: string;
  expanded?: boolean;
  pages: (string | VeluGroup)[];
}

interface VeluTab {
  tab: string;
  slug: string;
  icon?: string;
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
    tabs: VeluTab[];
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
  const rootTabs = config.navigation.tabs.filter((tab) => !tab.href);
  const rootPages = rootTabs.map((tab) => tab.slug);
  let firstPage = "quickstart";
  let hasFirstPage = false;

  function trackFirstPage(dest: string) {
    if (!hasFirstPage) {
      firstPage = dest;
      hasFirstPage = true;
    }
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
      } else {
        addGroup(item, groupDir);
        pages.push(item.slug);
      }
    }

    const groupMeta: Record<string, unknown> = {
      title: group.group,
      pages,
      defaultOpen: group.expanded !== false,
    };

    if (group.icon) groupMeta.icon = group.icon;

    metaFiles.push({ dir: groupDir, data: groupMeta });
  }

  for (const tab of rootTabs) {
    const tabPages: string[] = [];

    if (tab.groups) {
      for (const group of tab.groups) {
        addGroup(group, tab.slug);
        tabPages.push(group.slug);
      }
    }

    if (tab.pages) {
      for (const page of tab.pages) {
        const basename = pageBasename(page);
        const dest = `${tab.slug}/${basename}`;
        pageMap.push({ src: page, dest });
        tabPages.push(basename);
        trackFirstPage(dest);
      }
    }

    const tabMeta: Record<string, unknown> = {
      title: tab.tab,
      root: true,
      pages: tabPages,
    };

    if (tab.icon) tabMeta.icon = tab.icon;

    metaFiles.push({ dir: tab.slug, data: tabMeta });
  }

  if (rootPages.length > 0) {
    metaFiles.push({ dir: "", data: { pages: rootPages } });
  }

  return { pageMap, metaFiles, firstPage };
}

// ── Build ──────────────────────────────────────────────────────────────────────

function build(docsDir: string, outDir: string) {
  console.log(`📖 Loading velu.json from: ${docsDir}`);
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

  // ── 3. Copy velu.json into the generated project ─────────────────────────
  copyFileSync(join(docsDir, "velu.json"), join(outDir, "velu.json"));
  console.log("📋 Copied velu.json");

  // ── 4. Build content + metadata artifacts ────────────────────────────────
  const { pageMap, metaFiles, firstPage } = buildArtifacts(config);

  // 4a) Write folder meta.json files (tabs/groups ordering & labels)
  for (const meta of metaFiles) {
    const metaPath = join(outDir, "content", "docs", meta.dir, "meta.json");
    mkdirSync(dirname(metaPath), { recursive: true });
    writeFileSync(metaPath, JSON.stringify(meta.data, null, 2) + "\n", "utf-8");
  }

  // 4b) Copy all referenced .md files (slug-based destinations)
  for (const { src, dest } of pageMap) {
    const srcPath = join(docsDir, `${src}.md`);
    const destPath = join(outDir, "content", "docs", `${dest}.mdx`);

    if (!existsSync(srcPath)) {
      console.warn(`⚠️  Missing: ${srcPath}`);
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });

    let content = readFileSync(srcPath, "utf-8");
    if (!content.startsWith("---")) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(src);
      if (titleMatch) {
        content = content.replace(/^#\s+.+$/m, "").trimStart();
      }
      content = `---\ntitle: "${title}"\n---\n\n${content}`;
    }

    writeFileSync(destPath, content, "utf-8");
  }
  console.log(`📄 Generated ${pageMap.length} pages + ${metaFiles.length} navigation meta files`);

  // ── 5. Generate theme CSS (dynamic — depends on user config) ─────────────
  const themeCss = generateThemeCss({
    theme: config.theme,
    colors: config.colors,
    appearance: config.appearance,
    styling: config.styling,
  });
  writeFileSync(join(outDir, "app", "velu-theme.css"), themeCss, "utf-8");
  console.log(`🎨 Generated theme: ${resolveThemeName(config.theme)}`);

  // ── 6. Generate index.mdx (dynamic — references first page) ──────────────
  writeFileSync(
    join(outDir, "content", "docs", "index.mdx"),
    `---\ntitle: "Overview"\ndescription: Documentation powered by Velu\n---\n\nimport { Card, Cards } from "fumadocs-ui/components/card"\nimport { Callout } from "fumadocs-ui/components/callout"\n\n<Callout type="info">\n  Welcome to your documentation site.\n</Callout>\n\n## Start here\n\n<Cards>\n  <Card\n    title="Read the docs"\n    href="/${firstPage}/"\n    description="Begin with the first page in your configured navigation."\n  />\n</Cards>\n`,
    "utf-8"
  );

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
