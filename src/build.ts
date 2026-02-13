import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateThemeCss, type ThemeConfig, type VeluColors, type VeluStyling } from "./themes.js";

// ── Engine directory (shipped with the CLI package) ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENGINE_DIR = join(__dirname, "engine");

// ── Types (used only by build.ts for page copying) ─────────────────────────────

interface VeluGroup {
  group: string;
  slug: string;
  pages: (string | VeluGroup)[];
}

interface VeluTab {
  tab: string;
  slug: string;
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

function collectPagesFromGroup(group: VeluGroup): string[] {
  const pages: string[] = [];
  for (const item of group.pages) {
    if (typeof item === "string") pages.push(item);
    else pages.push(...collectPagesFromGroup(item));
  }
  return pages;
}

interface PageMapping {
  src: string;   // original page reference (file path without .md)
  dest: string;  // slug-based destination path (slug/basename)
}

function buildPageMap(config: VeluConfig): PageMapping[] {
  const mappings: PageMapping[] = [];

  function addPagesFromGroup(group: VeluGroup, tabSlug: string) {
    for (const item of group.pages) {
      if (typeof item === "string") {
        mappings.push({ src: item, dest: `${tabSlug}/${group.slug}/${pageBasename(item)}` });
      } else {
        addPagesFromGroup(item, tabSlug);
      }
    }
  }

  for (const tab of config.navigation.tabs) {
    if (tab.href) continue;
    // Direct pages in tab use tab slug
    if (tab.pages) {
      for (const page of tab.pages) {
        mappings.push({ src: page, dest: `${tab.slug}/${pageBasename(page)}` });
      }
    }
    // Groups inside tab: <tab-slug>/<group-slug>/<page-basename>
    if (tab.groups) {
      for (const group of tab.groups) {
        addPagesFromGroup(group, tab.slug);
      }
    }
  }

  return mappings;
}

function collectAllPages(config: VeluConfig): string[] {
  return buildPageMap(config).map(m => m.src);
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
  console.log("📦 Copied engine files");

  // ── 2. Create additional directories ─────────────────────────────────────
  mkdirSync(join(outDir, "src", "content", "docs"), { recursive: true });
  mkdirSync(join(outDir, "public"), { recursive: true });

  // ── 3. Copy velu.json into the Astro project ─────────────────────────────
  copyFileSync(join(docsDir, "velu.json"), join(outDir, "velu.json"));
  console.log("📋 Copied velu.json");

  // ── 4. Copy all referenced .md files (slug-based destinations) ───────────
  const pageMap = buildPageMap(config);
  for (const { src, dest } of pageMap) {
    const srcPath = join(docsDir, `${src}.md`);
    const destPath = join(outDir, "src", "content", "docs", `${dest}.md`);

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
  console.log(`📄 Copied ${pageMap.length} pages`);

  // ── 5. Generate theme CSS (dynamic — depends on user config) ─────────────
  const themeCss = generateThemeCss({
    theme: config.theme,
    colors: config.colors,
    appearance: config.appearance,
    styling: config.styling,
  });
  writeFileSync(join(outDir, "src", "styles", "velu-theme.css"), themeCss, "utf-8");
  console.log(`🎨 Generated theme: ${config.theme || "mint"}`);

  // ── 6. Generate Astro config (dynamic — expressiveCode varies) ───────────
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

  // ── 7. Generate index.mdx (dynamic — references first page) ─────────────
  const firstPage = pageMap[0]?.dest || "quickstart";
  writeFileSync(
    join(outDir, "src", "content", "docs", "index.mdx"),
    `---\ntitle: "Welcome to Velu Docs"\ndescription: Documentation powered by Velu\n---\n\nWelcome to the documentation. Head over to the [Quickstart](/${firstPage}/) to get started.\n`,
    "utf-8"
  );

  // ── 8. Generate minimal package.json (type: module, no deps needed) ──────
  const astroPkg = {
    name: "velu-docs-site",
    version: "0.0.1",
    private: true,
    type: "module",
  };
  writeFileSync(join(outDir, "package.json"), JSON.stringify(astroPkg, null, 2) + "\n", "utf-8");

  console.log("📦 Generated boilerplate");
  console.log(`\n✅ Site generated at: ${outDir}`);
}

export { build };
