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

type VeluApiAuthMethod = 'bearer' | 'basic' | 'key' | 'none';

interface VeluApiConfig {
  baseUrl?: string;
  playground?: {
    mode?: string;
    display?: string;
    proxy?: boolean;
  };
  examples?: {
    languages?: string[];
    defaults?: 'required' | 'all';
    prefill?: boolean;
    autogenerate?: boolean;
  };
  mdx?: {
    server?: string | string[];
    auth?: {
      method?: VeluApiAuthMethod | string;
      name?: string;
    };
  };
}

interface VeluSeoConfig {
  metatags?: Record<string, unknown>;
  indexing?: 'navigable' | 'all' | string;
}

interface VeluThemeAsset {
  light?: string;
  dark?: string;
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
  name?: string;
  title?: string;
  favicon?: string | VeluThemeAsset;
  logo?: string | VeluThemeAsset;
  colors?: {
    primary?: string;
    light?: string;
    dark?: string;
  };
  icons?: {
    library?: string;
  };
  appearance?: 'system' | 'light' | 'dark';
  languages?: string[];
  openapi?: string | string[] | Record<string, unknown>;
  asyncapi?: string | string[] | Record<string, unknown>;
  api?: VeluApiConfig;
  seo?: VeluSeoConfig;
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

type PlaygroundDisplayMode = 'interactive' | 'simple' | 'none' | 'auth';

export interface VeluResolvedApiConfig {
  baseUrl?: string;
  mdxServer?: string;
  mdxServers?: string[];
  authMethod: VeluApiAuthMethod;
  authName?: string;
  playgroundDisplay: PlaygroundDisplayMode;
  playgroundProxyEnabled: boolean;
  exampleLanguages?: string[];
  exampleDefaults: 'required' | 'all';
  examplePrefill: boolean;
  exampleAutogenerate: boolean;
  defaultOpenApiSpec?: string;
  defaultAsyncApiSpec?: string;
}

export interface VeluResolvedSeoConfig {
  metatags: Record<string, string>;
  indexing: 'navigable' | 'all';
}

function normalizePlaygroundDisplay(api: VeluApiConfig | undefined): PlaygroundDisplayMode {
  const display = api?.playground?.display;
  if (display === 'interactive' || display === 'simple' || display === 'none') return display;
  if (display === 'auth') return 'none';

  const mode = api?.playground?.mode;
  if (mode === 'hide' || mode === 'none') return 'none';
  return 'interactive';
}

function normalizeAuthMethod(method: unknown): VeluApiAuthMethod {
  if (method === 'bearer' || method === 'basic' || method === 'key' || method === 'none') return method;
  return 'none';
}

function extractOpenApiSource(openapi: VeluConfig['openapi']): string | string[] | undefined {
  if (typeof openapi === 'string' || Array.isArray(openapi)) return openapi;
  if (openapi && typeof openapi === 'object') {
    const source = (openapi as Record<string, unknown>).source;
    if (typeof source === 'string' || Array.isArray(source)) return source as string | string[];
  }
  return undefined;
}

function resolveDefaultOpenApiSpec(openapi: VeluConfig['openapi']): string | undefined {
  const source = extractOpenApiSource(openapi);
  if (typeof source === 'string' && source.trim()) return source.trim();
  if (Array.isArray(source)) {
    const first = source.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    return typeof first === 'string' ? first.trim() : undefined;
  }
  return undefined;
}

function normalizeExampleLanguages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeMdxServers(value: unknown): string[] | undefined {
  const rawValues = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  const normalized = rawValues
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSeoMetatags(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const tag = key.trim();
    if (!tag) continue;
    if (typeof raw === 'string') {
      const normalized = raw.trim();
      if (normalized) output[tag] = normalized;
      continue;
    }
    if (typeof raw === 'number' || typeof raw === 'boolean') {
      output[tag] = String(raw);
    }
  }
  return output;
}

function normalizeAssetPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeThemeAsset(value: unknown): VeluThemeAsset {
  if (typeof value === 'string') {
    const asset = normalizeAssetPath(value);
    return asset ? { light: asset, dark: asset } : {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const light = normalizeAssetPath(record.light);
  const dark = normalizeAssetPath(record.dark);
  const any = normalizeAssetPath(record.default);
  return {
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
    ...(!light && any ? { light: any } : {}),
    ...(!dark && any ? { dark: any } : {}),
  };
}

function extractOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).origin;
  } catch {
    return undefined;
  }
}

