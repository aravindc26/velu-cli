// ── Types ────────────────────────────────────────────────────────────────────

interface ColorSet {
  accentLow: string;
  accent: string;
  accentHigh: string;
  white: string;
  gray1: string;
  gray2: string;
  gray3: string;
  gray4: string;
  gray5: string;
  gray6: string;
  gray7: string;
  black: string;
}

interface ThemePreset {
  dark: ColorSet;
  light: ColorSet;
  font?: string;
  fontMono?: string;
}

interface VeluColors {
  primary?: string;
  light?: string;
  dark?: string;
}

interface VeluStyling {
  codeblocks?: {
    theme?: string | { light: string; dark: string };
  };
}

interface ThemeConfig {
  theme?: string;
  colors?: VeluColors;
  appearance?: "system" | "light" | "dark";
  styling?: VeluStyling;
}

// ── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
  );
}

function mixColors(hex1: string, hex2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    r1 * weight + r2 * (1 - weight),
    g1 * weight + g2 * (1 - weight),
    b1 * weight + b2 * (1 - weight)
  );
}

function deriveAccentPalette(primary: string): { dark: Pick<ColorSet, "accentLow" | "accent" | "accentHigh">; light: Pick<ColorSet, "accentLow" | "accent" | "accentHigh"> } {
  return {
    dark: {
      accentLow: mixColors(primary, "#000000", 0.3),
      accent: mixColors(primary, "#ffffff", 0.2),
      accentHigh: mixColors(primary, "#ffffff", 0.8),
    },
    light: {
      accentLow: mixColors(primary, "#ffffff", 0.15),
      accent: primary,
      accentHigh: mixColors(primary, "#000000", 0.55),
    },
  };
}

// ── Gray palettes ────────────────────────────────────────────────────────────
// Starlight convention: gray-1 = strongest foreground, gray-7 = subtlest
// In dark mode: gray-1 is light, gray-7 is dark
// In light mode: gray-1 is dark, gray-7 is light
// --sl-color-white = foreground extreme, --sl-color-black = background extreme

const GRAY_SLATE = {
  dark: {
    white: "#ffffff",
    gray1: "#eceef2",
    gray2: "#c0c2c7",
    gray3: "#888b96",
    gray4: "#545861",
    gray5: "#353841",
    gray6: "#24272f",
    gray7: "#17181c",
    black: "#13141a",
  },
  light: {
    white: "#13141a",
    gray1: "#17181c",
    gray2: "#24272f",
    gray3: "#545861",
    gray4: "#888b96",
    gray5: "#c0c2c7",
    gray6: "#eceef2",
    gray7: "#f5f6f8",
    black: "#ffffff",
  },
};

const GRAY_ZINC = {
  dark: {
    white: "#ffffff",
    gray1: "#ececef",
    gray2: "#bfc0c4",
    gray3: "#878890",
    gray4: "#53545c",
    gray5: "#34353b",
    gray6: "#23242a",
    gray7: "#17171a",
    black: "#121214",
  },
  light: {
    white: "#121214",
    gray1: "#17171a",
    gray2: "#23242a",
    gray3: "#53545c",
    gray4: "#878890",
    gray5: "#bfc0c4",
    gray6: "#ececef",
    gray7: "#f5f5f7",
    black: "#ffffff",
  },
};

const GRAY_STONE = {
  dark: {
    white: "#ffffff",
    gray1: "#eeeceb",
    gray2: "#c3bfbb",
    gray3: "#8c8680",
    gray4: "#585550",
    gray5: "#383532",
    gray6: "#272421",
    gray7: "#1a1816",
    black: "#141210",
  },
  light: {
    white: "#141210",
    gray1: "#1a1816",
    gray2: "#272421",
    gray3: "#585550",
    gray4: "#8c8680",
    gray5: "#c3bfbb",
    gray6: "#eeeceb",
    gray7: "#f7f6f5",
    black: "#ffffff",
  },
};

// ── Theme presets ────────────────────────────────────────────────────────────

