/**
 * Extracts DocsLayout options from a session's docs.json config.
 * Mirrors the main engine's layout.shared.ts + velu.ts config extraction
 * but reads from the per-session workspace config.
 */
import { createElement, type ReactNode } from 'react';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { getSessionConfig, getSessionRawConfig } from './session-config';

// ── Theme asset helpers ────────────────────────────────────────────────────

interface ThemeAsset {
  light?: string;
  dark?: string;
  href?: string;
}

function trimStr(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeThemeAsset(value: unknown): ThemeAsset {
  if (typeof value === 'string') {
    const asset = trimStr(value);
    return asset ? { light: asset, dark: asset } : {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const light = trimStr(record.light);
  const dark = trimStr(record.dark);
  const fallback = trimStr(record.default);
  const href = trimStr(record.href);
  return {
    light: light || fallback || undefined,
    dark: dark || fallback || undefined,
    href: href || undefined,
  };
}

function resolveAssetUrl(sessionId: string, path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `/api/sessions/${sessionId}/assets/${clean}`;
}

// ── Config extraction ──────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface AnchorEntry {
  anchor: string;
  href: string;
  icon?: string;
  hidden?: boolean;
}

function extractAnchors(list: unknown): AnchorEntry[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (a): a is AnchorEntry =>
      isRecord(a) &&
      typeof a.anchor === 'string' &&
      typeof a.href === 'string' &&
      a.href.length > 0 &&
      !a.hidden,
  );
}

function extractExternalTabs(config: Record<string, unknown>): Array<{ label: string; href: string }> {
  const navigation = isRecord(config.navigation) ? config.navigation : {};
  const tabs = Array.isArray(navigation.tabs) ? navigation.tabs : [];
  const globalTabs = isRecord(navigation.global) && Array.isArray(navigation.global.tabs)
    ? navigation.global.tabs
    : [];

  const tabLinks = tabs
    .filter((tab): tab is Record<string, unknown> => isRecord(tab) && typeof tab.href === 'string' && tab.href.length > 0)
    .map((tab) => ({ label: String(tab.tab ?? ''), href: String(tab.href) }));

  const globalLinks = globalTabs
    .filter((tab): tab is Record<string, unknown> => isRecord(tab) && typeof tab.href === 'string' && tab.href.length > 0)
    .map((tab) => ({ label: String(tab.tab ?? ''), href: String(tab.href) }));

  return [...tabLinks, ...globalLinks];
}

function extractNavbarAnchors(config: Record<string, unknown>): AnchorEntry[] {
  const navigation = isRecord(config.navigation) ? config.navigation : {};
  return extractAnchors(navigation.anchors);
}

function extractGlobalAnchors(config: Record<string, unknown>): AnchorEntry[] {
  const navigation = isRecord(config.navigation) ? config.navigation : {};
  const global = isRecord(navigation.global) ? navigation.global : {};
  return extractAnchors(global.anchors);
}

function extractNavbarLinks(config: Record<string, unknown>): Array<{ label: string; href: string }> {
  const navbar = isRecord(config.navbar) ? config.navbar : {};
  const links = Array.isArray(navbar.links) ? navbar.links : [];
  return links
    .filter((link): link is Record<string, unknown> =>
      isRecord(link) && typeof link.label === 'string' && typeof link.href === 'string',
    )
    .map((link) => ({ label: String(link.label), href: String(link.href) }));
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getSessionLayoutOptions(sessionId: string): BaseLayoutProps {
  const config = getSessionConfig(sessionId);
  const rawConfig = getSessionRawConfig(sessionId) ?? {};

  const siteName = config?.name || config?.title || 'Docs Preview';
  const logo = normalizeThemeAsset(config?.logo);
  const lightLogo = resolveAssetUrl(sessionId, logo.light ?? logo.dark);
  const darkLogo = resolveAssetUrl(sessionId, logo.dark ?? logo.light);
  const logoHref = logo.href?.trim() || `/${sessionId}`;

  const navTitle: ReactNode =
    lightLogo || darkLogo
      ? createElement(
          'span',
          { className: 'velu-nav-brand' },
          lightLogo
            ? createElement('img', {
                src: lightLogo,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-light',
              })
            : null,
          darkLogo
            ? createElement('img', {
                src: darkLogo,
                alt: siteName,
                className: 'velu-nav-logo velu-nav-logo-dark',
              })
            : null,
        )
      : siteName;

  // Collect links: external tabs + navbar anchors + global anchors + navbar links
  const externalTabs = extractExternalTabs(rawConfig);
  const navbarAnchors = extractNavbarAnchors(rawConfig);
  const globalAnchors = extractGlobalAnchors(rawConfig);
  const navbarLinks = extractNavbarLinks(rawConfig);

  const links = [
    ...externalTabs.map((tab) => ({
      text: tab.label,
      url: tab.href,
      secondary: false,
    })),
    ...navbarAnchors.map((a) => ({
      text: a.anchor,
      url: a.href,
      secondary: true,
    })),
    ...globalAnchors.map((a) => ({
      text: a.anchor,
      url: a.href,
      secondary: true,
    })),
    ...navbarLinks.map((link) => ({
      text: link.label,
      url: link.href,
      secondary: true,
    })),
  ];

  return {
    nav: {
      title: navTitle,
      url: logoHref,
    },
    links,
  };
}

export function getSessionFavicon(sessionId: string): string | undefined {
  const config = getSessionConfig(sessionId);
  const favicon = normalizeThemeAsset(config?.favicon);
  const path = favicon.light ?? favicon.dark;
  return resolveAssetUrl(sessionId, path);
}
