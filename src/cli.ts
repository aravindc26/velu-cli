import { resolve, join, dirname, delimiter } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync, cpSync, rmSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), "..");
const SCHEMA_PATH = join(PACKAGE_ROOT, "schema", "velu.schema.json");
const NODE_MODULES_PATH = join(PACKAGE_ROOT, "node_modules");
const PRIMARY_CONFIG_NAME = "docs.json";
const LEGACY_CONFIG_NAME = "velu.json";

function resolveConfigPath(dir: string): string | null {
  const primary = join(dir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  const legacy = join(dir, LEGACY_CONFIG_NAME);
  if (existsSync(legacy)) return legacy;
  return null;
}

/** Build env that lets spawned processes resolve deps from the CLI's own node_modules */
function engineEnv(docsDir?: string): NodeJS.ProcessEnv {
  const existing = process.env.NODE_PATH || "";
  return {
    ...process.env,
    NODE_PATH: existing ? `${NODE_MODULES_PATH}${delimiter}${existing}` : NODE_MODULES_PATH,
    ...(docsDir ? { VELU_DOCS_DIR: docsDir } : {}),
  };
}

// ── Help ────────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  velu — documentation site generator

  Usage:
    velu init              Scaffold a new docs project with example files
    velu lint              Validate docs.json (or velu.json) and check referenced pages
    velu run [--port N]    Build site and start dev server (default: 4321)
    velu build             Build a deployable static site (SSG)
    velu paths             Output all navigation paths and their source files as JSON

  Options:
    --port <number>   Port for the dev server (default: 4321)
    --help            Show this help message

  Run lint/run/build/paths from a directory containing docs.json (or velu.json).
`);
}

// ── init ────────────────────────────────────────────────────────────────────────

function init(targetDir: string) {
  if (resolveConfigPath(targetDir)) {
    console.error("❌ docs.json or velu.json already exists in this directory.");
    process.exit(1);
  }

  // docs.json
  const config = {
    $schema: "https://raw.githubusercontent.com/aravindc26/velu/main/schema/velu.schema.json",
    theme: "neutral" as const,
    colors: {
      primary: "#DC143C",
      light: "#DC143C",
      dark: "#DC143C",
    },
    navigation: {
      tabs: [
        {
          tab: "Getting Started",
          slug: "getting-started",
          pages: [
            "quickstart",
            "installation",
            { separator: "Resources" },
            { label: "Velu Website", href: "https://getvelu.com" },
          ],
          groups: [
            {
              group: "Guides",
              slug: "guides",
              description: "Step-by-step guides to configure and deploy your docs.",
              pages: ["guides/configuration", "guides/deployment"],
            },
          ],
        },
        {
          tab: "API Reference",
          slug: "api-reference",
          pages: ["api-reference/overview", "api-reference/authentication"],
        },
      ],
      anchors: [
        {
          anchor: "GitHub",
          href: "https://github.com/aravindc26/velu",
          icon: "Github",
        },
      ],
    },
  };
  writeFileSync(join(targetDir, PRIMARY_CONFIG_NAME), JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Example pages
  const pages: Record<string, string> = {
    "quickstart.md": `# Quickstart\n\nWelcome to your new documentation site!\n\n## Prerequisites\n\n- Node.js 20.9+\n- npm\n\n## Getting Started\n\n1. Edit the markdown files in this directory\n2. Update \`docs.json\` to configure navigation\n3. Run \`velu run\` to start the dev server\n\n\`\`\`bash\nvelu run\n\`\`\`\n\nYour site is live at \`http://localhost:4321\`.\n`,
    "installation.md": `# Installation\n\nInstall Velu globally:\n\n\`\`\`bash\nnpm install -g @aravindc26/velu\n\`\`\`\n\nOr run directly with npx:\n\n\`\`\`bash\nnpx @aravindc26/velu run\n\`\`\`\n`,
    "guides/configuration.md": `# Configuration\n\nVelu uses a \`docs.json\` file to define your site's navigation.\n\n## Navigation Structure\n\n- **Tabs** — Top-level horizontal navigation\n- **Groups** — Collapsible sidebar sections within a tab\n- **Pages** — Individual markdown documents\n\n## Example\n\n\`\`\`json\n{\n  "navigation": {\n    "tabs": [\n      {\n        "tab": "Getting Started",\n        "slug": "getting-started",\n        "groups": [\n          {\n            "group": "Basics",\n            "slug": "getting-started",\n            "pages": ["quickstart"]\n          }\n        ]\n      }\n    ]\n  }\n}\n\`\`\`\n`,
    "guides/deployment.md": `# Deployment\n\nBuild your site for production:\n\n\`\`\`bash\nvelu build\n\`\`\`\n\nThe output is a static site you can deploy anywhere — Netlify, Vercel, GitHub Pages, etc.\n`,
    "api-reference/overview.md": `# API Overview\n\nThis section covers the API reference for your project.\n\n## Endpoints\n\n| Method | Path | Description |\n|--------|------|-------------|\n| GET | /api/health | Health check |\n| POST | /api/data | Create data |\n`,
    "api-reference/authentication.md": `# Authentication\n\nAll API requests require an API key.\n\n## Headers\n\n\`\`\`\nAuthorization: Bearer YOUR_API_KEY\n\`\`\`\n\n## Getting an API Key\n\nVisit the dashboard to generate your API key.\n`,
  };

  for (const [filePath, content] of Object.entries(pages)) {
    const fullPath = join(targetDir, filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  console.log("");
  console.log("  \x1b[36mvelu\x1b[0m  project initialized");
  console.log("");
  console.log("  Created:");
  console.log("    docs.json");
  for (const filePath of Object.keys(pages)) {
    console.log(`    ${filePath}`);
  }
  console.log("");
  console.log("  Next steps:");
  console.log("    velu run        Start the dev server");
  console.log("    velu lint       Validate your config");
  console.log("");
}

// ── lint ─────────────────────────────────────────────────────────────────────────

async function lint(docsDir: string) {
  const { validateVeluConfig } = await import("./validate.js");
  const result = validateVeluConfig(docsDir, SCHEMA_PATH);

  if (result.valid) {
    console.log("✅ docs.json/velu.json is valid. All referenced pages exist.");
  } else {
    console.error("❌ Validation failed:\n");
    for (const err of result.errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }
}

// ── paths ───────────────────────────────────────────────────────────────────────

interface PathEntry {
  path: string;
  file: string | null;
}

async function paths(docsDir: string) {
  const { collectPages } = await import("./validate.js");
  const { normalizeConfigNavigation } = await import("./navigation-normalize.js");
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  const configPath = resolveConfigPath(docsDir);
  if (!configPath) {
    console.error("❌ docs.json or velu.json not found.");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  const config = normalizeConfigNavigation(raw);
  const pages = collectPages(config);

  const entries: PathEntry[] = pages.map((pagePath) => {
    // Check for .mdx first, then .md
    const mdxPath = join(docsDir, `${pagePath}.mdx`);
    const mdPath = join(docsDir, `${pagePath}.md`);

    if (existsSync(mdxPath)) {
      return { path: pagePath, file: `${pagePath}.mdx` };
    }
    if (existsSync(mdPath)) {
      return { path: pagePath, file: `${pagePath}.md` };
    }
    return { path: pagePath, file: null };
  });

  const output = {
    paths: entries,
    count: entries.length,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ── build ────────────────────────────────────────────────────────────────────────

async function generateProject(docsDir: string): Promise<string> {
  const { build } = await import("./build.js");
  // Generate into the active docs project directory.
  const outDir = join(docsDir, ".velu-out");
  build(docsDir, outDir);
  return outDir;
}

function samePath(a: string, b: string): boolean {
  return resolve(a).replace(/\\/g, "/").toLowerCase() === resolve(b).replace(/\\/g, "/").toLowerCase();
}

function prepareRuntimeOutDir(docsOutDir: string): string {
  const runtimeOutDir = join(PACKAGE_ROOT, ".velu-out");
  if (samePath(docsOutDir, runtimeOutDir)) return runtimeOutDir;

  rmSync(runtimeOutDir, { recursive: true, force: true });
  cpSync(docsOutDir, runtimeOutDir, { recursive: true, force: true });
  return runtimeOutDir;
}

async function buildStatic(outDir: string, docsDir: string) {
  await new Promise<void>((res, rej) => {
    const child = spawn("node", ["_server.mjs", "build"], {
      cwd: outDir,
      stdio: "inherit",
      env: engineEnv(docsDir),
    });
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`Build exited with ${code}`))));
  });
}

function exportMarkdownRoutes(outDir: string) {
  const distDir = join(outDir, "dist");
  const mdRouteRoot = join(distDir, "md-file");
  if (!existsSync(mdRouteRoot)) return;

  let copied = 0;

  function walk(relDir: string) {
    const absDir = join(mdRouteRoot, relDir);
    const entries = readdirSync(absDir, { withFileTypes: true });

    for (const entry of entries) {
      const relPath = relDir ? join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(relPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;

      const src = join(mdRouteRoot, relPath);
      const dest = join(distDir, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copied += 1;
    }
  }

  walk("");
  console.log(`📝 Exported ${copied} markdown files to static route paths`);
}

function collectStaticRoutePaths(distDir: string): string[] {
  const routes = new Set<string>();

  function walk(relDir: string) {
    const absDir = join(distDir, relDir);
    const entries = readdirSync(absDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childRel = relDir ? join(relDir, entry.name) : entry.name;
      if (existsSync(join(distDir, childRel, "index.html"))) {
        const normalized = childRel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (
          normalized.length > 0 &&
          !normalized.startsWith("_next") &&
          !normalized.startsWith("_not-found") &&
          normalized !== "404" &&
          !normalized.startsWith("pagefind")
        ) {
          routes.add(`/${normalized}`);
        }
      }
      walk(childRel);
    }
  }

  walk("");
  return Array.from(routes).sort((a, b) => a.localeCompare(b));
}

function collectMarkdownPaths(distDir: string): string[] {
  const markdownPaths = new Set<string>();

  function walk(relDir: string) {
    const absDir = join(distDir, relDir);
    const entries = readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relDir ? join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".md")) continue;
      const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
      markdownPaths.add(`/${normalized}`);
    }
  }

  walk("");
  return Array.from(markdownPaths).sort((a, b) => a.localeCompare(b));
}

