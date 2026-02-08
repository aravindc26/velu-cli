#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const cliPath = join(pkgRoot, "src", "cli.ts");

// Resolve tsx from the package's own node_modules, not the user's CWD
const require = createRequire(join(pkgRoot, "package.json"));
const tsxPath = pathToFileURL(require.resolve("tsx")).href;

const child = spawn(
  process.execPath,
  ["--import", tsxPath, cliPath, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: process.cwd() }
);

child.on("exit", (code) => process.exit(code ?? 1));

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
