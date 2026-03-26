import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { normalizeConfigNavigation } from "./navigation-normalize.js";
const PRIMARY_CONFIG_NAME = "docs.json";
const LEGACY_CONFIG_NAME = "velu.json";

function resolveConfigPath(docsDir: string): string | null {
  const primary = join(docsDir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  const legacy = join(docsDir, LEGACY_CONFIG_NAME);
  if (existsSync(legacy)) return legacy;
  return null;
}

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
  version?: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
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
  slug?: string;
  icon?: string;
  iconType?: string;
  tag?: string;
  version?: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
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
  asyncapi?: VeluOpenApiSource;
  groups?: VeluGroup[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluTab {
  tab: string;
  slug?: string;
  icon?: string;
  iconType?: string;
  version?: string;
  href?: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
  pages?: (string | VeluSeparator | VeluLink)[];
  groups?: VeluGroup[];
  menu?: VeluMenuItem[];
}

interface VeluLanguageNav {
  language: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
  tabs: VeluTab[];
}

interface VeluProductNav {
  product: string;
  icon?: string;
  iconType?: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
  tabs?: VeluTab[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluVersionNav {
  version: string;
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
  tabs: VeluTab[];
}

type VeluOpenApiSource = string | string[] | Record<string, unknown>;

interface VeluFontDefinition {
  family: string;
  weight?: number;
  source?: string;
  format?: "woff" | "woff2";
}

interface VeluConfig {
  $schema?: string;
  variables?: Record<string, string>;
  languages?: string[];
  icons?: {
    library?: "fontawesome" | "lucide" | "tabler";
  };
  theme?: string;
  colors?: { primary?: string; light?: string; dark?: string };
  appearance?: "system" | "light" | "dark";

  fonts?: VeluFontDefinition | { heading?: VeluFontDefinition; body?: VeluFontDefinition };
  openapi?: VeluOpenApiSource;
  asyncapi?: VeluOpenApiSource;
  api?: {
    baseUrl?: string;
    playground?: {
      mode?: string;
      display?: string;
      proxy?: boolean;
    };
    examples?: {
      languages?: string[];
      defaults?: "required" | "all";
      prefill?: boolean;
      autogenerate?: boolean;
    };
    mdx?: {
      server?: string;
      auth?: {
        method?: "bearer" | "basic" | "key" | "none";
        name?: string;
      };
    };
  };
  metadata?: {
    timestamp?: boolean;
  };
  footer?: {
    socials?: Record<string, unknown>;
  };
  footerSocials?: Record<string, unknown>;
  navigation: {
    openapi?: VeluOpenApiSource;
    asyncapi?: VeluOpenApiSource;
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

const HTTP_METHODS = new Set([
  "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE", "CONNECT", "WEBHOOK",
]);

function isOpenApiOperationReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const withSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withSpec) {
    const method = withSpec[2].toUpperCase();
    const endpoint = withSpec[3].trim();
    if (!HTTP_METHODS.has(method)) return false;
    if (method === "WEBHOOK") return endpoint.length > 0;
    return endpoint.startsWith("/");
  }
  const noSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (!noSpec) return false;
  const method = noSpec[1].toUpperCase();
  const endpoint = noSpec[2].trim();
  if (!HTTP_METHODS.has(method)) return false;
  if (method === "WEBHOOK") return endpoint.length > 0;
  return endpoint.startsWith("/");
}

function isAsyncApiChannelReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const withSpec = trimmed.match(/^(\S+)\s+(.+)$/);
  if (!withSpec) return false;
  const first = withSpec[1].trim();
  const maybeMethod = first.toUpperCase();
  if (HTTP_METHODS.has(maybeMethod)) return false;
  const looksLikeSpec =
    first.startsWith('/') ||
    first.startsWith('./') ||
    first.startsWith('../') ||
    /^https?:\/\//i.test(first) ||
    first.endsWith('.json') ||
    first.endsWith('.yaml') ||
    first.endsWith('.yml');
  return looksLikeSpec && withSpec[2].trim().length > 0;
}

function loadJson(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === "object" && item !== null && "group" in item;
}

function isPageString(item: unknown): item is string {
  return typeof item === "string";
}

interface PageWithTab {
  page: string;
  tab: string | null;
  tabSlug: string | null;
}

function collectPagesFromTabs(tabs: VeluTab[]): string[] {
  return collectPagesWithTabsFromTabs(tabs).map((p) => p.page);
}

function collectPagesWithTabsFromTabs(tabs: VeluTab[]): PageWithTab[] {
  const pages: PageWithTab[] = [];

  function collectFromGroup(group: VeluGroup, tab: string | null, tabSlug: string | null) {
    for (const item of group.pages) {
      if (isPageString(item)) {
        pages.push({ page: item, tab, tabSlug });
      } else if (isGroup(item)) {
        collectFromGroup(item, tab, tabSlug);
      }
    }
  }

  for (const tab of tabs) {
    const tabName = tab.tab || null;
    const tabSlug = tab.slug || tabName;

    if (tab.pages) {
      for (const item of tab.pages) {
        if (isPageString(item)) {
          pages.push({ page: item, tab: tabName, tabSlug });
        }
      }
    }
    if (tab.groups) {
      for (const group of tab.groups) {
        collectFromGroup(group, tabName, tabSlug);
      }
    }
  }

  return pages;
}

function collectPages(config: VeluConfig): string[] {
  const tabs = config.navigation.languages && config.navigation.languages.length > 0
    ? config.navigation.languages.flatMap((lang) => lang.tabs)
    : (config.navigation.tabs ?? []);
  return collectPagesFromTabs(tabs);
}

function collectPagesByLanguage(config: VeluConfig): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  if (config.navigation.languages && config.navigation.languages.length > 0) {
    for (const lang of config.navigation.languages) {
      grouped[lang.language] = collectPagesFromTabs(lang.tabs);
    }
    return grouped;
  }

  const basePages = collectPagesFromTabs(config.navigation.tabs ?? []);
  if (config.languages && config.languages.length > 0) {
    for (const lang of config.languages) {
      grouped[lang] = [...basePages];
    }
    return grouped;
  }

  grouped.en = basePages;
  return grouped;
}

function collectPagesWithTabsByLanguage(config: VeluConfig): Record<string, PageWithTab[]> {
  const grouped: Record<string, PageWithTab[]> = {};

  if (config.navigation.languages && config.navigation.languages.length > 0) {
    for (const lang of config.navigation.languages) {
      grouped[lang.language] = collectPagesWithTabsFromTabs(lang.tabs);
    }
    return grouped;
  }

  const basePages = collectPagesWithTabsFromTabs(config.navigation.tabs ?? []);
  if (config.languages && config.languages.length > 0) {
    for (const lang of config.languages) {
      grouped[lang] = [...basePages];
    }
    return grouped;
  }

  grouped.en = basePages;
  return grouped;
}

function validateVeluConfig(docsDir: string, schemaPath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const configPath = resolveConfigPath(docsDir);
  if (!configPath) {
    return {
      valid: false,
      errors: [`docs.json or velu.json not found at ${join(docsDir, PRIMARY_CONFIG_NAME)}`],
    };
  }

  if (!existsSync(schemaPath)) {
    return { valid: false, errors: [`Schema not found at ${schemaPath}`] };
  }

  const schema = loadJson(schemaPath) as AnySchema;
  const rawConfig = loadJson(configPath) as VeluConfig;

  // Validate against JSON schema
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const schemaValid = validate(rawConfig);

  if (!schemaValid && validate.errors) {
    for (const err of validate.errors) {
      errors.push(`Schema: ${err.instancePath || "/"} ${err.message}`);
    }
  }

  const config = normalizeConfigNavigation(rawConfig);

  // Validate that all referenced page files exist (.mdx or .md)
  const pages = collectPages(config);
  for (const page of pages) {
    if (isOpenApiOperationReference(page)) continue;
    if (isAsyncApiChannelReference(page)) continue;
    const mdxPath = join(docsDir, `${page}.mdx`);
    const mdPath = join(docsDir, `${page}.md`);
    if (!existsSync(mdxPath) && !existsSync(mdPath)) {
      errors.push(`Missing page: ${page}.md or ${page}.mdx (expected at ${mdPath})`);
    }
  }

  // Check for duplicate page references
  if (config.navigation.languages && config.navigation.languages.length > 0) {
    for (const lang of config.navigation.languages) {
      const seen = new Set<string>();
      const langPages = collectPagesFromTabs(lang.tabs);
      for (const page of langPages) {
        if (seen.has(page)) {
          errors.push(`Duplicate page reference in language '${lang.language}': ${page}`);
        }
        seen.add(page);
      }
    }
  } else {
    const seen = new Set<string>();
    for (const page of pages) {
      if (seen.has(page)) {
        errors.push(`Duplicate page reference: ${page}`);
      }
      seen.add(page);
    }
  }

  return { valid: errors.length === 0, errors };
}

export { validateVeluConfig, collectPages, collectPagesByLanguage, collectPagesWithTabsByLanguage, VeluConfig, VeluGroup, VeluTab, VeluSeparator, VeluLink, VeluAnchor, type PageWithTab };
