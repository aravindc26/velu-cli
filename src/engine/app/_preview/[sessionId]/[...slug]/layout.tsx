import { createElement, type ReactNode } from 'react';
import { loadSessionConfigSource } from '@/lib/preview-config';
import {
  getAppearance,
  getLanguages,
  getVersionOptions,
  getProductOptions,
  getDropdownOptions,
  getIconLibrary,
  getTabMenuDefinitions,
  getGlobalAnchors,
  getSiteName,
  getSiteLogoAsset,
} from '@/lib/velu';
import { baseOptions } from '@/lib/layout.shared';
import { getSessionPageTree } from '@/lib/source';
import { renderDocsLayout } from '@/lib/docs-layout';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ sessionId: string; slug: string[] }>;
}

function resolveAssetUrl(sessionId: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `/api/sessions/${sessionId}/assets/${clean}`;
}

export default async function SessionDocsLayout({ children, params }: LayoutProps) {
  const { sessionId, slug } = await params;
  const configSource = loadSessionConfigSource(sessionId);

  if (!configSource) return <>{children}</>;

  const src = configSource;
  const logo = getSiteLogoAsset(src);
  const siteName = getSiteName(src);
  const resolvedLogoLight = resolveAssetUrl(sessionId, logo.light ?? logo.dark);
  const resolvedLogoDark = resolveAssetUrl(sessionId, logo.dark ?? logo.light);
  const logoHref = typeof logo.href === 'string' && logo.href.trim().length > 0 ? logo.href.trim() : `/${sessionId}`;

  const navTitle =
    resolvedLogoLight || resolvedLogoDark
      ? createElement(
          'span',
          { className: 'velu-nav-brand' },
          resolvedLogoLight
            ? createElement('img', {
                src: resolvedLogoLight,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-light',
              })
            : null,
          resolvedLogoDark
            ? createElement('img', {
                src: resolvedLogoDark,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-dark',
              })
            : null,
        )
      : siteName;

  const base = baseOptions(src);
  const sessionBase = {
    ...base,
    nav: {
      ...base.nav,
      title: navTitle,
      url: logoHref,
    },
  };

  const languages = getLanguages(src);
  const tree = getSessionPageTree(sessionId);

  return renderDocsLayout(
    {
      slug,
      tree,
      languages,
      versions: getVersionOptions(src),
      products: getProductOptions(src),
      dropdowns: getDropdownOptions(src),
      iconLibrary: getIconLibrary(src),
      tabMenuDefinitions: getTabMenuDefinitions(src),
      base: sessionBase,
      globalAnchors: getGlobalAnchors(src),
      appearance: getAppearance(src),
      urlPrefix: `/${sessionId}`,
    },
    children,
  );
}
