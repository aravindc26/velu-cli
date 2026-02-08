import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
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
    velu lint              Validate velu.json and check referenced pages
    velu run [--port N]    Build site and start dev server (default: 4321)
    velu build             Build site without starting the dev server

  Options:
    --port <number>   Port for the dev server (default: 4321)
    --help            Show this help message

  Run these commands from a directory containing velu.json.
`);
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

if (!existsSync(join(docsDir, "velu.json"))) {
  console.error("❌ No velu.json found in the current directory.");
  console.error("   Run this command from a directory containing velu.json.");
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
