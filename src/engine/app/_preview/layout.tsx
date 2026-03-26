import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import '../../engine-core/css/shared.css';
import '../../engine-core/css/search.css';
import '../../engine-core/css/copy-page.css';

export const metadata = {
  title: 'Preview',
};

export default function PreviewRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <RootProvider>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
