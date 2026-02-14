import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { normalizeConfigNavigation } from "./navigation-normalize.js";

interface VeluSeparator {
  separator: string;
}

interface VeluLink {
  href: string;
  label: string;
  icon?: string;
}

interface VeluAnchor {
  anchor: string;
  href?: string;
  icon?: string;
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
}

interface VeluGroup {
  group: string;
  slug?: string;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  description?: string;
  hidden?: boolean;
  pages: (string | VeluGroup | VeluSeparator | VeluLink)[];
}

interface VeluMenuItem {
  item: string;
  icon?: string;
  groups?: VeluGroup[];
  pages?: (string | VeluSeparator | VeluLink)[];
}

interface VeluTab {
  tab: string;
  slug?: string;
  icon?: string;
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
  colors?: { primary?: string; light?: string; dark?: string };
  appearance?: "system" | "light" | "dark";
  styling?: { codeblocks?: { theme?: string | { light: string; dark: string } } };
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

function collectPagesFromTabs(tabs: VeluTab[]): string[] {
  const pages: string[] = [];

  function collectFromGroup(group: VeluGroup) {
    for (const item of group.pages) {
      if (isPageString(item)) {
        pages.push(item);
      } else if (isGroup(item)) {
        collectFromGroup(item);
      }
    }
  }

  for (const tab of tabs) {
    if (tab.pages) {
      for (const item of tab.pages) {
        if (isPageString(item)) {
          pages.push(item);
        }
      }
    }
    if (tab.groups) {
      for (const group of tab.groups) {
        collectFromGroup(group);
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

function validateVeluConfig(docsDir: string, schemaPath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const configPath = join(docsDir, "velu.json");
  if (!existsSync(configPath)) {
    return { valid: false, errors: [`velu.json not found at ${configPath}`] };
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

  // Validate that all referenced .md files exist
  const pages = collectPages(config);
  for (const page of pages) {
    const mdPath = join(docsDir, `${page}.md`);
    if (!existsSync(mdPath)) {
      errors.push(`Missing page: ${page}.md (expected at ${mdPath})`);
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

export { validateVeluConfig, collectPages, VeluConfig, VeluGroup, VeluTab, VeluSeparator, VeluLink, VeluAnchor };
