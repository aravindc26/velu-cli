import { isValidElement, type ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { LinkItemType } from 'fumadocs-ui/layouts/shared';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import {
  getDropdownOptions,
  getIconLibrary,
  getLanguages,
  getVersionOptions,
  getProductOptions,
  getTabMenuDefinitions,
  type VeluVersionOption,
  type VeluProductOption,
} from '@/lib/velu';
import { SidebarLinks } from '@/components/sidebar-links';
import { ProductSwitcher } from '@/components/product-switcher';
import { VeluIcon } from '@/components/icon';
import { HeaderTabLink } from '@/components/header-tab-link';

interface LayoutParams {
  slug?: string[];
}

interface SlugLayoutProps {
  children: ReactNode;
  params: Promise<LayoutParams>;
}

interface PageTreePageNode {
  type?: string;
  url?: string;
  external?: boolean;
}

interface PageTreeFolderNode {
  type?: string;
  name?: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  root?: boolean;
  index?: { url?: string };
  children?: unknown[];
}

function withTrailingSlashUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) return trimmed;
  if (/^(https?:|mailto:|tel:|#)/i.test(trimmed)) return trimmed;

  const hashIndex = trimmed.indexOf('#');
  const queryIndex = trimmed.indexOf('?');
  const endIndex = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? trimmed.length;
  const path = trimmed.slice(0, endIndex);
  const suffix = trimmed.slice(endIndex);

  if (!path.startsWith('/')) return trimmed;
  if (path === '/' || path.endsWith('/')) return `${path}${suffix}`;

  const lastSegment = path.split('/').filter(Boolean).pop() ?? '';
  if (lastSegment.includes('.')) return trimmed;

  return `${path}/${suffix}`;
}

function resolveLocale(slugInput: string[] | undefined): string {
  const languages = getLanguages();
  const defaultLanguage = languages[0] ?? 'en';
  const slug = slugInput ?? [];
  const firstSeg = slug[0];

  return languages.includes(firstSeg ?? '') ? firstSeg! : defaultLanguage;
}

function resolveCurrentVersion(slugInput: string[] | undefined, versions: VeluVersionOption[]): VeluVersionOption | undefined {
  if (versions.length === 0) return undefined;
  const firstSeg = (slugInput ?? [])[0] ?? '';
  return versions.find((v) => v.slug === firstSeg) ?? versions.find((v) => v.isDefault) ?? versions[0];
}

function filterTreeBySlugPrefix<T extends { children?: unknown[] }>(tree: T, prefix?: string): T {
  if (!prefix) return tree;

  const normPrefix = prefix.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!normPrefix) return tree;

  const matchesPrefix = (value: string): boolean => {
    const norm = value.replace(/^\/+|\/+$/g, '').toLowerCase();
    return norm === normPrefix || norm.startsWith(`${normPrefix}/`) || norm.includes(`/${normPrefix}/`) || norm.endsWith(`/${normPrefix}`);
  };

  const filterNodes = (nodes: unknown[]): unknown[] => {
    const kept: unknown[] = [];

    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) continue;
      const entry = node as {
        url?: unknown;
        path?: unknown;
        $ref?: { metaFile?: unknown; file?: unknown };
        children?: unknown[];
      };

      const candidates = [entry.url, entry.path, entry.$ref?.metaFile, entry.$ref?.file]
        .filter((value): value is string => typeof value === 'string');
      const selfMatch = candidates.some(matchesPrefix);

      const childNodes = Array.isArray(entry.children) ? entry.children : [];
      const filteredChildren = childNodes.length > 0 ? filterNodes(childNodes) : [];
      const childMatch = filteredChildren.length > 0;

      if (selfMatch || childMatch) {
        kept.push(childMatch ? { ...entry, children: filteredChildren } : entry);
      }
    }

    return kept;
  };

  const children = Array.isArray(tree.children) ? tree.children : [];
  const filtered = filterNodes(children);
  if (filtered.length === 0) return tree;
  return { ...tree, children: filtered } as T;
}

