import type { ReactNode } from 'react';
import { getAppearance } from '@/lib/velu';
import { Providers } from '@/components/providers';
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
        <Providers theme={theme}>
          {children}
          <VeluAssistant />
        </Providers>
      </body>
    </html>
  );
}
