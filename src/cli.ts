import { resolve, join, dirname, delimiter } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), "..");
const SCHEMA_PATH = join(PACKAGE_ROOT, "schema", "velu.schema.json");
const NODE_MODULES_PATH = join(PACKAGE_ROOT, "node_modules");

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
    velu lint              Validate velu.json and check referenced pages
    velu run [--port N]    Build site and start dev server (default: 4321)
    velu build             Build a deployable static site (SSG)

  Options:
    --port <number>   Port for the dev server (default: 4321)
    --help            Show this help message

  Run lint/run/build from a directory containing velu.json.
`);
}

// ── init ────────────────────────────────────────────────────────────────────────

function init(targetDir: string) {
  if (existsSync(join(targetDir, "velu.json"))) {
    console.error("❌ velu.json already exists in this directory.");
    process.exit(1);
  }

  // velu.json
  const config = {
    $schema: "https://raw.githubusercontent.com/aravindc26/velu/main/schema/velu.schema.json",
    theme: "neutral" as const,
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
  writeFileSync(join(targetDir, "velu.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Example pages
  const pages: Record<string, string> = {
    "quickstart.md": `# Quickstart\n\nWelcome to your new documentation site!\n\n## Prerequisites\n\n- Node.js 20.9+\n- npm\n\n## Getting Started\n\n1. Edit the markdown files in this directory\n2. Update \`velu.json\` to configure navigation\n3. Run \`velu run\` to start the dev server\n\n\`\`\`bash\nvelu run\n\`\`\`\n\nYour site is live at \`http://localhost:4321\`.\n`,
    "installation.md": `# Installation\n\nInstall Velu globally:\n\n\`\`\`bash\nnpm install -g @aravindc26/velu\n\`\`\`\n\nOr run directly with npx:\n\n\`\`\`bash\nnpx @aravindc26/velu run\n\`\`\`\n`,
    "guides/configuration.md": `# Configuration\n\nVelu uses a \`velu.json\` file to define your site's navigation.\n\n## Navigation Structure\n\n- **Tabs** — Top-level horizontal navigation\n- **Groups** — Collapsible sidebar sections within a tab\n- **Pages** — Individual markdown documents\n\n## Example\n\n\`\`\`json\n{\n  "navigation": {\n    "tabs": [\n      {\n        "tab": "Getting Started",\n        "slug": "getting-started",\n        "groups": [\n          {\n            "group": "Basics",\n            "slug": "getting-started",\n            "pages": ["quickstart"]\n          }\n        ]\n      }\n    ]\n  }\n}\n\`\`\`\n`,
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
  console.log("    velu.json");
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
    console.log("✅ velu.json is valid. All referenced pages exist.");
  } else {
    console.error("❌ Validation failed:\n");
    for (const err of result.errors) {
      console.error(`  • ${err}`);
    }
    process.exit(1);
  }
}

// ── build ────────────────────────────────────────────────────────────────────────

async function generateProject(docsDir: string): Promise<string> {
  const { build } = await import("./build.js");
  // Place .velu-out inside CLI package dir so node_modules resolves
  // naturally by walking up — avoids symlinks that Turbopack rejects.
  const outDir = join(PACKAGE_ROOT, ".velu-out");
  build(docsDir, outDir);
  return outDir;
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

async function buildSite(docsDir: string) {
  const outDir = await generateProject(docsDir);
  await buildStatic(outDir, docsDir);
  const staticOutDir = join(outDir, "dist");
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
  const outDir = await generateProject(docsDir);
  spawnServer(outDir, "dev", port, docsDir);
}

// ── Parse args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const docsDir = process.cwd();

// init doesn't require velu.json
if (command === "init") {
  init(docsDir);
  process.exit(0);
}

if (!existsSync(join(docsDir, "velu.json"))) {
  console.error("❌ No velu.json found in the current directory.");
  console.error("   Run `velu init` to scaffold a new project, or run from a directory containing velu.json.");
  process.exit(1);
}

switch (command) {
  case "lint":
    await lint(docsDir);
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
