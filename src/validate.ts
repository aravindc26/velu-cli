import Ajv, { type AnySchema } from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

interface VeluGroup {
  group: string;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  pages: (string | VeluGroup)[];
}

interface VeluTab {
  tab: string;
  icon?: string;
  href?: string;
  pages?: string[];
  groups?: VeluGroup[];
}

interface VeluConfig {
  $schema?: string;
  navigation: {
    tabs?: VeluTab[];
    groups?: VeluGroup[];
    pages?: string[];
  };
}

function loadJson(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function collectPages(config: VeluConfig): string[] {
  const pages: string[] = [];

  function collectFromGroup(group: VeluGroup) {
    for (const item of group.pages) {
      if (typeof item === "string") {
        pages.push(item);
      } else {
        collectFromGroup(item);
      }
    }
  }

  const nav = config.navigation;

  if (nav.pages) {
    pages.push(...nav.pages);
  }

  if (nav.groups) {
    for (const group of nav.groups) {
      collectFromGroup(group);
    }
  }

  if (nav.tabs) {
    for (const tab of nav.tabs) {
      if (tab.pages) {
        pages.push(...tab.pages);
      }
      if (tab.groups) {
        for (const group of tab.groups) {
          collectFromGroup(group);
        }
      }
    }
  }

  return pages;
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
  const config = loadJson(configPath) as VeluConfig;

  // Validate against JSON schema
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const schemaValid = validate(config);

  if (!schemaValid && validate.errors) {
    for (const err of validate.errors) {
      errors.push(`Schema: ${err.instancePath || "/"} ${err.message}`);
    }
  }

  // Validate that all referenced .md files exist
  const pages = collectPages(config);
  for (const page of pages) {
    const mdPath = join(docsDir, `${page}.md`);
    if (!existsSync(mdPath)) {
      errors.push(`Missing page: ${page}.md (expected at ${mdPath})`);
    }
  }

  // Check for duplicate page references
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page)) {
      errors.push(`Duplicate page reference: ${page}`);
    }
    seen.add(page);
  }

  return { valid: errors.length === 0, errors };
}

export { validateVeluConfig, collectPages, VeluConfig, VeluGroup, VeluTab };
