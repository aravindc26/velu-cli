import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeConfigNavigation } from '../../lib/navigation-normalize';
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

function resolveConfigPath(cwd: string): string {
  const primary = resolve(cwd, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  return resolve(cwd, LEGACY_CONFIG_NAME);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface VeluSeparator {
  separator: string;
}

export interface VeluLink {
  href: string;
  label: string;
  icon?: string;
}

export interface VeluAnchor {
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

export interface VeluGlobalTab {
  tab: string;
  href: string;
  icon?: string;
}

export interface VeluGroup {
  group: string;
  slug: string;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  description?: string;
  hidden?: boolean;
  pages: (string | VeluGroup | VeluSeparator | VeluLink)[];
}

export interface VeluTab {
  tab: string;
  slug: string;
  icon?: string;
  href?: string;
  pages?: (string | VeluSeparator | VeluLink)[];
  groups?: VeluGroup[];
}

export interface VeluConfig {
  $schema?: string;
  theme?: string;
  colors?: { primary?: string; light?: string; dark?: string };
  appearance?: 'system' | 'light' | 'dark';
  styling?: { codeblocks?: { theme?: string | { light: string; dark: string } } };
  navigation: {
    tabs?: VeluTab[];
    anchors?: VeluAnchor[];
    global?: {
      anchors?: VeluAnchor[];
      tabs?: VeluGlobalTab[];
    };
  };
}

export interface TabMeta {
  label: string;
  icon?: string;
  href?: string;
  slugs: string[];
  firstPage?: string;
}

// ── Load config ─────────────────────────────────────────────────────────────

let _cachedConfig: VeluConfig | null = null;

export function loadVeluConfig(): VeluConfig {
  if (_cachedConfig) return _cachedConfig;
  const configPath = resolveConfigPath(process.cwd());
  const raw = readFileSync(configPath, 'utf-8');
  _cachedConfig = normalizeConfigNavigation(JSON.parse(raw));
  return _cachedConfig!;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pageBasename(page: string): string {
  return page.split('/').pop()!;
}

/** Convert a group to a Starlight sidebar entry, using slug-based page paths */
function veluGroupToSidebar(group: VeluGroup, tabSlug: string): any {
  const items: any[] = [];
  for (const item of group.pages) {
    if (typeof item === 'string') {
      items.push(tabSlug + '/' + group.slug + '/' + pageBasename(item));
    } else if (isGroup(item)) {
      items.push(veluGroupToSidebar(item, tabSlug));
    }
  }
  const result: any = { label: group.group, items };
  if (group.tag) result.badge = group.tag;
  if (group.expanded === false) result.collapsed = true;
  return result;
}

function isGroup(item: unknown): item is VeluGroup {
  return typeof item === 'object' && item !== null && 'group' in item;
}

/** Get the first page dest path for a tab */
function firstTabPage(tab: VeluTab): string | undefined {
  if (tab.pages) {
    for (const item of tab.pages) {
      if (typeof item === 'string') {
        return tab.slug + '/' + pageBasename(item);
      }
    }
  }
  if (tab.groups) {
    for (const g of tab.groups) {
      const first = firstGroupPage(g, tab.slug);
      if (first) return first;
    }
  }
  return undefined;
}

function firstGroupPage(group: VeluGroup, tabSlug: string): string | undefined {
  for (const item of group.pages) {
    if (typeof item === 'string') return tabSlug + '/' + group.slug + '/' + pageBasename(item);
    if (isGroup(item)) {
      const nested = firstGroupPage(item, tabSlug);
      if (nested) return nested;
    }
  }
  return undefined;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Build the full Starlight sidebar array from docs.json/velu.json */
export function getSidebar(): any[] {
  const config = loadVeluConfig();
  const sidebar: any[] = [];

  for (const tab of config.navigation.tabs ?? []) {
    if (tab.href) continue;
    const items: any[] = [];
    if (tab.groups) for (const g of tab.groups) items.push(veluGroupToSidebar(g, tab.slug));
    if (tab.pages) {
      for (const p of tab.pages) {
        if (typeof p === 'string') items.push(tab.slug + '/' + pageBasename(p));
      }
    }
    sidebar.push({ label: tab.tab, items });
  }

  return sidebar;
}

/** Get tab metadata for the header navigation */
export function getTabs(): TabMeta[] {
  const config = loadVeluConfig();
  const tabs: TabMeta[] = [];

  for (const tab of config.navigation.tabs ?? []) {
    if (tab.href) {
      tabs.push({ label: tab.tab, icon: tab.icon, href: tab.href, slugs: [] });
    } else {
      tabs.push({
        label: tab.tab,
        icon: tab.icon,
        slugs: [tab.slug],
        firstPage: firstTabPage(tab),
      });
    }
  }

  return tabs;
}

/** Get the mapping of slug → sidebar group labels for filtering.
 *  Maps every slug (tab, group, nested group) to the labels that should be visible. */
export function getTabSidebarMap(): Record<string, string[]> {
  const config = loadVeluConfig();
  const map: Record<string, string[]> = {};

  for (const tab of config.navigation.tabs ?? []) {
    if (tab.href) continue;
    map[tab.slug] = [tab.tab];
  }

  return map;
}

/** Get all anchors (navigation.anchors + navigation.global.anchors), excluding hidden ones */
export function getAnchors(): VeluAnchor[] {
  const config = loadVeluConfig();
  const anchors: VeluAnchor[] = [];
  if (config.navigation.anchors) {
    anchors.push(...config.navigation.anchors.filter((a) => typeof a.href === 'string' && a.href.length > 0 && !a.hidden));
  }
  if (config.navigation.global?.anchors) {
    anchors.push(...config.navigation.global.anchors.filter((a) => typeof a.href === 'string' && a.href.length > 0 && !a.hidden));
  }
  return anchors;
}

/** Get external tab links for the navbar */
export function getExternalTabs(): { label: string; href: string; icon?: string }[] {
  const config = loadVeluConfig();
  const tabLinks = (config.navigation.tabs ?? [])
    .filter((tab) => !!tab.href)
    .map((tab) => ({ label: tab.tab, href: tab.href!, icon: tab.icon }));
  const globalLinks = (config.navigation.global?.tabs ?? [])
    .filter((tab) => !!tab.href)
    .map((tab) => ({ label: tab.tab, href: tab.href, icon: tab.icon }));
  return [...tabLinks, ...globalLinks];
}
