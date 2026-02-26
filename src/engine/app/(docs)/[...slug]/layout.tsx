import { isValidElement, type ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { getIconLibrary, getLanguages, getVersionOptions, getProductOptions, type VeluVersionOption, type VeluProductOption } from '@/lib/velu';
import { SidebarLinks } from '@/components/sidebar-links';
import { ProductSwitcher } from '@/components/product-switcher';
import { VeluIcon } from '@/components/icon';

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

  const rootFolder = rootChildren.find((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode | undefined;

  const tabFolders = Array.isArray(rootFolder?.children)
    ? rootFolder!.children.filter((child) => (child as PageTreeFolderNode)?.type === 'folder') as PageTreeFolderNode[]
    : rootChildren.filter((child) => (child as PageTreeFolderNode)?.type === 'folder') as PageTreeFolderNode[];

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
    .filter((tab): tab is {
      url: string;
      title: ReactNode;
      icon?: ReactNode;
      description?: ReactNode;
      urls: Set<string>;
    } => tab !== null);

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

function scopeTreeToTab<T extends { children?: unknown[] }>(
  tree: T,
  tabSlug?: string,
  containerSlug?: string,
): T {
  const normalizedTab = (tabSlug ?? '').trim().toLowerCase();
  if (!normalizedTab) return tree;

  const topChildren = Array.isArray(tree.children) ? tree.children : [];
  const rootFolder = topChildren.find((child) => {
    const node = child as PageTreeFolderNode;
    return node?.type === 'folder' && node.root === true;
  }) as PageTreeFolderNode | undefined;

  if (!rootFolder || !Array.isArray(rootFolder.children)) return tree;

  const normalizedContainer = (containerSlug ?? '').trim().toLowerCase();
  const matchingChildren = rootFolder.children.filter((child) => {
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

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const resolvedParams = await params;
  const locale = resolveLocale(resolvedParams.slug);
  const versions = getVersionOptions();
  const products = getProductOptions();
  const iconLibrary = getIconLibrary();
  const currentVersion = resolveCurrentVersion(resolvedParams.slug, versions);
  const currentProduct = resolveCurrentProduct(resolvedParams.slug, products);
  const { containerSlug, tabSlug: currentTabSlug } = resolveTabContext(resolvedParams.slug);

  const activePrefix = currentVersion?.slug ?? currentProduct?.slug;
  const containerScopedTree = filterTreeBySlugPrefix(source.getPageTree(locale), activePrefix);
  const rawTree = scopeTreeToTab(containerScopedTree, currentTabSlug, containerSlug);
  const navbarTabs = buildNavbarTabs(source.getPageTree(locale)) ?? [];
  const tree = renderIconsInTree(rawTree, iconLibrary);
  const base = baseOptions();
  const headerTabLinks = navbarTabs
    .map((tab) => ({
      text: typeof tab.title === 'string' ? tab.title : '',
      url: tab.url,
      secondary: false,
    }))
    .filter((link) => link.text.length > 0);

  return (
    <DocsLayout
      tree={tree}
      sidebar={{
        collapsible: true,
        banner: products.length > 1 ? (
          <div className="velu-sidebar-banner">
            <ProductSwitcher products={products} iconLibrary={iconLibrary} />
          </div>
        ) : undefined,
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
