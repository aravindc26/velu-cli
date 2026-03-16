import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { getSessionPageTree } from '@/lib/source';
import { getSessionLayoutOptions } from '@/lib/session-layout';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ sessionId: string }>;
}

export default async function SessionLayout({ children, params }: LayoutProps) {
  const { sessionId } = await params;
  const tree = getSessionPageTree(sessionId);
  const base = getSessionLayoutOptions(sessionId);

  return (
    <DocsLayout
      tree={tree}
      {...base}
      sidebar={{ collapsible: true }}
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
