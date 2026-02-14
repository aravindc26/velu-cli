import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { getAppearance } from '@/lib/velu';
import { PagefindSearch } from '@/components/search';
import { VeluAssistant } from '@/components/assistant';
import './global.css';
import './search.css';
import './assistant.css';
import './copy-page.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  const appearance = getAppearance();
  const theme =
    appearance === 'system'
      ? undefined
      : {
          defaultTheme: appearance,
          enableSystem: false,
        };

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <RootProvider
          theme={theme}
          search={{ SearchDialog: PagefindSearch }}
        >
          {children}
          <VeluAssistant />
        </RootProvider>
      </body>
    </html>
  );
}
