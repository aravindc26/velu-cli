import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { getLanguages, getVersionOptions, type VeluVersionOption } from '@/lib/velu';
import { SidebarLinks } from '@/components/sidebar-links';

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
  return versions.find((v) => v.tabSlugs.includes(firstSeg)) ?? versions.find((v) => v.isDefault) ?? versions[0];
}

function filterTreeByVersion<T extends { children?: unknown[] }>(tree: T, versionSlug?: string): T {
  if (!versionSlug) return tree;

  const root = tree as { children?: unknown[] };
  const children = Array.isArray(root.children) ? root.children : [];

  const filtered = children.filter((node) => {
    if (typeof node !== 'object' || node === null) return false;
    const entry = node as { url?: unknown; path?: unknown; $ref?: { metaFile?: unknown; file?: unknown } };
    const candidates = [entry.url, entry.path, entry.$ref?.metaFile, entry.$ref?.file]
      .filter((value): value is string => typeof value === 'string');
    return candidates.some((value) => value.includes(`${versionSlug}-`) || value.includes(`${versionSlug}/`));
  });

  if (filtered.length === 0) return tree;
  return {
    ...tree,
    children: filtered,
  } as T;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const resolvedParams = await params;
  const locale = resolveLocale(resolvedParams.slug);
  const versions = getVersionOptions();
  const currentVersion = resolveCurrentVersion(resolvedParams.slug, versions);
  const tree = filterTreeByVersion(source.getPageTree(locale), currentVersion?.slug);

  return (
    <DocsLayout
      tree={tree}
      sidebar={{
        collapsible: false,
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
