import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { createElement } from 'react';
import { VersionSwitcher } from '@/components/version-switcher';
import { getExternalTabs, getNavbarAnchors, getSiteLogoAsset, getSiteName, getVersionOptions } from '@/lib/velu';

export function baseOptions(): BaseLayoutProps {
  const externalTabs = getExternalTabs();
  const navAnchors = getNavbarAnchors();
  const versions = getVersionOptions();
  const siteName = getSiteName();
  const logo = getSiteLogoAsset();
  const lightLogo = logo.light ?? logo.dark;
  const darkLogo = logo.dark ?? logo.light;
  const logoHref = typeof logo.href === 'string' && logo.href.trim().length > 0 ? logo.href.trim() : '/';

  const navTitle =
    lightLogo || darkLogo
      ? createElement(
          'span',
          { className: 'velu-nav-brand' },
          lightLogo
            ? createElement('img', {
                src: lightLogo,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-light',
              })
            : null,
          darkLogo
            ? createElement('img', {
                src: darkLogo,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-dark',
              })
            : null,
        )
      : siteName;

  const links = [
    ...externalTabs.map((tab: { label: string; href: string }) => ({
      text: tab.label,
      url: tab.href,
      secondary: false,
    })),
    ...navAnchors
      .filter((a): a is { anchor: string; href: string } => typeof a.href === 'string' && a.href.length > 0)
      .map((a) => ({
        text: a.anchor,
        url: a.href,
        secondary: true,
      })),
  ];

  return {
    nav: {
      title: navTitle,
      url: logoHref,
      children:
        versions.length > 1
          ? createElement(
              'div',
              { className: 'velu-header-version-switcher' },
              createElement(VersionSwitcher, { versions })
            )
          : undefined,
    },
    links,
  };
}
