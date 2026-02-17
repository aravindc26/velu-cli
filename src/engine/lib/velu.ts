import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeConfigNavigation } from './navigation-normalize';
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

function resolveConfigPath(cwd: string): string {
  const primary = resolve(cwd, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  return resolve(cwd, LEGACY_CONFIG_NAME);
}

interface VeluTab {
  tab: string;
  slug?: string;
  href?: string;
  pages?: Array<string | VeluSeparator | VeluLink>;
  groups?: VeluGroup[];
}

interface VeluSeparator {
  separator: string;
}

interface VeluLink {
  href: string;
  label: string;
}

interface VeluGroup {
  group: string;
  slug?: string;
  pages: Array<string | VeluGroup | VeluSeparator | VeluLink>;
}

interface VeluAnchor {
  anchor: string;
  href?: string;
  icon?: string;
  iconType?: string;
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

interface VeluLanguageNav {
  language: string;
  tabs: VeluTab[];
}

interface VeluProductNav {
  product: string;
  description?: string;
  icon?: string;
  iconType?: string;
  hidden?: boolean;
  href?: string;
}

interface VeluVersionNav {
  version: string;
  default?: boolean;
  hidden?: boolean;
  href?: string;
}

export interface VeluProductOption {
  product: string;
  slug: string;
  description?: string;
  icon?: string;
  iconType?: string;
  tabSlugs: string[];
  defaultPath: string;
}

export interface VeluVersionOption {
  version: string;
  slug: string;
  isDefault: boolean;
  tabSlugs: string[];
  defaultPath: string;
}

interface VeluConfig {
  icons?: {
    library?: string;
  };
  appearance?: 'system' | 'light' | 'dark';
  languages?: string[];
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

let cachedConfig: VeluConfig | null = null;

function loadVeluConfig(): VeluConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = resolveConfigPath(process.cwd());
  const raw = readFileSync(configPath, 'utf-8');
  cachedConfig = normalizeConfigNavigation(JSON.parse(raw)) as VeluConfig;
  return cachedConfig;
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === 'object' && item !== null && 'group' in item;
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function pageBasename(page: string): string {
  const parts = page.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? page;
}

function findFirstPageInGroup(group: VeluGroup): string | undefined {
  for (const item of group.pages) {
    if (typeof item === 'string') return item;
    if (isGroup(item)) {
      const nested = findFirstPageInGroup(item);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findFirstPageInTab(tab: VeluTab): string | undefined {
  if (tab.pages) {
    for (const item of tab.pages) {
      if (typeof item === 'string') return item;
    }
  }
  if (tab.groups) {
    for (const group of tab.groups) {
      const nested = findFirstPageInGroup(group);
      if (nested) return nested;
    }
  }
  return undefined;
}

function parseVersionParts(version: string): number[] {
  const parts = version.match(/\d+/g);
  return parts ? parts.map((n) => Number(n)) : [];
}

function compareVersionParts(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export function getExternalTabs(): Array<{ label: string; href: string }> {
  const config = loadVeluConfig();
  const tabs = config.navigation?.tabs ?? [];
  const globalTabs = config.navigation?.global?.tabs ?? [];

  const tabLinks = tabs
    .filter((tab): tab is VeluTab & { href: string } => typeof tab.href === 'string' && tab.href.length > 0)
    .map((tab) => ({
      label: tab.tab,
      href: tab.href,
    }));

  const globalLinks = globalTabs
    .filter((tab): tab is VeluGlobalTab => typeof tab.href === 'string' && tab.href.length > 0)
    .map((tab) => ({
      label: tab.tab,
      href: tab.href,
    }));

  return [...tabLinks, ...globalLinks];
}

export function getNavbarAnchors(): VeluAnchor[] {
  const config = loadVeluConfig();
  return (config.navigation.anchors ?? []).filter(
    (a): a is VeluAnchor & { href: string } => typeof a.href === 'string' && a.href.length > 0 && !a.hidden
  );
}

export function getGlobalAnchors(): VeluAnchor[] {
  const config = loadVeluConfig();
  return (config.navigation.global?.anchors ?? []).filter(
    (a): a is VeluAnchor & { href: string } => typeof a.href === 'string' && a.href.length > 0 && !a.hidden
  );
}

export function getLanguages(): string[] {
  const config = loadVeluConfig();
  // Prefer navigation.languages codes, fall back to top-level languages
  if (config.navigation.languages && config.navigation.languages.length > 0) {
    return config.navigation.languages.map((l) => l.language);
  }
  return config.languages ?? [];
}

export function getProductOptions(): VeluProductOption[] {
  const config = loadVeluConfig();
  const products = (config.navigation.products ?? []).filter((p) => !p.hidden);
  if (products.length === 0) return [];

  const allTabs = config.navigation.tabs ?? [];

  return products.map((product, index) => {
    const prefix = slugify(product.product, `product-${index + 1}`);
    const productTabs = allTabs.filter((tab) => {
      const slug = tab.slug ?? '';
      return slug === prefix || slug.startsWith(`${prefix}/`);
    });

    const tabSlugs = productTabs
      .map((tab) => tab.slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);

    const firstTab = productTabs[0];
    const firstPage = firstTab ? findFirstPageInTab(firstTab) : undefined;
    const defaultPath = firstTab
      ? (firstPage ? `/${firstTab.slug}/${pageBasename(firstPage)}` : `/${firstTab.slug}`)
      : (product.href ?? '/');

    return {
      product: product.product,
      slug: prefix,
      description: product.description,
      icon: product.icon,
      iconType: product.iconType,
      tabSlugs,
      defaultPath,
    };
  });
}

export function getVersionOptions(): VeluVersionOption[] {
  const config = loadVeluConfig();
  const versions = (config.navigation.versions ?? []).filter((v) => !v.hidden);
  if (versions.length === 0) return [];

  const allTabs = config.navigation.tabs ?? [];

  const baseEntries = versions.map((version, index) => {
    const prefix = slugify(version.version, `version-${index + 1}`);
    const versionTabs = allTabs.filter((tab) => {
      const slug = tab.slug ?? '';
      return slug === prefix || slug.startsWith(`${prefix}/`);
    });

    const tabSlugs = versionTabs
      .map((tab) => tab.slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0);

    const firstTab = versionTabs[0];
    const firstPage = firstTab ? findFirstPageInTab(firstTab) : undefined;
    const defaultPath = firstTab
      ? (firstPage ? `/${firstTab.slug}/${pageBasename(firstPage)}` : `/${firstTab.slug}`)
      : (version.href ?? '/');

    return {
      version: version.version,
      slug: prefix,
      explicitDefault: version.default === true,
      versionParts: parseVersionParts(version.version),
      tabSlugs,
      defaultPath,
      order: index,
    };
  });

  const explicitDefault = baseEntries.find((entry) => entry.explicitDefault);
  const latest = explicitDefault
    ?? baseEntries
      .slice()
      .sort((a, b) => {
        const cmp = compareVersionParts(b.versionParts, a.versionParts);
        if (cmp !== 0) return cmp;
        return a.order - b.order;
      })[0];

  return baseEntries.map((entry) => ({
    version: entry.version,
    slug: entry.slug,
    isDefault: entry.slug === latest?.slug,
    tabSlugs: entry.tabSlugs,
    defaultPath: entry.defaultPath,
  }));
}

export function getAppearance(): 'system' | 'light' | 'dark' {
  const appearance = loadVeluConfig().appearance;
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return 'system';
}

export type VeluIconLibrary = 'fontawesome' | 'lucide' | 'tabler';

export function getIconLibrary(): VeluIconLibrary {
  const raw = loadVeluConfig().icons?.library;
  if (raw === 'lucide' || raw === 'tabler' || raw === 'fontawesome') return raw;
  return 'fontawesome';
}
