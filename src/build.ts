import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, relative, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { generateThemeCss, resolveThemeName, type VeluColors, type VeluStyling } from "./themes.js";
import { normalizeConfigNavigation } from "./navigation-normalize.js";

// ── Engine directory (shipped with the CLI package) ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGED_ENGINE_DIR = join(__dirname, "engine");
const DEV_ENGINE_DIR = join(__dirname, "..", "src", "engine");
const ENGINE_DIR = existsSync(DEV_ENGINE_DIR) ? DEV_ENGINE_DIR : PACKAGED_ENGINE_DIR;
const CLI_PACKAGE_JSON_PATH = join(__dirname, "..", "package.json");
const PRIMARY_CONFIG_NAME = "docs.json";
const LEGACY_CONFIG_NAME = "velu.json";
const SOURCE_MIRROR_DIR = "velu-imports";

const SOURCE_MIRROR_EXTENSIONS = new Set([
  ".md", ".mdx", ".jsx", ".js", ".tsx", ".ts",
  ".json", ".yaml", ".yml", ".css",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp4", ".webm", ".mp3", ".wav",
  ".pdf", ".txt", ".xml", ".csv", ".zip",
]);

const IMPORT_REWRITE_EXTENSIONS = new Set([".md", ".mdx", ".jsx", ".js", ".tsx", ".ts"]);
const VARIABLE_SUBSTITUTION_EXTENSIONS = new Set([
  ".md", ".mdx", ".jsx", ".js", ".tsx", ".ts",
  ".json", ".yaml", ".yml", ".css", ".txt", ".xml", ".csv",
]);

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
  openapi?: VeluOpenApiSource;
  version?: string;
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
  version?: string;
  openapi?: VeluOpenApiSource;
  expanded?: boolean;
  description?: string;
  hidden?: boolean;
  pages: (string | VeluGroup | VeluSeparator | VeluLink)[];
}

interface VeluMenuItem {
  item: string;
  icon?: string;
  iconType?: string;
  openapi?: VeluOpenApiSource;
  groups?: VeluGroup[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluTab {
  tab: string;
  slug: string;
  icon?: string;
  iconType?: string;
  href?: string;
  openapi?: VeluOpenApiSource;
  version?: string;
  pages?: (string | VeluSeparator | VeluLink)[];
  groups?: VeluGroup[];
  menu?: VeluMenuItem[];
}

interface VeluLanguageNav {
  language: string;
  openapi?: VeluOpenApiSource;
  tabs: VeluTab[];
}

interface VeluProductNav {
  product: string;
  icon?: string;
  iconType?: string;
  openapi?: VeluOpenApiSource;
  tabs?: VeluTab[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluVersionNav {
  version: string;
  openapi?: VeluOpenApiSource;
  tabs: VeluTab[];
}

interface VeluRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
}

interface VeluConfig {
  $schema?: string;
  name?: string;
  title?: string;
  description?: string;
  theme?: string;
  variables?: Record<string, string>;
  colors?: VeluColors;
  appearance?: "system" | "light" | "dark";
  styling?: VeluStyling;
  fonts?: { family: string; weight?: number; source?: string; format?: "woff" | "woff2" } | { heading?: { family: string; weight?: number; source?: string; format?: "woff" | "woff2" }; body?: { family: string; weight?: number; source?: string; format?: "woff" | "woff2" } };
  metadata?: {
    timestamp?: boolean;
  };
  openapi?: VeluOpenApiSource;
  languages?: string[];
  redirects?: VeluRedirect[];
  navigation: {
    openapi?: VeluOpenApiSource;
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

interface VeluOpenApiConfigObject {
  source?: string | string[];
  directory?: string;
}

type VeluOpenApiSource = string | string[] | VeluOpenApiConfigObject;

function isSeparator(item: unknown): item is VeluSeparator {
  return typeof item === "object" && item !== null && "separator" in item;
}

function isLink(item: unknown): item is VeluLink {
  return typeof item === "object" && item !== null && "href" in item && "label" in item;
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === "object" && item !== null && "group" in item;
}

const HTTP_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE", "CONNECT", "WEBHOOK",
]);
const OPENAPI_PATH_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

interface ParsedOpenApiOperationRef {
  spec?: string;
  method: string;
  endpoint: string;
  kind?: "path" | "webhook";
  title?: string;
  description?: string;
  deprecated?: boolean;
  version?: string;
  content?: string;
}

function resolveDefaultOpenApiSpec(openapi: VeluOpenApiSource | undefined): string | undefined {
  const source = extractOpenApiSource(openapi);
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(source)) {
    const first = source.find((entry) => typeof entry === "string" && entry.trim().length > 0);
    return typeof first === "string" ? first.trim() : undefined;
  }
  return undefined;
}

function parseOpenApiOperationRef(value: string, inheritedSpec?: string): ParsedOpenApiOperationRef | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withSpec) {
    const method = withSpec[2].toUpperCase();
    const endpoint = withSpec[3].trim();
    if (!HTTP_METHODS.has(method)) return null;
    if (method === "WEBHOOK") {
      if (!endpoint) return null;
      return { spec: withSpec[1].trim(), method, endpoint, kind: "webhook" };
    }
    if (!endpoint.startsWith("/")) return null;
    return { spec: withSpec[1].trim(), method, endpoint, kind: "path" };
  }