const THEMES: Record<string, ThemePreset> = {
  violet: {
    dark: {
      accentLow: "#1e1b4b",
      accent: "#818cf8",
      accentHigh: "#e0e7ff",
      ...GRAY_SLATE.dark,
    },
    light: {
      accentLow: "#e0e7ff",
      accent: "#4f46e5",
      accentHigh: "#1e1b4b",
      ...GRAY_SLATE.light,
    },
  },

  maple: {
    dark: {
      accentLow: "#2e1065",
      accent: "#a78bfa",
      accentHigh: "#ede9fe",
      ...GRAY_ZINC.dark,
    },
    light: {
      accentLow: "#ede9fe",
      accent: "#7c3aed",
      accentHigh: "#2e1065",
      ...GRAY_ZINC.light,
    },
  },

  palm: {
    dark: {
      accentLow: "#0c2d44",
      accent: "#38bdf8",
      accentHigh: "#e0f2fe",
      ...GRAY_SLATE.dark,
    },
    light: {
      accentLow: "#e0f2fe",
      accent: "#0369a1",
      accentHigh: "#0c2d44",
      ...GRAY_SLATE.light,
    },
  },

  willow: {
    dark: {
      accentLow: "#292524",
      accent: "#a8a29e",
      accentHigh: "#fafaf9",
      ...GRAY_STONE.dark,
    },
    light: {
      accentLow: "#f5f5f4",
      accent: "#57534e",
      accentHigh: "#1c1917",
      ...GRAY_STONE.light,
    },
  },

  linden: {
    dark: {
      accentLow: "#052e16",
      accent: "#4ade80",
      accentHigh: "#dcfce7",
      ...GRAY_ZINC.dark,
    },
    light: {
      accentLow: "#dcfce7",
      accent: "#16a34a",
      accentHigh: "#052e16",
      ...GRAY_ZINC.light,
    },
    font: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  },

  almond: {
    dark: {
      accentLow: "#451a03",
      accent: "#fbbf24",
      accentHigh: "#fef3c7",
      ...GRAY_STONE.dark,
    },
    light: {
      accentLow: "#fef3c7",
      accent: "#b45309",
      accentHigh: "#451a03",
      ...GRAY_STONE.light,
    },
  },

  aspen: {
    dark: {
      accentLow: "#1e1b4b",
      accent: "#818cf8",
      accentHigh: "#e0e7ff",
      ...GRAY_SLATE.dark,
    },
    light: {
      accentLow: "#e0e7ff",
      accent: "#4f46e5",
      accentHigh: "#1e1b4b",
      ...GRAY_SLATE.light,
    },
  },
};

// ── CSS generator ────────────────────────────────────────────────────────────

function colorSetToCss(colors: ColorSet): string {
  return [
    `  --sl-color-accent-low: ${colors.accentLow};`,
    `  --sl-color-accent: ${colors.accent};`,
    `  --sl-color-accent-high: ${colors.accentHigh};`,
    `  --sl-color-white: ${colors.white};`,
    `  --sl-color-gray-1: ${colors.gray1};`,
    `  --sl-color-gray-2: ${colors.gray2};`,
    `  --sl-color-gray-3: ${colors.gray3};`,
    `  --sl-color-gray-4: ${colors.gray4};`,
    `  --sl-color-gray-5: ${colors.gray5};`,
    `  --sl-color-gray-6: ${colors.gray6};`,
    `  --sl-color-gray-7: ${colors.gray7};`,
    `  --sl-color-black: ${colors.black};`,
  ].join("\n");
}

function generateThemeCss(config: ThemeConfig): string {
  const themeName = config.theme || "violet";
  const preset = THEMES[themeName] || THEMES["violet"];

  const darkColors: ColorSet = { ...preset.dark };
  const lightColors: ColorSet = { ...preset.light };

  // Apply color overrides
  if (config.colors) {
    const { primary, light, dark } = config.colors;

    const lightAccent = light || primary;
    const darkAccent = dark || primary;

    if (lightAccent) {
      const palette = deriveAccentPalette(lightAccent);
      lightColors.accentLow = palette.light.accentLow;
      lightColors.accent = palette.light.accent;
      lightColors.accentHigh = palette.light.accentHigh;
    }

    if (darkAccent) {
      const palette = deriveAccentPalette(darkAccent);
      darkColors.accentLow = palette.dark.accentLow;
      darkColors.accent = palette.dark.accent;
      darkColors.accentHigh = palette.dark.accentHigh;
    }
  }

  const lines: string[] = [];
  lines.push(`/* Velu Theme: ${themeName} */`);
  lines.push("");

  // Dark mode (Starlight default)
  lines.push(":root {");
  lines.push(colorSetToCss(darkColors));
  if (preset.font) {
    lines.push(`  --sl-font: ${preset.font};`);
  }
  if (preset.fontMono) {
    lines.push(`  --sl-font-mono: ${preset.fontMono};`);
  }
  lines.push("}");
  lines.push("");

  // Light mode
  lines.push(":root[data-theme='light'] {");
  lines.push(colorSetToCss(lightColors));
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function getThemeNames(): string[] {
  return Object.keys(THEMES);
}

export { generateThemeCss, getThemeNames, THEMES, ThemeConfig, VeluColors, VeluStyling };
