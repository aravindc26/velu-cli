import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VeluGroup {
  group: string;
  slug: string;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  pages: (string | VeluGroup)[];
}

export interface VeluTab {
  tab: string;
  slug: string;
  icon?: string;
  href?: string;
  pages?: string[];
  groups?: VeluGroup[];
}

export interface VeluConfig {
  $schema?: string;
  theme?: string;
  colors?: { primary?: string; light?: string; dark?: string };
  appearance?: 'system' | 'light' | 'dark';
  styling?: { codeblocks?: { theme?: string | { light: string; dark: string } } };
  navigation: {
    tabs: VeluTab[];
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
  const configPath = resolve(process.cwd(), 'velu.json');
  const raw = readFileSync(configPath, 'utf-8');
  _cachedConfig = JSON.parse(raw);
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
    } else {
      items.push(veluGroupToSidebar(item, tabSlug));
    }
  }
  const result: any = { label: group.group, items };
  if (group.tag) result.badge = group.tag;
  if (group.expanded === false) result.collapsed = true;
  return result;
}

/** Get the first page dest path for a tab */
function firstTabPage(tab: VeluTab): string | undefined {
  if (tab.pages && tab.pages.length > 0) {
    return tab.slug + '/' + pageBasename(tab.pages[0]);
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
    const nested = firstGroupPage(item, tabSlug);
    if (nested) return nested;
  }
  return undefined;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Build the full Starlight sidebar array from velu.json */
export function getSidebar(): any[] {
  const config = loadVeluConfig();
  const sidebar: any[] = [];

  for (const tab of config.navigation.tabs) {
    if (tab.href) continue;
    const items: any[] = [];
    if (tab.groups) for (const g of tab.groups) items.push(veluGroupToSidebar(g, tab.slug));
    if (tab.pages) {
      for (const p of tab.pages) items.push(tab.slug + '/' + pageBasename(p));
    }
    sidebar.push({ label: tab.tab, items });
  }

  return sidebar;
}

/** Get tab metadata for the header navigation */
export function getTabs(): TabMeta[] {
  const config = loadVeluConfig();
  const tabs: TabMeta[] = [];

  for (const tab of config.navigation.tabs) {
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

  for (const tab of config.navigation.tabs) {
    if (tab.href) continue;
    map[tab.slug] = [tab.tab];
  }

  return map;
}