export function getApiConfig(): VeluResolvedApiConfig {
  const config = loadVeluConfig();
  const api = config.api;
  const auth = api?.mdx?.auth;
  const examples = api?.examples;
  const playgroundDisplay = normalizePlaygroundDisplay(api);
  const staticExportBuild = process.env.VELU_STATIC_EXPORT === '1';
  const mdxServers = normalizeMdxServers(api?.mdx?.server);

  return {
    baseUrl: typeof api?.baseUrl === 'string' && api.baseUrl.trim() ? api.baseUrl.trim() : undefined,
    mdxServer: mdxServers?.[0],
    mdxServers,
    authMethod: normalizeAuthMethod(auth?.method),
    authName: typeof auth?.name === 'string' && auth.name.trim() ? auth.name.trim() : undefined,
    playgroundDisplay,
    // Next static export cannot include runtime route handlers such as /api/proxy.
    // Disable proxy automatically for static export builds.
    playgroundProxyEnabled: !staticExportBuild && api?.playground?.proxy !== false,
    exampleLanguages: normalizeExampleLanguages(examples?.languages),
    exampleDefaults: examples?.defaults === 'required' ? 'required' : 'all',
    examplePrefill: examples?.prefill === true,
    exampleAutogenerate: examples?.autogenerate !== false,
    defaultOpenApiSpec: resolveDefaultOpenApiSpec(config.openapi),
    defaultAsyncApiSpec: resolveDefaultOpenApiSpec(config.asyncapi),
  };
}

export function getSeoConfig(): VeluResolvedSeoConfig {
  const config = loadVeluConfig();
  const seo = config.seo;
  const indexing: 'navigable' | 'all' = seo?.indexing === 'all' ? 'all' : 'navigable';
  return {
    metatags: normalizeSeoMetatags(seo?.metatags),
    indexing,
  };
}

export function getSiteName(): string {
  const config = loadVeluConfig();
  const fromName = normalizeAssetPath(config.name);
  if (fromName) return fromName;
  const fromTitle = normalizeAssetPath(config.title);
  if (fromTitle) return fromTitle;
  return 'Velu Docs';
}

export function getSiteFavicon(): string | undefined {
  const config = loadVeluConfig();
  const asset = normalizeThemeAsset(config.favicon);
  return asset.light ?? asset.dark;
}

export function getSiteLogoAsset(): VeluThemeAsset {
  const config = loadVeluConfig();
  return normalizeThemeAsset(config.logo);
}

export function getSitePrimaryColor(): string | undefined {
  const config = loadVeluConfig();
  const colors = config.colors;
  if (!colors) return undefined;
  return normalizeAssetPath(colors.primary) ?? normalizeAssetPath(colors.light) ?? normalizeAssetPath(colors.dark);
}

export function getSiteOrigin(): string {
  const seo = getSeoConfig();
  const envCandidates = [
    process.env.VELU_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ];
  for (const candidate of envCandidates) {
    const origin = extractOrigin(candidate);
    if (origin) return origin;
  }

  const canonicalOrigin = extractOrigin(seo.metatags.canonical);
  if (canonicalOrigin) return canonicalOrigin;

  const ogOrigin = extractOrigin(seo.metatags['og:url']);
  if (ogOrigin) return ogOrigin;

  return 'http://localhost:4321';
}
