import type { ReactNode } from 'react';
import { loadSessionConfigSource, getSessionThemeCss } from '@/lib/preview-config';
import { getBannerConfig, getFontsConfig, getSiteFavicon } from '@/lib/velu';
import { VeluBanner } from '@/components/banner';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ sessionId: string }>;
}

/**
 * Session layout: injects per-session theme CSS, Google Fonts, and banner.
 * Uses React 19 resource hoisting (<style precedence> / <link precedence>)
 * so tags are hoisted to <head> without creating body DOM elements
 * that would break fumadocs' sticky sidebar CSS grid.
 */
export default async function SessionLayout({ children, params }: LayoutProps) {
  const { sessionId } = await params;
  const themeCss = getSessionThemeCss(sessionId);

  // Build Google Fonts URL from session config
  let googleFontsUrl: string | null = null;
  const configSource = loadSessionConfigSource(sessionId);
  const bannerConfig = configSource ? getBannerConfig(configSource) : null;
  if (configSource) {
    const fontsConfig = getFontsConfig(configSource);
    if (fontsConfig) {
      const families = new Set<string>();
      for (const def of [fontsConfig.heading, fontsConfig.body]) {
        if (def && !def.source) {
          const weight = def.weight ? `:wght@${def.weight}` : ':wght@400;500;600;700';
          families.add(`${def.family.replace(/ /g, '+')}${weight}`);
        }
      }
      if (families.size > 0) {
        googleFontsUrl = `https://fonts.googleapis.com/css2?${[...families].map(f => `family=${f}`).join('&')}&display=swap`;
      }
    }
  }

  // Favicon: resolve through the session assets API so it loads from the workspace
  const faviconPath = configSource ? getSiteFavicon(configSource) : undefined;
  const faviconUrl = faviconPath
    ? `/api/sessions/${sessionId}/assets/${faviconPath.replace(/^\//, '')}`
    : undefined;

  return (
    <>
      {themeCss ? <style precedence="session-theme" href={`velu-session-theme-${sessionId}`}>{themeCss}</style> : null}
      {googleFontsUrl ? <link rel="stylesheet" href={googleFontsUrl} precedence="session-fonts" /> : null}
      {faviconUrl ? <link rel="icon" href={faviconUrl} /> : null}
      {bannerConfig ? <VeluBanner content={bannerConfig.content} dismissible={bannerConfig.dismissible} /> : null}
      {children}
    </>
  );
}