  const noSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (!noSpec) return null;
  const method = noSpec[1].toUpperCase();
  const endpoint = noSpec[2].trim();
  if (!HTTP_METHODS.has(method)) return null;
  if (method === "WEBHOOK") {
    if (!endpoint) return null;
    return { spec: inheritedSpec, method, endpoint, kind: "webhook" };
  }
  if (!endpoint.startsWith("/")) return null;
  return { spec: inheritedSpec, method, endpoint, kind: "path" };
}

function slugFromOpenApiOperation(method: string, endpoint: string): string {
  const cleaned = endpoint
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[{}]/g, "")
    .replace(/[^a-z0-9/._-]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  const body = cleaned || "endpoint";
  return `${method.toLowerCase()}-${body}`;
}

function resolveOpenApiSpecList(openapi: VeluOpenApiSource | undefined): string[] {
  const source = extractOpenApiSource(openapi);
  if (typeof source === "string") {
    const trimmed = source.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(source)) {
    return source
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function extractOpenApiSource(openapi: VeluOpenApiSource | undefined): string | string[] | undefined {
  if (typeof openapi === "string" || Array.isArray(openapi)) return openapi;
  if (openapi && typeof openapi === "object") {
    const source = (openapi as VeluOpenApiConfigObject).source;
    if (typeof source === "string" || Array.isArray(source)) return source;
  }
  return undefined;
}

function resolveOpenApiDirectory(openapi: VeluOpenApiSource | undefined): string | undefined {
  if (!openapi || typeof openapi !== "object" || Array.isArray(openapi)) return undefined;
  const raw = (openapi as VeluOpenApiConfigObject).directory;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOpenApiDocument(rawSource: string): Record<string, unknown> | null {
  const source = rawSource.trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // fall through and attempt YAML parse.
  }
  try {
    const parsed = parseYaml(source);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function readMintMetadata(operation: Record<string, unknown>) {
  const xMint = operation["x-mint"];
  if (!xMint || typeof xMint !== "object") return {};
  const metadata = (xMint as Record<string, unknown>).metadata;
  const content = (xMint as Record<string, unknown>).content;
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return {
    title: typeof meta.title === "string" ? meta.title : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
    deprecated: typeof meta.deprecated === "boolean" ? meta.deprecated : undefined,
    version: typeof meta.version === "string" ? meta.version : undefined,
    content: typeof content === "string" ? content : undefined,
  };
}

function pickOperationMethod(pathItem: Record<string, unknown>): string | undefined {
  for (const method of OPENAPI_PATH_METHODS) {
    const operation = pathItem[method];
    if (operation && typeof operation === "object") return method.toUpperCase();
  }
  return undefined;
}

function loadOpenApiOperations(specSource: string, docsDir: string): ParsedOpenApiOperationRef[] {
  if (/^https?:\/\//i.test(specSource) || specSource.startsWith("file://")) return [];

  const resolvedPath = specSource.startsWith("/")
    ? join(docsDir, specSource.replace(/^\/+/, ""))
    : resolve(docsDir, specSource);
  if (!existsSync(resolvedPath)) return [];

  const parsed = parseOpenApiDocument(readFileSync(resolvedPath, "utf-8"));
  if (!parsed) return [];

  const paths = parsed.paths;
  const webhooks = parsed.webhooks;

  const output: ParsedOpenApiOperationRef[] = [];
  if (paths && typeof paths === "object") {
    for (const [endpoint, methods] of Object.entries(paths as Record<string, unknown>)) {
      if (!endpoint.startsWith("/") || !methods || typeof methods !== "object") continue;
      for (const method of Object.keys(methods as Record<string, unknown>)) {
        const normalized = method.toLowerCase();
        if (!OPENAPI_PATH_METHODS.has(normalized)) continue;
        const operation = (methods as Record<string, unknown>)[method];
        if (!operation || typeof operation !== "object") continue;
        if ((operation as Record<string, unknown>)["x-hidden"] === true) continue;
        const mintMeta = readMintMetadata(operation as Record<string, unknown>);
        output.push({
          kind: "path",
          spec: specSource,
          method: normalized.toUpperCase(),
          endpoint,
          title: mintMeta.title ?? (typeof (operation as Record<string, unknown>).summary === "string" ? String((operation as Record<string, unknown>).summary) : undefined),
          description: mintMeta.description ?? (typeof (operation as Record<string, unknown>).description === "string" ? String((operation as Record<string, unknown>).description) : undefined),
          deprecated: mintMeta.deprecated ?? ((operation as Record<string, unknown>).deprecated === true),
          version: mintMeta.version,
          content: mintMeta.content,
        });
      }
    }
  }

  if (webhooks && typeof webhooks === "object") {
    for (const [webhookName, pathItem] of Object.entries(webhooks as Record<string, unknown>)) {
      if (!pathItem || typeof pathItem !== "object") continue;
      const resolvedMethod = pickOperationMethod(pathItem as Record<string, unknown>);
      if (!resolvedMethod) continue;
      const operation = (pathItem as Record<string, unknown>)[resolvedMethod.toLowerCase()];
      if (!operation || typeof operation !== "object") continue;
      if ((operation as Record<string, unknown>)["x-hidden"] === true) continue;
      const mintMeta = readMintMetadata(operation as Record<string, unknown>);
      output.push({
        kind: "webhook",
        spec: specSource,
        method: "WEBHOOK",
        endpoint: webhookName,
        title: mintMeta.title ?? (typeof (operation as Record<string, unknown>).summary === "string" ? String((operation as Record<string, unknown>).summary) : undefined),
        description: mintMeta.description ?? (typeof (operation as Record<string, unknown>).description === "string" ? String((operation as Record<string, unknown>).description) : undefined),
        deprecated: mintMeta.deprecated ?? ((operation as Record<string, unknown>).deprecated === true),
        version: mintMeta.version,
        content: mintMeta.content,
      });
    }
  }
  return output;
}

function normalizeOpenApiSpecForFrontmatter(spec: string | undefined): string | undefined {
  if (!spec) return undefined;
  const trimmed = spec.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("file://")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `/${trimmed.replace(/^\.?\/*/, "")}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const VARIABLE_TOKEN_PATTERN = /\{\{\s*([A-Za-z0-9.-]+)\s*\}\}/g;
const VARIABLE_NAME_PATTERN = /^[A-Za-z0-9.-]+$/;

function sanitizeVariableValue(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractVariables(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) continue;
    if (!VARIABLE_NAME_PATTERN.test(key)) {
      throw new Error(`Invalid variable name '${rawKey}'. Variable names can only contain letters, numbers, periods, and hyphens.`);
    }
    if (typeof rawValue !== "string") {
      throw new Error(`Invalid value for variable '${rawKey}'. Variables must be strings.`);
    }
    output[key] = rawValue;
  }
  return output;
}

function resolveVariableMap(rawVariables: Record<string, string>): Record<string, string> {
  const cache = new Map<string, string>();
  const activeStack = new Set<string>();

  function resolveOne(name: string): string {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;

    if (activeStack.has(name)) {
      throw new Error(`Circular variable reference detected for '{{${name}}}'.`);
    }

    const raw = rawVariables[name];
    if (raw === undefined) {
      throw new Error(`Undefined variable '{{${name}}}' referenced in variable definitions.`);
    }

    activeStack.add(name);
    const resolved = raw.replace(VARIABLE_TOKEN_PATTERN, (_match, token: string) => resolveOne(token));
    activeStack.delete(name);
    cache.set(name, resolved);
    return resolved;
  }

  const output: Record<string, string> = {};
  for (const name of Object.keys(rawVariables)) {
    output[name] = resolveOne(name);
  }
  return output;
}

function replaceVariablesInString(
  value: string,
  variables: Record<string, string>,
  context: string,
  sanitizeValues: boolean,
): string {
  const undefinedVariables = new Set<string>();
  const replaced = value.replace(VARIABLE_TOKEN_PATTERN, (match, rawName: string) => {
    const name = rawName.trim();
    const resolved = variables[name];
    if (resolved === undefined) {
      undefinedVariables.add(name);
      return match;
    }
    return sanitizeValues ? sanitizeVariableValue(resolved) : resolved;
  });

  if (undefinedVariables.size > 0) {
    throw new Error(
      `Undefined variable(s) ${Array.from(undefinedVariables).map((name) => `'{{${name}}}'`).join(", ")} in ${context}.`
    );
  }

  return replaced;
}

function applyVariablesToConfig(value: unknown, variables: Record<string, string>, path = "docs.json"): unknown {
  if (typeof value === "string") return replaceVariablesInString(value, variables, path, false);
  if (Array.isArray(value)) return value.map((entry, index) => applyVariablesToConfig(entry, variables, `${path}[${index}]`));
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = applyVariablesToConfig(entry, variables, `${path}.${key}`);
  }
  return output;
}

function loadConfig(docsDir: string): { config: VeluConfig; rawConfig: VeluConfig; variables: Record<string, string> } {
  const raw = readFileSync(resolveConfigPath(docsDir), "utf-8");
  const parsed = JSON.parse(raw) as VeluConfig;
  const rawVariables = extractVariables(parsed.variables);
  const resolvedVariables = resolveVariableMap(rawVariables);
  const withVariables = applyVariablesToConfig(parsed, resolvedVariables) as VeluConfig;
  withVariables.variables = resolvedVariables;
  return {
    config: normalizeConfigNavigation(withVariables),
    rawConfig: withVariables,
    variables: resolvedVariables,
  };
}

function isExternalDestination(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed !== "/" && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed;
}

function collectRedirectRules(config: VeluConfig): Array<{ source: string; destination: string; permanent: boolean }> {
  const redirects = Array.isArray(config.redirects) ? config.redirects : [];
  const output: Array<{ source: string; destination: string; permanent: boolean }> = [];

  for (const redirect of redirects) {
    if (!redirect || typeof redirect.source !== "string" || typeof redirect.destination !== "string") continue;
    const source = redirect.source.trim();
    const destination = redirect.destination.trim();
    if (!source || !destination) continue;
    if (/[?#]/.test(source) || /[?#]/.test(destination)) continue;

    const normalizedSource = normalizePath(source);
    const normalizedDestination = isExternalDestination(destination)
      ? destination
      : normalizePath(destination);
    if (!isExternalDestination(normalizedDestination) && normalizedSource === normalizedDestination) continue;

    output.push({
      source: normalizedSource,
      destination: normalizedDestination,
      permanent: redirect.permanent !== false,
    });
  }

  return output;
}

function writeRedirectArtifacts(config: VeluConfig, outDir: string) {
  const redirects = collectRedirectRules(config);
  const generatedDir = join(outDir, "generated");
  mkdirSync(generatedDir, { recursive: true });

  writeFileSync(
    join(generatedDir, "redirects.ts"),
    `const redirects: Array<{ source: string; destination: string; permanent: boolean }> = ${JSON.stringify(redirects, null, 2)};\n\nexport default redirects;\n`,
    "utf-8"
  );

  const redirectsFilePath = join(outDir, "public", "_redirects");
  if (redirects.length === 0) {
    rmSync(redirectsFilePath, { force: true });
    return;
  }

  const netlifyBody = redirects
    .map((redirect) => `${redirect.source} ${redirect.destination} ${redirect.permanent ? 301 : 307}`)
    .join("\n");
  writeFileSync(redirectsFilePath, `${netlifyBody}\n`, "utf-8");
}

const STATIC_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".mp4", ".webm",
  ".mp3", ".wav",
  ".json", ".yaml", ".yml",
  ".css",
  ".js",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pdf", ".txt",
  ".xml", ".csv",
  ".zip",
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

function resolveProjectName(config: VeluConfig): string {
  const fromName = typeof config.name === "string" ? config.name.trim() : "";
  if (fromName) return fromName;
  const fromTitle = typeof config.title === "string" ? config.title.trim() : "";
  if (fromTitle) return fromTitle;
  return "Documentation";
}

function resolveProjectDescription(config: VeluConfig): string {
  if (typeof config.description === "string") return config.description.trim();
  return "";
}

function resolveCliVersion(): string {
  try {
    const raw = readFileSync(CLI_PACKAGE_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version.trim();
    }
  } catch {
    // ignore and fallback
  }
  return "unknown";
}

function writeProjectConstFile(config: VeluConfig, outDir: string) {
  const constPayload = {
    name: resolveProjectName(config),
    description: resolveProjectDescription(config),
    version: resolveCliVersion(),
  };

  const constPath = join(outDir, "public", "const.json");
  writeFileSync(constPath, `${JSON.stringify(constPayload, null, 2)}\n`, "utf-8");
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isInsideDocsRoot(docsDir: string, targetPath: string): boolean {
  const relPath = relative(docsDir, targetPath);
  if (!relPath) return true;
  if (relPath.startsWith("..")) return false;
  if (/^[a-zA-Z]:/.test(relPath)) return false;
  return true;
}

function shouldMirrorSourceFile(filePath: string): boolean {
  return SOURCE_MIRROR_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function shouldRewriteImports(filePath: string): boolean {
  return IMPORT_REWRITE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function rewriteImportSpecifier(
  specifier: string,
  sourceFilePath: string,
  outputFilePath: string,
  docsDir: string,
  mirrorDir: string
): string {
  const match = specifier.match(/^([^?#]+)([?#].*)?$/);
  if (!match) return specifier;
  const rawPath = match[1];
  const suffix = match[2] ?? "";

  let resolvedSourcePath: string | null = null;
  if (rawPath.startsWith("/")) {
    resolvedSourcePath = join(docsDir, rawPath.slice(1));
  } else if (rawPath.startsWith("./") || rawPath.startsWith("../")) {
    resolvedSourcePath = resolve(dirname(sourceFilePath), rawPath);
  }

  if (!resolvedSourcePath || !isInsideDocsRoot(docsDir, resolvedSourcePath)) {
    return specifier;
  }

  const relToDocs = relative(docsDir, resolvedSourcePath);
  const mirrorTargetPath = join(mirrorDir, relToDocs);
  const relFromOutput = relative(dirname(outputFilePath), mirrorTargetPath);
  const normalizedRel = toPosixPath(relFromOutput || ".");
  const withDotPrefix = normalizedRel.startsWith(".") ? normalizedRel : `./${normalizedRel}`;
  return `${withDotPrefix}${suffix}`;
}

function rewriteImportsInContent(
  content: string,
  sourceFilePath: string,
  outputFilePath: string,
  docsDir: string,
  mirrorDir: string
): string {
  const importFromPattern = /^(\s*import\s+)(.+?)(\s+from\s*["'])([^"']+)(["']\s*;?\s*)$/;
  const exportFromPattern = /^(\s*export\b[^\n]*?\bfrom\s*["'])([^"']+)(["'])/;
  const sideEffectImportPattern = /^(\s*import\s*["'])([^"']+)(["'])/;
  const fencePattern = /^\s*(```+|~~~+)/;
  const mdxOutput = (() => {
    const ext = extname(outputFilePath).toLowerCase();
    return ext === ".md" || ext === ".mdx";
  })();

  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let injectedMdxHelperImport = false;

  function importPathFromSpecifier(specifier: string): string {
    const match = specifier.match(/^([^?#]+)/);
    return match ? match[1] : specifier;
  }

  function isLocalSpecifier(specifier: string): boolean {
    return specifier.startsWith("/") || specifier.startsWith("./") || specifier.startsWith("../");
  }

  function isMdxSpecifier(specifier: string): boolean {
    const base = importPathFromSpecifier(specifier).toLowerCase();
    return base.endsWith(".mdx") || base.endsWith(".md");
  }

  function parseDefaultImport(clause: string): { defaultName?: string; namedPart?: string } {
    const trimmed = clause.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("*")) return {};

    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) return { defaultName: trimmed };
      return {};
    }

    const defaultName = trimmed.slice(0, commaIdx).trim();
    const remainder = trimmed.slice(commaIdx + 1).trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(defaultName)) return {};
    if (!remainder.startsWith("{") && !remainder.startsWith("*")) return {};
    return { defaultName, namedPart: remainder };
  }

  for (const line of lines) {
    const fenceMatch = line.match(fencePattern);
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = currentFenceChar;
      } else if (fenceChar === currentFenceChar) {
        inFence = false;
        fenceChar = "";
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    const importMatch = line.match(importFromPattern);
    if (importMatch) {
      const importPrefix = importMatch[1];
      const importClause = importMatch[2];
      const fromPrefix = importMatch[3];
      const specifier = importMatch[4];
      const importSuffix = importMatch[5];
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath, docsDir, mirrorDir);
      const { defaultName, namedPart } = parseDefaultImport(importClause);
      const shouldWrapDefaultImport =
        mdxOutput && Boolean(defaultName) && isLocalSpecifier(specifier) && isMdxSpecifier(specifier);

      if (shouldWrapDefaultImport && defaultName) {
        if (!injectedMdxHelperImport) {
          out.push('import { getMDXComponents as __veluGetMDXComponents } from "@/mdx-components";');
          injectedMdxHelperImport = true;
        }

        const rawName = `__veluRaw_${defaultName}`;
        const wrappedClause = namedPart ? `${rawName}, ${namedPart}` : rawName;
        out.push(`${importPrefix}${wrappedClause}${fromPrefix}${rewritten}${importSuffix}`);
        out.push(`export const ${defaultName} = (props) => <${rawName} {...props} components={__veluGetMDXComponents()} />;`);
        continue;
      }

      out.push(`${importPrefix}${importClause}${fromPrefix}${rewritten}${importSuffix}`);
      continue;
    }

    let nextLine = line.replace(exportFromPattern, (_, prefix: string, specifier: string, suffix: string) => {
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath, docsDir, mirrorDir);
      return `${prefix}${rewritten}${suffix}`;
    });

    nextLine = nextLine.replace(sideEffectImportPattern, (_, prefix: string, specifier: string, suffix: string) => {
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath, docsDir, mirrorDir);
      return `${prefix}${rewritten}${suffix}`;
    });

    out.push(nextLine);
  }

  return out.join("\n");
}