function resolveCurrentProduct(slugInput: string[] | undefined, products: VeluProductOption[]): VeluProductOption | undefined {
  if (products.length === 0) return undefined;
  const firstSeg = (slugInput ?? [])[0] ?? '';
  return products.find((p) => p.slug === firstSeg) ?? products[0];
}

function renderIconsInTree<T>(node: T, iconLibrary: 'fontawesome' | 'lucide' | 'tabler'): T {
  if (Array.isArray(node)) return node.map((item) => renderIconsInTree(item, iconLibrary)) as T;
  if (isValidElement(node)) return node;
  if (typeof node !== 'object' || node === null) return node;

  const out: Record<string, unknown> = {};
  const nodeWithIconType = node as { iconType?: unknown };
  for (const [key, value] of Object.entries(node)) {
    if (key === 'icon' && typeof value === 'string') {
      const iconType = typeof nodeWithIconType.iconType === 'string'
        ? nodeWithIconType.iconType
        : undefined;
      out[key] = <VeluIcon name={value} iconType={iconType} library={iconLibrary} fallback={false} />;
      continue;
    }
    if (key === 'url' && typeof value === 'string') {
      out[key] = withTrailingSlashUrl(value);
      continue;
    }
    out[key] = renderIconsInTree(value, iconLibrary);
  }
  return out as T;
}

function collectFolderUrls(folder: PageTreeFolderNode, out: Set<string> = new Set<string>()): Set<string> {
  if (typeof folder.index?.url === 'string' && folder.index.url.length > 0) out.add(folder.index.url);
  for (const child of Array.isArray(folder.children) ? folder.children : []) {
    const node = child as PageTreePageNode & PageTreeFolderNode;
    if (node?.type === 'page' && !node.external && typeof node.url === 'string' && node.url.length > 0) {
      out.add(node.url);
      continue;
    }
    if (node?.type === 'folder') collectFolderUrls(node, out);
  }
  return out;
}

