import { resolve, join, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(__filename), "..");
const SCHEMA_PATH = join(PACKAGE_ROOT, "schema", "velu.schema.json");

// ── Help ────────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  velu — documentation site generator

  Usage:
    velu init              Scaffold a new docs project with example files
    velu lint              Validate velu.json and check referenced pages
    velu run [--port N]    Build site and start dev server (default: 4321)
    velu build             Build site without starting the dev server

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
    navigation: {
      tabs: [
        {
          tab: "API Reference",
          pages: ["api-reference/overview", "api-reference/authentication"],
        },
      ],
      groups: [
        {
          group: "Getting Started",
          pages: ["quickstart", "installation"],
        },
        {
          group: "Guides",
          pages: ["guides/configuration", "guides/deployment"],
        },
      ],
    },
  };
  writeFileSync(join(targetDir, "velu.json"), JSON.stringify(config, null, 2) + "\n", "utf-8");

  // Example pages
  const pages: Record<string, string> = {
    "quickstart.md": `# Quickstart\n\nWelcome to your new documentation site!\n\n## Prerequisites\n\n- Node.js 18+\n- npm\n\n## Getting Started\n\n1. Edit the markdown files in this directory\n2. Update \`velu.json\` to configure navigation\n3. Run \`velu run\` to start the dev server\n\n\`\`\`bash\nvelu run\n\`\`\`\n\nYour site is live at \`http://localhost:4321\`.\n`,
    "installation.md": `# Installation\n\nInstall Velu globally:\n\n\`\`\`bash\nnpm install -g @aravindc26/velu\n\`\`\`\n\nOr run directly with npx:\n\n\`\`\`bash\nnpx @aravindc26/velu run\n\`\`\`\n`,
    "guides/configuration.md": `# Configuration\n\nVelu uses a \`velu.json\` file to define your site's navigation.\n\n## Navigation Structure\n\n- **Tabs** — Top-level horizontal navigation\n- **Groups** — Collapsible sidebar sections\n- **Pages** — Individual markdown documents\n\n## Example\n\n\`\`\`json\n{\n  "navigation": {\n    "groups": [\n      {\n        "group": "Getting Started",\n        "pages": ["quickstart"]\n      }\n    ]\n  }\n}\n\`\`\`\n`,
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

async function buildSite(docsDir: string): Promise<string> {
  const { build } = await import("./build.js");
  const outDir = join(docsDir, ".velu-out");
  build(docsDir, outDir);
  return outDir;
}

// ── run ──────────────────────────────────────────────────────────────────────────

async function installDeps(outDir: string) {
  if (!existsSync(join(outDir, "node_modules"))) {
    console.log("\n📦 Installing dependencies...\n");
    await new Promise<void>((res, rej) => {
      const child = spawn("npm", ["install", "--silent"], {
        cwd: outDir,
        stdio: "inherit",
        shell: true,
      });
      child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`npm install exited with ${code}`))));
    });
  }
}

function spawnServer(outDir: string, command: string, port: number) {
  const child = spawn("node", ["_server.mjs", command, "--port", String(port)], {
    cwd: outDir,
    stdio: "inherit",
  });

  child.on("exit", (code) => process.exit(code ?? 0));

  const cleanup = () => child.kill("SIGTERM");
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

async function run(docsDir: string, port: number) {
  const outDir = await buildSite(docsDir);
  await installDeps(outDir);
  spawnServer(outDir, "dev", port);
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
