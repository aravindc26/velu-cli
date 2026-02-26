import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getAppearance, getSeoConfig, getSiteFavicon, getSiteName, getSiteOrigin, getSitePrimaryColor } from '@/lib/velu';
import { Providers } from '@/components/providers';
import { VeluAssistant } from '@/components/assistant';
import './global.css';
import './search.css';
import './assistant.css';
import './copy-page.css';

function toAbsoluteUrl(origin: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${origin}${path}`;
}

const siteName = getSiteName();
const siteOrigin = getSiteOrigin();
const seo = getSeoConfig();
const favicon = getSiteFavicon();
const primaryColor = getSitePrimaryColor();
const generatedDefaultSocialImage = '/og/index.svg';
const defaultSocialImage = seo.metatags['og:image'] ?? seo.metatags['twitter:image'] ?? generatedDefaultSocialImage;
const absoluteDefaultSocialImage = defaultSocialImage ? toAbsoluteUrl(siteOrigin, defaultSocialImage) : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: siteName,
    template: `%s - ${siteName}`,
  },
  applicationName: siteName,
  generator: seo.metatags.generator || 'Mintlify',
  appleWebApp: {
    title: siteName,
  },
  openGraph: {
    type: 'website',
    siteName,
    ...(absoluteDefaultSocialImage
      ? { images: [{ url: absoluteDefaultSocialImage, width: 1200, height: 630 }] }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    ...(absoluteDefaultSocialImage ? { images: [absoluteDefaultSocialImage] } : {}),
  },
  ...(favicon
    ? {
        icons: {
          icon: [{ url: favicon }],
          shortcut: [{ url: favicon }],
          apple: [{ url: favicon }],
        },
      }
    : {}),
  ...(primaryColor ? { other: { 'msapplication-TileColor': primaryColor } } : {}),
};

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
      <head>
        <link rel="sitemap" type="application/xml" href={`${siteOrigin}/sitemap.xml`} />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <Providers theme={theme}>
          {children}
          <VeluAssistant />
        </Providers>
      </body>
    </html>
  );
}
