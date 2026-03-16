export type VeluIconLibrary = 'fontawesome' | 'lucide' | 'tabler';

export interface VeluDropdownOption {
  dropdown: string;
  slug: string;
  description?: string;
  icon?: string;
  iconType?: string;
  tabSlugs: string[];
  defaultPath: string;
}

export interface VeluProductOption {
  product: string;
  slug: string;
  description?: string;
  icon?: string;
  iconType?: string;
  tabSlugs: string[];
  defaultPath: string;
}

export interface VeluVersionOption {
  version: string;
  slug: string;
  isDefault: boolean;
  tabSlugs: string[];
  defaultPath: string;
}

export interface VeluContextualOption {
  id: string;
  title: string;
  description: string;
  href?: string;
  type: 'builtin' | 'custom';
}

export interface VeluAnchor {
  anchor: string;
  href?: string;
  icon?: string;
  iconType?: string;
  color?: {
    light: string;
    dark: string;
  };
  hidden?: boolean;
}
