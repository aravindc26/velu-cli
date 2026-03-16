/**
 * Per-session configuration cache.
 * Reads docs.json from workspace directories and caches the parsed config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/mnt/nfs_share/editor_sessions';
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';

interface SessionConfig {
  name?: string;
  description?: string;
  title?: string;
  theme?: string;
  colors?: { primary?: string; light?: string; dark?: string };
  navigation: {
    tabs?: any[];
    languages?: any[];
    anchors?: any[];
    [key: string]: unknown;
  };
  languages?: string[];
  openapi?: unknown;
  [key: string]: unknown;
}

interface CachedSession {
  config: SessionConfig;
  rawConfig: Record<string, unknown>;
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

export function getSessionConfig(sessionId: string): SessionConfig | null {
  const cached = sessionCache.get(sessionId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const configPath = resolveWorkspaceConfigPath(sessionId);
  if (!configPath) return null;

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const config = raw as SessionConfig;
    sessionCache.set(sessionId, {
      config,
      rawConfig: raw,
      loadedAt: Date.now(),
    });
    return config;
  } catch {
    return null;
  }
}

export function getSessionRawConfig(sessionId: string): Record<string, unknown> | null {
  getSessionConfig(sessionId); // ensure loaded
  return sessionCache.get(sessionId)?.rawConfig ?? null;
}

export function clearSessionCache(sessionId: string): void {
  sessionCache.delete(sessionId);
}

export function getWorkspaceDir(sessionId: string): string {
  return join(WORKSPACE_DIR, sessionId);
}

export function getSiteName(sessionId: string): string {
  const config = getSessionConfig(sessionId);
  return config?.name || config?.title || 'Docs Preview';
}
