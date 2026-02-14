import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface VeluTab {
  tab: string;
  href?: string;
}

interface VeluConfig {
  appearance?: 'system' | 'light' | 'dark';
  navigation: {
    tabs: VeluTab[];
  };
}

let cachedConfig: VeluConfig | null = null;

function loadVeluConfig(): VeluConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = resolve(process.cwd(), 'velu.json');
  const raw = readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(raw) as VeluConfig;
  return cachedConfig;
}

export function getExternalTabs(): Array<{ label: string; href: string }> {
  const config = loadVeluConfig();
  const tabs = config.navigation?.tabs ?? [];

  return tabs
    .filter((tab): tab is VeluTab & { href: string } => typeof tab.href === 'string' && tab.href.length > 0)
    .map((tab) => ({
      label: tab.tab,
      href: tab.href,
    }));
}

export function getAppearance(): 'system' | 'light' | 'dark' {
  const appearance = loadVeluConfig().appearance;
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return 'system';
}