function buildNavbarTabs(tree: unknown): Array<{
  url: string;
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  urls: Set<string>;
}> | undefined {
  const rootChildren = Array.isArray((tree as { children?: unknown[] })?.children)
    ? (tree as { children: unknown[] }).children
    : [];

  const rootFolders = rootChildren.filter((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode[];

  // Two shapes are supported:
  // 1) Multiple root folders => each root folder is a top-level tab.
  // 2) Single root folder containing tab folders as children.
  const tabFolders: PageTreeFolderNode[] = rootFolders.length > 1
    ? rootFolders
    : (rootFolders.length === 1 && Array.isArray(rootFolders[0]?.children)
      ? rootFolders[0].children.filter((child) => (child as PageTreeFolderNode)?.type === 'folder') as PageTreeFolderNode[]
      : rootChildren.filter((child) => (child as PageTreeFolderNode)?.type === 'folder') as PageTreeFolderNode[]);

  const tabs = tabFolders
    .map((folder) => {
      const urls = collectFolderUrls(folder);
      const firstUrl = urls.values().next().value as string | undefined;
      if (!firstUrl) return null;
      return {
        url: firstUrl,
        title: folder.name ?? '',
        icon: folder.icon,
        description: folder.description,
        urls,
      };
    })
    .filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return tabs.length > 0 ? tabs : undefined;
}

function resolveTabContext(slugInput: string[] | undefined): { containerSlug?: string; tabSlug?: string } {
  const languages = getLanguages();
  const slug = slugInput ?? [];
  const contentSlug = languages.includes(slug[0] ?? '') ? slug.slice(1) : slug;
  if (contentSlug.length === 0) return {};
  if (contentSlug.length > 1) {
    return { containerSlug: contentSlug[0], tabSlug: contentSlug[1] };
  }
  return { tabSlug: contentSlug[0] };
}

function normalizePath(value: string): string {
  return value.replace(/^\/+|\/+$/g, '').toLowerCase();
}

function normalizeSidebarTabUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function basename(value: string): string {
  const normalized = normalizePath(value);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function collectPageUrls(tree: unknown, out: Set<string> = new Set<string>()): Set<string> {
  if (!tree || typeof tree !== 'object') return out;

  const node = tree as {
    type?: string;
    url?: unknown;
    external?: unknown;
    index?: { url?: unknown };
    children?: unknown[];
  };

  if (node.type === 'page' && node.external !== true && typeof node.url === 'string' && node.url.length > 0) {
    out.add(normalizeSidebarTabUrl(node.url));
  }

  if (node.type === 'folder' && typeof node.index?.url === 'string' && node.index.url.length > 0) {
    out.add(normalizeSidebarTabUrl(node.index.url));
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) collectPageUrls(child, out);
  }

  return out;
}

function doesUrlBelongToTab(url: string, tabSlug: string): boolean {
  const normalizedUrl = normalizePath(url);
  const normalizedTab = normalizePath(tabSlug);
  if (!normalizedUrl || !normalizedTab) return false;
  return normalizedUrl === normalizedTab
    || normalizedUrl.startsWith(`${normalizedTab}/`)
    || normalizedUrl.includes(`/${normalizedTab}/`)
    || normalizedUrl.endsWith(`/${normalizedTab}`);
}

function resolveMenuTargetUrl(menuPages: string[], tabUrls: Set<string>): string | undefined {
  const urls = Array.from(tabUrls);
  if (urls.length === 0) return undefined;

  for (const page of menuPages) {
    const normalizedPage = normalizePath(page);
    if (!normalizedPage) continue;

    const direct = urls.find((url) => {
      const normalizedUrl = normalizePath(url);
      return normalizedUrl === normalizedPage || normalizedUrl.endsWith(`/${normalizedPage}`);
    });
    if (direct) return direct;

    const pageBase = basename(normalizedPage);
    const basenameMatches = urls.filter((url) => basename(url) === pageBase);
    if (basenameMatches.length === 1) return basenameMatches[0];
  }

  return undefined;
}

function resolveMenuLinksForTab(
  tabUrls: Set<string>,
  candidates: ReturnType<typeof getTabMenuDefinitions>,
): Array<{ text: string; url: string }> {
  let best: Array<{ text: string; url: string }> = [];

  for (const candidate of candidates) {
    const resolved = candidate.items
      .map((item) => {
        const target = resolveMenuTargetUrl(item.pages, tabUrls);
        if (!target) return null;
        return { text: item.item, url: target };
      })
      .filter((entry): entry is { text: string; url: string } => entry !== null);

    if (resolved.length > best.length) best = resolved;
  }

  return best;
}

function withPrefixedPath(url: string, prefix?: string): string {
  const normalizedPrefix = (prefix ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPrefix) return url;
  if (/^(https?:|mailto:|tel:|#)/i.test(url)) return url;

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const endIndex = [hashIndex, queryIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? url.length;
  const path = url.slice(0, endIndex);
  const suffix = url.slice(endIndex);
  if (!path.startsWith('/')) return url;

  const prefixed = path === '/'
    ? `/${normalizedPrefix}`
    : path.startsWith(`/${normalizedPrefix}/`) || path === `/${normalizedPrefix}`
      ? path
      : `/${normalizedPrefix}${path}`;

  return `${prefixed}${suffix}`;
}

function resolveRequestPathPrefix(
  slugInput: string[] | undefined,
  tabs: Array<{ url: string }>,
): string | undefined {
  const slug = (slugInput ?? []).map((segment) => segment.trim().toLowerCase()).filter(Boolean);
  if (slug.length < 2) return undefined;

  const tabRoots = new Set(
    tabs
      .map((tab) => normalizePath(tab.url).split('/').filter(Boolean)[0] ?? '')
      .map((segment) => segment.toLowerCase())
      .filter((segment) => segment.length > 0),
  );

  const first = slug[0] ?? '';
  const second = slug[1] ?? '';
  if (!first || !second) return undefined;
  if (tabRoots.has(first)) return undefined;
  if (tabRoots.has(second)) return first;
  return undefined;
}

function scopeTreeToTab<T extends { children?: unknown[] }>(
  tree: T,
  tabSlug?: string,
  containerSlug?: string,
): T {
  const normalizedTab = (tabSlug ?? '').trim().toLowerCase();
  if (!normalizedTab) return tree;

  const topChildren = Array.isArray(tree.children) ? tree.children : [];
  const rootFolders = topChildren.filter((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode[];

  // When docs have multiple top-level root folders (tabs), avoid rendering
  // the sidebar root switcher. Show only the active tab's children.
  if (rootFolders.length > 1) {
    const activeTopTab = (containerSlug ?? tabSlug ?? '').trim().toLowerCase();
    if (!activeTopTab) return tree;

    const matchedRoot = rootFolders.find((folder) => {
      const urls = collectFolderUrls(folder);
      for (const url of urls) {
        const segments = url.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
        if ((segments[0] ?? '') === activeTopTab) return true;
      }
      return false;
    });

    if (!matchedRoot || !Array.isArray(matchedRoot.children)) return tree;
    return { ...tree, children: matchedRoot.children } as T;
  }

  const rootFolder = topChildren.find((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode | undefined;

  if (!rootFolder || !Array.isArray(rootFolder.children)) return tree;

  const normalizedContainer = (containerSlug ?? '').trim().toLowerCase();
  const matchingChildren = rootFolder.children.filter((child): child is PageTreeFolderNode => {
    const folder = child as PageTreeFolderNode;
    if (folder?.type !== 'folder') return false;

    const urls = collectFolderUrls(folder);
    for (const url of urls) {
      const segments = url.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
      if (segments.length === 0) continue;

      const tabCandidate = normalizedContainer && segments[0] === normalizedContainer
        ? segments[1]
        : segments[0];
      if (tabCandidate === normalizedTab) return true;
    }
    return false;
  });

  if (matchingChildren.length === 0) return tree;

  const firstMatch = matchingChildren[0];
  const flattenedChildren = matchingChildren.length === 1 && Array.isArray(firstMatch?.children) && firstMatch.children.length > 0
    ? firstMatch.children
    : matchingChildren;

  const scopedRoot = { ...rootFolder, children: flattenedChildren };
  const scopedChildren = topChildren.map((child) => (child === rootFolder ? scopedRoot : child));
  return { ...tree, children: scopedChildren } as T;
}

function flattenSingleRootFolder<T extends { children?: unknown[] }>(tree: T): T {
  const topChildren = Array.isArray(tree.children) ? tree.children : [];
  if (topChildren.length === 0) return tree;

  const rootFolders = topChildren.filter((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode[];

  if (rootFolders.length !== 1) return tree;
  const rootFolder = rootFolders[0];
  const rootChildren = Array.isArray(rootFolder.children) ? rootFolder.children : [];
  if (rootChildren.length === 0) return tree;

  const nonRootChildren = topChildren.filter((child) => child !== rootFolder);
  return { ...tree, children: [...rootChildren, ...nonRootChildren] } as T;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const resolvedParams = await params;
  const locale = resolveLocale(resolvedParams.slug);
  const localePageTree = source.getPageTree(locale);
  const versions = getVersionOptions();
  const products = getProductOptions();
  const dropdowns = getDropdownOptions();
  const iconLibrary = getIconLibrary();
  const currentVersion = resolveCurrentVersion(resolvedParams.slug, versions);
  const currentProduct = resolveCurrentProduct(resolvedParams.slug, products);
  const { containerSlug, tabSlug: currentTabSlug } = resolveTabContext(resolvedParams.slug);
  const activePrefix = currentVersion?.slug ?? currentProduct?.slug;
  const containerScopedTree = filterTreeBySlugPrefix(localePageTree, activePrefix);
  const rawTree = scopeTreeToTab(containerScopedTree, currentTabSlug, containerSlug);
  const activeTree = dropdowns.length > 0 ? flattenSingleRootFolder(rawTree) : rawTree;
  const navbarTabs = buildNavbarTabs(localePageTree) ?? [];
  const allPageUrls = collectPageUrls(localePageTree);
  const requestPathPrefix = resolveRequestPathPrefix(resolvedParams.slug, navbarTabs);
  const tabMenuDefinitions = getTabMenuDefinitions();
  const tree = renderIconsInTree(activeTree, iconLibrary);
  const base = baseOptions();
  const dropdownTabs = dropdowns.map((dropdown) => {
    const defaultUrl = withTrailingSlashUrl(dropdown.defaultPath);
    const matchingUrls = Array.from(allPageUrls).filter((url) => (
      doesUrlBelongToTab(url, dropdown.slug)
      || dropdown.tabSlugs.some((tabSlug) => doesUrlBelongToTab(url, tabSlug))
    ));
    const urls = new Set<string>(matchingUrls);
    urls.add(normalizeSidebarTabUrl(defaultUrl));

    return {
      url: defaultUrl,
      urls,
      title: dropdown.dropdown,
      description: dropdown.description,
      icon: dropdown.icon ? (
        <VeluIcon
          name={dropdown.icon}
          iconType={dropdown.iconType}
          library={iconLibrary}
          fallback={false}
        />
      ) : undefined,
    };
  });
  const headerTabLinks: LinkItemType[] = navbarTabs
    .map((tab): LinkItemType | null => {
      const tabText = typeof tab.title === 'string' ? tab.title : '';
      if (tabText.length === 0) return null;

      const menuCandidates = tabMenuDefinitions.filter(
        (definition) => definition.tab.trim().toLowerCase() === tabText.trim().toLowerCase(),
      );
      const menuLinks = resolveMenuLinksForTab(tab.urls, menuCandidates);

      if (menuLinks.length > 0) {
        return {
          type: 'menu',
          text: tabText,
          url: withTrailingSlashUrl(withPrefixedPath(tab.url, requestPathPrefix)),
          active: 'nested-url',
          secondary: false,
          items: menuLinks.map((item) => ({
            text: item.text,
            url: withTrailingSlashUrl(withPrefixedPath(item.url, requestPathPrefix)),
            active: 'nested-url',
          })),
        };
      }

      return {
        type: 'custom',
        secondary: false,
        children: (
          <HeaderTabLink
            text={tabText}
            href={withTrailingSlashUrl(withPrefixedPath(tab.url, requestPathPrefix))}
            urls={Array.from(tab.urls).map((url) => withTrailingSlashUrl(withPrefixedPath(url, requestPathPrefix)))}
          />
        ),
      };
    })
    .filter((link): link is LinkItemType => link !== null);

  return (
    <DocsLayout
      tree={tree}
      sidebar={{
        tabs: dropdownTabs.length > 0 ? dropdownTabs : undefined,
        collapsible: true,
        banner: products.length > 1
          ? (
            <div className="velu-sidebar-banner">
              <ProductSwitcher products={products} iconLibrary={iconLibrary} />
            </div>
          )
          : undefined,
        footer: ({ className, children, ...props }: any) => (
          <div
            className={['velu-sidebar-footer-shell', className].filter(Boolean).join(' ')}
            {...props}
          >
            {children ? <div className="velu-sidebar-footer-icons">{children}</div> : null}
            <SidebarLinks />
          </div>
        ),
      }}
      {...base}
      links={headerTabLinks.length > 0 ? headerTabLinks : base.links}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}

export { generateStaticParams } from './page';
