/**
 * Per-session configuration cache for preview mode.
 * Reads docs.json from workspace directories and caches the parsed config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeConfigNavigation } from './navigation-normalize';
import type { VeluConfigSource, VeluConfig } from './velu';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/mnt/nfs_share/editor_sessions';
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

interface CachedSession {
  configSource: VeluConfigSource;
  loadedAt: number;
}

const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL_MS = 60_000; // 1 minute

function resolveWorkspaceConfigPath(sessionId: string): string | null {
  const wsDir = join(WORKSPACE_DIR, sessionId);
  const primary = join(wsDir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  const legacy = join(wsDir, LEGACY_CONFIG_NAME);
  if (existsSync(legacy)) return legacy;
  return null;
}

export function loadSessionConfigSource(sessionId: string): VeluConfigSource | null {
  const cached = sessionCache.get(sessionId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.configSource;
  }

  const configPath = resolveWorkspaceConfigPath(sessionId);
  if (!configPath) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const config = normalizeConfigNavigation(raw) as VeluConfig;
    const rawConfig = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const configSource: VeluConfigSource = { config, rawConfig };
    sessionCache.set(sessionId, {
      configSource,
      loadedAt: Date.now(),
    });
    return configSource;
  } catch {
    return null;
  }
}

export function clearSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId);
}

export function getWorkspaceDir(sessionId: string): string {
  return join(WORKSPACE_DIR, sessionId);
}

// ── Theme color generation ─────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function mixColors(hex1: string, hex2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 * weight + r2 * (1 - weight), g1 * weight + g2 * (1 - weight), b1 * weight + b2 * (1 - weight));
}

function textColorFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#111111' : '#ffffff';
}

/**
 * Generate CSS custom properties for a session's primary color theme.
 */
export function getSessionThemeCss(sessionId: string): string | null {
  const configSource = loadSessionConfigSource(sessionId);
  const colors = configSource?.config.colors;
  if (!colors?.primary) return null;

  const { primary, light, dark } = colors;
  const lightAccent = light || primary;
  const darkAccent = dark || primary;
  const lines: string[] = [];

  if (lightAccent) {
    const accentLow = mixColors(lightAccent, '#ffffff', 0.15);
    lines.push(':root {');
    lines.push(`  --color-fd-primary: ${lightAccent};`);
    lines.push(`  --color-fd-primary-foreground: ${textColorFor(lightAccent)};`);
    lines.push(`  --color-fd-accent: ${accentLow};`);
    lines.push(`  --color-fd-accent-foreground: ${textColorFor(accentLow)};`);
    lines.push(`  --color-fd-ring: ${lightAccent};`);
    lines.push('}');
  }

  if (darkAccent) {
    const accentLow = mixColors(darkAccent, '#000000', 0.3);
    lines.push('.dark {');
    lines.push(`  --color-fd-primary: ${darkAccent};`);
    lines.push(`  --color-fd-primary-foreground: ${textColorFor(darkAccent)};`);
    lines.push(`  --color-fd-accent: ${accentLow};`);
    lines.push(`  --color-fd-accent-foreground: ${textColorFor(accentLow)};`);
    lines.push(`  --color-fd-ring: ${darkAccent};`);
    lines.push('}');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
