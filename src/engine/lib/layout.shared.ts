import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { getExternalTabs } from '@/lib/velu';

export function baseOptions(): BaseLayoutProps {
  const externalTabs = getExternalTabs();
  const links = externalTabs.map((tab: { label: string; href: string }) => ({
    text: tab.label,
    url: tab.href,
    secondary: false,
  }));

  return {
    nav: {
      title: 'Velu Docs',
    },
    links,
  };
}
