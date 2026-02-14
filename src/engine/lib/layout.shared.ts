import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { createElement } from 'react';
import { VersionSwitcher } from '@/components/version-switcher';
import { getExternalTabs, getNavbarAnchors, getVersionOptions } from '@/lib/velu';

export function baseOptions(): BaseLayoutProps {
  const externalTabs = getExternalTabs();
  const navAnchors = getNavbarAnchors();
  const versions = getVersionOptions();

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
      title: 'Velu Docs',
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
