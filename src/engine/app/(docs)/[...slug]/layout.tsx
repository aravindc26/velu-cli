import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import {
  getDropdownOptions,
  getIconLibrary,
  getLanguages,
  getVersionOptions,
  getProductOptions,
  getTabMenuDefinitions,
  getGlobalAnchors,
  getAppearance,
} from '@/lib/velu';
import { renderDocsLayout, resolveLocale } from '@/lib/docs-layout';

interface LayoutParams {
  slug?: string[];
}

interface SlugLayoutProps {
  children: ReactNode;
  params: Promise<LayoutParams>;
}

export default async function SlugLayout({ children, params }: SlugLayoutProps) {
  const resolvedParams = await params;
  const languages = getLanguages();
  const locale = resolveLocale(resolvedParams.slug, languages);
  const localePageTree = source.getPageTree(locale);

  return renderDocsLayout(
    {
      slug: resolvedParams.slug,
      tree: localePageTree,
      languages,
      versions: getVersionOptions(),
      products: getProductOptions(),
      dropdowns: getDropdownOptions(),
      iconLibrary: getIconLibrary(),
      tabMenuDefinitions: getTabMenuDefinitions(),
      base: baseOptions(),
      globalAnchors: getGlobalAnchors(),
      appearance: getAppearance(),
    },
    children,
  );
}

export { generateStaticParams } from './page';