function addStaticRouteCompatibility(outDir: string) {
  const distDir = join(outDir, "dist");
  if (!existsSync(distDir)) return;

  const routes = collectStaticRoutePaths(distDir);
  if (routes.length === 0) return;

  let aliasCount = 0;
  for (const route of routes) {
    const rel = route.replace(/^\/+/, "");
    const src = join(distDir, rel, "index.html");
    const htmlAlias = join(distDir, `${rel}.html`);
    if (existsSync(src) && !existsSync(htmlAlias)) {
      copyFileSync(src, htmlAlias);
      aliasCount += 1;
    }
  }

  const fallbackPath = join(distDir, "404.html");
  if (existsSync(fallbackPath)) {
    const html = readFileSync(fallbackPath, "utf-8");
    if (!html.includes("velu-noslash-fallback")) {
      const script = [
        '<script id="velu-noslash-fallback">',
        "(function(){",
        "  try {",
        `    var routes = new Set(${JSON.stringify(routes)});`,
        "    var path = (window.location && window.location.pathname ? window.location.pathname : '/').replace(/\\/+$/, '');",
        "    if (!path || path === '/') return;",
        "    if (/\\.[a-zA-Z0-9]+$/.test(path)) return;",
        "    if (!routes.has(path)) return;",
        "    var search = window.location.search || '';",
        "    var hash = window.location.hash || '';",
        "    window.location.replace(path + '/' + search + hash);",
        "  } catch (_) {}",
        "})();",
        "</script>",
      ].join("");
      const patched = html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}\n${script}\n`;
      writeFileSync(fallbackPath, patched, "utf-8");
    }
  }

  const redirectsPath = join(distDir, "_redirects");
  const existingRedirects = existsSync(redirectsPath) ? readFileSync(redirectsPath, "utf-8") : "";
  const existingLines = new Set(existingRedirects.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const redirectLines = routes.map((route) => `${route}  ${route}/  301`);
  let redirectAdded = 0;
  for (const line of redirectLines) {
    if (existingLines.has(line)) continue;
    existingLines.add(line);
    redirectAdded += 1;
  }
  if (redirectAdded > 0) {
    const merged = Array.from(existingLines).join("\n") + "\n";
    writeFileSync(redirectsPath, merged, "utf-8");
  }

  const mdPaths = collectMarkdownPaths(distDir);
  if (mdPaths.length > 0) {
    const headersPath = join(distDir, "_headers");
    let mergedHeaders = existsSync(headersPath) ? readFileSync(headersPath, "utf-8") : "";
    let headerAdded = 0;

    for (const mdPath of mdPaths) {
      const block = [
        mdPath,
        "  Content-Type: text/markdown; charset=utf-8",
        "  Content-Disposition: inline",
        "  X-Content-Type-Options: nosniff",
        "",
      ].join("\n");
      if (mergedHeaders.includes(block)) continue;
      if (mergedHeaders.length > 0 && !mergedHeaders.endsWith("\n")) mergedHeaders += "\n";
      if (mergedHeaders.length > 0) mergedHeaders += "\n";
      mergedHeaders += block;
      headerAdded += 1;
    }

    if (headerAdded > 0) {
      writeFileSync(headersPath, mergedHeaders.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n", "utf-8");
    }
    console.log(`📄 Added inline markdown headers for ${mdPaths.length} .md routes`);
  }

  console.log(`🔁 Added static compatibility for ${routes.length} routes (${aliasCount} .html aliases, ${redirectAdded} redirects)`);
}

async function buildSite(docsDir: string) {
  const docsOutDir = await generateProject(docsDir);
  const runtimeOutDir = prepareRuntimeOutDir(docsOutDir);
  await buildStatic(runtimeOutDir, docsDir);
  exportMarkdownRoutes(runtimeOutDir);
  addStaticRouteCompatibility(runtimeOutDir);

  if (!samePath(docsOutDir, runtimeOutDir)) {
    const docsDistDir = join(docsOutDir, "dist");
    const runtimeDistDir = join(runtimeOutDir, "dist");
    rmSync(docsDistDir, { recursive: true, force: true });
    cpSync(runtimeDistDir, docsDistDir, { recursive: true, force: true });
  }

  const staticOutDir = join(docsOutDir, "dist");
  console.log(`\n📁 Static site output: ${staticOutDir}`);
}

// ── run ──────────────────────────────────────────────────────────────────────────

function spawnServer(outDir: string, command: string, port: number, docsDir: string) {
  const child = spawn("node", ["_server.mjs", command, "--port", String(port)], {
    cwd: outDir,
    stdio: "inherit",
    env: engineEnv(docsDir),
  });

  child.on("exit", (code) => process.exit(code ?? 0));

  const cleanup = () => child.kill("SIGTERM");
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function run(docsDir: string, port: number) {
  const docsOutDir = await generateProject(docsDir);
  const runtimeOutDir = prepareRuntimeOutDir(docsOutDir);
  spawnServer(runtimeOutDir, "dev", port, docsDir);
}

// ── Parse args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const docsDir = process.cwd();

// init doesn't require docs.json
if (command === "init") {
  init(docsDir);
  process.exit(0);
}

if (!resolveConfigPath(docsDir)) {
  console.error("❌ No docs.json or velu.json found in the current directory.");
  console.error("   Run `velu init` to scaffold a new project, or run from a directory containing docs.json.");
  process.exit(1);
}

switch (command) {
  case "lint":
    await lint(docsDir);
    break;

  case "paths":
    await paths(docsDir);
    break;

  case "build":
    await buildSite(docsDir);
    break;

  case "run": {
    const portIdx = args.indexOf("--port");
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 4321;
    if (isNaN(port)) {
      console.error("❌ Invalid port number.");
      process.exit(1);
    }
    await run(docsDir, port);
    break;
  }

  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
}