function copyMirroredSourceFile(
  srcPath: string,
  docsDir: string,
  mirrorDir: string,
  variables: Record<string, string>,
) {
  if (!shouldMirrorSourceFile(srcPath)) return;
  if (!isInsideDocsRoot(docsDir, srcPath)) return;

  const relPath = relative(docsDir, srcPath);
  const destPath = join(mirrorDir, relPath);
  mkdirSync(dirname(destPath), { recursive: true });

  if (shouldRewriteImports(srcPath)) {
    let raw = readFileSync(srcPath, "utf-8");
    raw = replaceVariablesInString(raw, variables, relPath, true);
    const rewritten = rewriteImportsInContent(raw, srcPath, destPath, docsDir, mirrorDir);
    writeFileSync(destPath, rewritten, "utf-8");
    return;
  }

  const extension = extname(srcPath).toLowerCase();
  if (VARIABLE_SUBSTITUTION_EXTENSIONS.has(extension)) {
    const raw = readFileSync(srcPath, "utf-8");
    const substituted = replaceVariablesInString(raw, variables, relPath, true);
    writeFileSync(destPath, substituted, "utf-8");
    return;
  }

  copyFileSync(srcPath, destPath);
}

function rebuildSourceMirror(docsDir: string, mirrorDir: string, variables: Record<string, string>) {
  rmSync(mirrorDir, { recursive: true, force: true });
  mkdirSync(mirrorDir, { recursive: true });

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
      if (!shouldMirrorSourceFile(srcPath)) continue;
      copyMirroredSourceFile(srcPath, docsDir, mirrorDir, variables);
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
  src: string;   // original page reference
  dest: string;  // destination path under content/docs (without extension)
  kind: "file" | "openapi-operation";
  openapiSpec?: string;
  openapiMethod?: string;
  openapiEndpoint?: string;
  openapiKind?: "path" | "webhook";
  title?: string;
  description?: string;
  deprecated?: boolean;
  version?: string;
  content?: string;
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

function buildArtifacts(config: VeluConfig, docsDirForOpenApi?: string): BuildArtifacts {
  const pageMap: PageMapping[] = [];
  const metaFiles: MetaFile[] = [];
  const rootTabs = (config.navigation.tabs || []).filter((tab) => !tab.href);
  const rootPages = rootTabs.map((tab) => tab.slug);
  const defaultOpenApiSpec = resolveDefaultOpenApiSpec(config.navigation.openapi ?? config.openapi);
  let firstPage = "quickstart";
  let hasFirstPage = false;
  const usedDestinations = new Set<string>();

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

  function uniqueDestination(dest: string): string {
    if (!usedDestinations.has(dest)) {
      usedDestinations.add(dest);
      return dest;
    }
    let count = 2;
    while (usedDestinations.has(`${dest}-${count}`)) count += 1;
    const candidate = `${dest}-${count}`;
    usedDestinations.add(candidate);
    return candidate;
  }

  function metaEntryForDestination(baseDir: string, destination: string): string {
    const fromParts = baseDir.split("/").filter(Boolean);
    const toParts = destination.split("/").filter(Boolean);

    let index = 0;
    while (index < fromParts.length && index < toParts.length && fromParts[index] === toParts[index]) {
      index += 1;
    }

    const up = Array(fromParts.length - index).fill("..");
    const down = toParts.slice(index);
    const rel = [...up, ...down].join("/");
    return rel || pageBasename(destination);
  }

  function resolveGenerationDestination(openapi: VeluOpenApiSource | undefined, fallback: string): string {
    const override = resolveOpenApiDirectory(openapi);
    if (!override) return fallback;
    if (!fallback) return override;
    if (override === fallback || override.startsWith(`${fallback}/`)) return override;
    return `${fallback}/${override}`;
  }

  function toPageMapping(item: string, destDir: string, inheritedSpec?: string): PageMapping {
    const parsedOpenApi = parseOpenApiOperationRef(item, inheritedSpec);
    if (!parsedOpenApi) {
      const basename = pageBasename(item);
      const dest = uniqueDestination(`${destDir}/${basename}`);
      return { src: item, dest, kind: "file" };
    }

    const slug = slugFromOpenApiOperation(parsedOpenApi.method, parsedOpenApi.endpoint);
    const dest = uniqueDestination(`${destDir}/${slug}`);
    return {
      src: item,
      dest,
      kind: "openapi-operation",
      openapiSpec: parsedOpenApi.spec,
      openapiMethod: parsedOpenApi.method,
      openapiEndpoint: parsedOpenApi.endpoint,
      openapiKind: parsedOpenApi.kind,
      title: parsedOpenApi.title,
      description: parsedOpenApi.description,
      deprecated: parsedOpenApi.deprecated,
      version: parsedOpenApi.version,
      content: parsedOpenApi.content,
    };
  }

  function resolveInheritedVersion(value: unknown, inherited?: string): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    return inherited;
  }

  function toPageMappingWithVersion(
    item: string,
    destDir: string,
    inheritedSpec?: string,
    inheritedVersion?: string,
  ): PageMapping {
    const mapping = toPageMapping(item, destDir, inheritedSpec);
    if (mapping.kind === "openapi-operation" && mapping.version === undefined) {
      mapping.version = inheritedVersion;
    }
    return mapping;
  }

  function toOperationMapping(
    ref: ParsedOpenApiOperationRef,
    destDir: string,
    inheritedVersion?: string,
  ): PageMapping {
    const slug = slugFromOpenApiOperation(ref.method, ref.endpoint);
    const dest = uniqueDestination(`${destDir}/${slug}`);
    return {
      src: `${ref.spec ? `${ref.spec} ` : ""}${ref.method} ${ref.endpoint}`,
      dest,
      kind: "openapi-operation",
      openapiSpec: ref.spec,
      openapiMethod: ref.method,
      openapiEndpoint: ref.endpoint,
      openapiKind: ref.kind,
      title: ref.title,
      description: ref.description,
      deprecated: ref.deprecated,
      version: ref.version ?? inheritedVersion,
      content: ref.content,
    };
  }

  function buildOpenApiMappings(
    openapi: VeluOpenApiSource | undefined,
    destDir: string,
    fallbackSpec?: string,
    inheritedVersion?: string,
  ): PageMapping[] {
    if (!docsDirForOpenApi) return [];
    const specs = resolveOpenApiSpecList(openapi);
    if (specs.length === 0 && fallbackSpec) specs.push(fallbackSpec);
    if (specs.length === 0) return [];

    const output: PageMapping[] = [];
    const seen = new Set<string>();
    for (const spec of specs) {
      for (const operation of loadOpenApiOperations(spec, docsDirForOpenApi)) {
        const key = `${operation.spec ?? ""}::${operation.kind ?? "path"}::${operation.method}::${operation.endpoint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(toOperationMapping(operation, destDir, inheritedVersion));
      }
    }
    return output;
  }

  function addGroup(
    group: VeluGroup,
    parentDir: string,
    inheritedOpenApiSpec?: string,
    inheritedVersion?: string,
  ) {
    const groupDir = `${parentDir}/${group.slug}`;
    const pages: string[] = [];
    const openApiSpec = resolveDefaultOpenApiSpec(group.openapi) ?? inheritedOpenApiSpec;
    const groupVersion = resolveInheritedVersion(group.version, inheritedVersion);

    const groupPageItems = Array.isArray(group.pages) ? group.pages : [];
    for (const item of groupPageItems) {
      if (typeof item === "string") {
        const mapping = toPageMappingWithVersion(item, groupDir, openApiSpec, groupVersion);
        pageMap.push(mapping);
        pages.push(metaEntryForDestination(groupDir, mapping.dest));
        trackFirstPage(mapping.dest);
      } else if (isGroup(item)) {
        addGroup(item, groupDir, openApiSpec, groupVersion);
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

    if (groupPageItems.length === 0 && group.openapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(group.openapi, groupDir);
      const generatedMappings = buildOpenApiMappings(group.openapi, generatedDestDir, openApiSpec, groupVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        pages.push(metaEntryForDestination(groupDir, mapping.dest));
        trackFirstPage(mapping.dest);
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
    const tabOpenApiSpec = resolveDefaultOpenApiSpec(tab.openapi) ?? defaultOpenApiSpec;
    const tabVersion = resolveInheritedVersion(tab.version);

    if (tab.groups) {
      for (const group of tab.groups) {
        addGroup(group, tab.slug, tabOpenApiSpec, tabVersion);
        tabPages.push(group.hidden ? `!${group.slug}` : group.slug);
      }
    }

    const tabPageItems = Array.isArray(tab.pages) ? tab.pages : [];
    if (tabPageItems.length > 0) {
      for (const item of tabPageItems) {
        if (typeof item === "string") {
          const mapping = toPageMappingWithVersion(item, tab.slug, tabOpenApiSpec, tabVersion);
          pageMap.push(mapping);
          tabPages.push(metaEntryForDestination(tab.slug, mapping.dest));
          trackFirstPage(mapping.dest);
        } else {
          tabPages.push(metaEntry(item));
        }
      }
    }

    if ((tab.groups?.length ?? 0) === 0 && tabPageItems.length === 0 && tab.openapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(tab.openapi, tab.slug);
      const generatedMappings = buildOpenApiMappings(tab.openapi, generatedDestDir, tabOpenApiSpec, tabVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        tabPages.push(metaEntryForDestination(tab.slug, mapping.dest));
        trackFirstPage(mapping.dest);
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
  const { config, rawConfig, variables } = loadConfig(docsDir);

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
  const sourceMirrorDir = join(outDir, SOURCE_MIRROR_DIR);
  rebuildSourceMirror(docsDir, sourceMirrorDir, variables);

  // ── 3. Copy config into the generated project ────────────────────────────
  const serializedConfig = `${JSON.stringify(rawConfig, null, 2)}\n`;
  writeFileSync(join(outDir, PRIMARY_CONFIG_NAME), serializedConfig, "utf-8");
  writeFileSync(join(outDir, LEGACY_CONFIG_NAME), serializedConfig, "utf-8");
  console.log(`📋 Copied ${configName} as ${PRIMARY_CONFIG_NAME} (and legacy ${LEGACY_CONFIG_NAME})`);

  // ── 3b. Copy static assets from docs project into public/ ─────────────────
  copyStaticAssets(docsDir, join(outDir, "public"));
  writeRedirectArtifacts(config, outDir);
  writeProjectConstFile(rawConfig, outDir);
  if ((config.redirects ?? []).length > 0) {
    console.log("↪️  Generated redirect artifacts");
  }
  console.log("🧾 Generated const.json");
  console.log("🖼️  Copied static assets");

  // ── 4. Build content + metadata artifacts ────────────────────────────────
  const contentDir = join(outDir, "content", "docs");
  const navLanguages = config.navigation.languages;
  const simpleLanguages = config.languages || [];

  function processPage(srcPath: string, destPath: string, slug: string) {
    mkdirSync(dirname(destPath), { recursive: true });
    let content = readFileSync(srcPath, "utf-8");
    content = replaceVariablesInString(content, variables, relative(docsDir, srcPath), true);
    if (!content.startsWith("---")) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
      if (titleMatch) {
        content = content.replace(/^#\s+.+$/m, "").trimStart();
      }
      content = `---\ntitle: "${title}"\n---\n\n${content}`;
    }
    content = rewriteImportsInContent(content, srcPath, destPath, docsDir, sourceMirrorDir);
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

    function sanitizeFrontmatterValue(value: string): string {
      return value.replace(/\r?\n+/g, " ").replace(/"/g, '\\"').trim();
    }

    // Copy pages using explicit source paths from docs.json/velu.json
    for (const mapping of artifacts.pageMap) {
      const destPath = join(
        contentDir,
        storagePrefix ? `${storagePrefix}/${mapping.dest}.mdx` : `${mapping.dest}.mdx`,
      );

      if (mapping.kind === "openapi-operation") {
        mkdirSync(dirname(destPath), { recursive: true });
        const operationLabel = `${mapping.openapiMethod ?? "GET"} ${mapping.openapiEndpoint ?? "/"}`;
        const normalizedSpec = normalizeOpenApiSpecForFrontmatter(mapping.openapiSpec);
        const openapiValue = normalizedSpec
          ? `${normalizedSpec} ${operationLabel}`
          : operationLabel;
        const title = sanitizeFrontmatterValue(mapping.title ?? operationLabel);
        const description = typeof mapping.description === "string"
          ? sanitizeFrontmatterValue(mapping.description)
          : "";
        const version = typeof mapping.version === "string"
          ? sanitizeFrontmatterValue(mapping.version)
          : "";
        const openapi = openapiValue.replace(/"/g, '\\"');
        const warning = normalizedSpec
          ? ""
          : "\n> Warning: No OpenAPI spec source was resolved for this operation. Set `openapi` on this tab/group/navigation or at the top level.\n";
        const descriptionLine = description ? `\ndescription: "${description}"` : "";
        const deprecatedLine = mapping.deprecated === true ? `\ndeprecated: true` : "";
        const statusLine = mapping.deprecated === true ? `\nstatus: "deprecated"` : "";
        const versionLine = version ? `\nversion: "${version}"` : "";
        const content = typeof mapping.content === "string"
          ? `${replaceVariablesInString(mapping.content.trim(), variables, `openapi:${mapping.dest}`, true)}\n`
          : "";
        writeFileSync(
          destPath,
          `---\ntitle: "${title}"${descriptionLine}${deprecatedLine}${statusLine}${versionLine}\nopenapi: "${openapi}"\n---\n${warning}${content}`,
          "utf-8",
        );
        continue;
      }

      const src = mapping.src;
      // Check for .mdx first, then .md
      let srcPath = join(docsDir, `${src}.mdx`);
      let ext = ".mdx";
      if (!existsSync(srcPath)) {
        srcPath = join(docsDir, `${src}.md`);
        ext = ".md";
      }
      if (!existsSync(srcPath)) {
        console.warn(`Warning: Missing page source: ${src}${ext} (language: ${langCode})`);
        continue;
      }
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
      const artifacts = buildArtifacts(langConfig, docsDir);
      writeLangContent(langEntry.language, artifacts, isDefault, true);
      totalPages += artifacts.pageMap.length;
      totalMeta += artifacts.metaFiles.length;
      rootPages.push(`!${langEntry.language}`);
    }

    const rootMetaPath = join(contentDir, "meta.json");
    writeFileSync(rootMetaPath, JSON.stringify({ pages: rootPages }, null, 2) + "\n", "utf-8");
  } else {
    // ── Mode 2: Simple (single-lang or same-nav multi-lang) ───────────
    const artifacts = buildArtifacts(config, docsDir);
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
  // Resolve fonts config into { heading?, body? } shape
  const resolvedFonts = (() => {
    const raw = config.fonts;
    if (!raw) return undefined;
    if ('family' in raw && typeof (raw as Record<string, unknown>).family === 'string') {
      return { heading: raw as { family: string; weight?: number; source?: string; format?: "woff" | "woff2" }, body: raw as { family: string; weight?: number; source?: string; format?: "woff" | "woff2" } };
    }
    const obj = raw as { heading?: { family: string; weight?: number; source?: string; format?: "woff" | "woff2" }; body?: { family: string; weight?: number; source?: string; format?: "woff" | "woff2" } };
    return (obj.heading || obj.body) ? obj : undefined;
  })();

  const themeCss = generateThemeCss({
    theme: config.theme,
    colors: config.colors,
    appearance: config.appearance,
    styling: config.styling,
    fonts: resolvedFonts,
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
