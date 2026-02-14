'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { RootProvider } from 'fumadocs-ui/provider/next';

const PagefindSearch = dynamic(
  () => import('@/components/search').then((m) => m.PagefindSearch),
  { ssr: false }
);

interface ProvidersProps {
  children: ReactNode;
  theme?: {
    defaultTheme: string;
    enableSystem: boolean;
  };
}

export function Providers({ children, theme }: ProvidersProps) {
  return (
    <RootProvider theme={theme} search={{ SearchDialog: PagefindSearch }}>
      {children}
    </RootProvider>
  );
}
