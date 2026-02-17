import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
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

  const children = Array.isArray(tree.children) ? tree.children : [];

  const filtered = children.filter((node) => {
    if (typeof node !== 'object' || node === null) return false;
    const entry = node as { url?: unknown; path?: unknown; $ref?: { metaFile?: unknown; file?: unknown } };
    const candidates = [entry.url, entry.path, entry.$ref?.metaFile, entry.$ref?.file]
      .filter((value): value is string => typeof value === 'string');
    return candidates.some((value) => value.includes(`${prefix}/`));
  });

  if (filtered.length === 0) return tree;
  return { ...tree, children: filtered } as T;
}

function resolveCurrentProduct(slugInput: string[] | undefined, products: VeluProductOption[]): VeluProductOption | undefined {
  if (products.length === 0) return undefined;
  const firstSeg = (slugInput ?? [])[0] ?? '';
  return products.find((p) => p.slug === firstSeg) ?? products[0];
}

function renderIconsInTree(node: unknown, iconLibrary: 'fontawesome' | 'lucide' | 'tabler'): unknown {
  if (Array.isArray(node)) return node.map((item) => renderIconsInTree(item, iconLibrary));
  if (typeof node !== 'object' || node === null) return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'icon' && typeof value === 'string') {
      const iconType = typeof (node as { iconType?: unknown }).iconType === 'string'
        ? ((node as { iconType: string }).iconType)
        : undefined;
      out[key] = <VeluIcon name={value} iconType={iconType} library={iconLibrary} fallback={false} />;
      continue;
    }
    out[key] = renderIconsInTree(value, iconLibrary);
  }
  return out;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const resolvedParams = await params;
  const locale = resolveLocale(resolvedParams.slug);
  const versions = getVersionOptions();
  const products = getProductOptions();
  const iconLibrary = getIconLibrary();
  const currentVersion = resolveCurrentVersion(resolvedParams.slug, versions);
  const currentProduct = resolveCurrentProduct(resolvedParams.slug, products);

  const activePrefix = currentVersion?.slug ?? currentProduct?.slug;
  const rawTree = filterTreeBySlugPrefix(source.getPageTree(locale), activePrefix);
  const tree = renderIconsInTree(rawTree, iconLibrary);

  return (
    <DocsLayout
      tree={tree}
      sidebar={{
        collapsible: false,
        banner: products.length > 1 ? (
          <div className="velu-sidebar-banner">
            <ProductSwitcher products={products} iconLibrary={iconLibrary} />
          </div>
        ) : undefined,
        footer: <SidebarLinks />,
      }}
      {...baseOptions()}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}

export { generateStaticParams } from './page';
