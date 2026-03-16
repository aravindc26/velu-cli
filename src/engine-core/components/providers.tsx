'use client';

import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { PagefindSearch } from './search';

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
