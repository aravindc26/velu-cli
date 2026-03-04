import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getAppearance, getBannerConfig, getSeoConfig, getSiteDescription, getSiteFavicon, getSiteName, getSiteOrigin, getSitePrimaryColor } from '@/lib/velu';
import { Providers } from '@/components/providers';
import { VeluAssistant } from '@/components/assistant';
import { VeluBanner } from '@/components/banner';
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
const siteDescription = getSiteDescription();
const siteOrigin = getSiteOrigin();
const seo = getSeoConfig();
const favicon = getSiteFavicon();
const primaryColor = getSitePrimaryColor();
const bannerConfig = getBannerConfig();
const generatedDefaultSocialImage = '/og/index.svg';
const defaultSocialImage = seo.metatags['og:image'] ?? seo.metatags['twitter:image'] ?? generatedDefaultSocialImage;
const absoluteDefaultSocialImage = defaultSocialImage ? toAbsoluteUrl(siteOrigin, defaultSocialImage) : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: siteName,
    template: `%s - ${siteName}`,
  },
  ...(siteDescription ? { description: siteDescription } : {}),
  applicationName: siteName,
  generator: seo.metatags.generator || 'Mintlify',
  appleWebApp: {
    title: siteName,
  },
  openGraph: {
    type: 'website',
    siteName,
    ...(siteDescription ? { description: siteDescription } : {}),
    ...(absoluteDefaultSocialImage
      ? { images: [{ url: absoluteDefaultSocialImage, width: 1200, height: 630 }] }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    ...(siteDescription ? { description: siteDescription } : {}),
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
          {bannerConfig && <VeluBanner content={bannerConfig.content} dismissible={bannerConfig.dismissible} />}
          {children}
          <VeluAssistant />
        </Providers>
      </body>
    </html>
  );
}
