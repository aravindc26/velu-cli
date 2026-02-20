// ── Types ────────────────────────────────────────────────────────────────────

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

const FUMADOCS_THEMES = [
  "neutral",
  "black",
  "vitepress",
  "dusk",
  "catppuccin",
  "ocean",
  "emerald",
  "ruby",
  "purple",
  "solar",
  "aspen",
] as const;

type FumadocsTheme = (typeof FUMADOCS_THEMES)[number];

const LEGACY_THEME_ALIASES: Record<string, FumadocsTheme> = {
  violet: "purple",
  maple: "catppuccin",
  palm: "ocean",
  willow: "neutral",
  linden: "emerald",
  almond: "solar",
  aspen: "aspen",
};

function resolveThemeName(theme?: string): FumadocsTheme {
  if (!theme) return "neutral";

  if (FUMADOCS_THEMES.includes(theme as FumadocsTheme)) {
    return theme as FumadocsTheme;
  }

  return LEGACY_THEME_ALIASES[theme] || "neutral";
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

function deriveAccentPalette(primary: string): {
  dark: { accentLow: string; accent: string; accentHigh: string };
  light: { accentLow: string; accent: string; accentHigh: string };
} {
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

// ── CSS generator ────────────────────────────────────────────────────────────

function textColorFor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#111111" : "#ffffff";
}

function generateThemeCss(config: ThemeConfig): string {
  const themeName = resolveThemeName(config.theme);

  const lines: string[] = [];
  lines.push(`/* Velu Theme: ${themeName} */`);
  lines.push(`@import 'fumadocs-ui/css/${themeName}.css';`);
  lines.push("");

  // Apply accent overrides on top of selected Fumadocs theme.
  if (config.colors) {
    const { primary, light, dark } = config.colors;
    const lightAccent = light || primary;
    const darkAccent = dark || primary;

    if (lightAccent) {
      const palette = deriveAccentPalette(lightAccent);
      lines.push(":root {");
      lines.push(`  --color-fd-primary: ${lightAccent};`);
      lines.push(`  --color-fd-primary-foreground: ${textColorFor(lightAccent)};`);
      lines.push(`  --color-fd-accent: ${palette.light.accentLow};`);
      lines.push(`  --color-fd-accent-foreground: ${textColorFor(palette.light.accentLow)};`);
      lines.push(`  --color-fd-ring: ${lightAccent};`);
      lines.push("}");
      lines.push("");
    }

    if (darkAccent) {
      const palette = deriveAccentPalette(darkAccent);
      lines.push(".dark {");
      lines.push(`  --color-fd-primary: ${darkAccent};`);
      lines.push(`  --color-fd-primary-foreground: ${textColorFor(darkAccent)};`);
      lines.push(`  --color-fd-accent: ${palette.dark.accentLow};`);
      lines.push(`  --color-fd-accent-foreground: ${textColorFor(palette.dark.accentLow)};`);
      lines.push(`  --color-fd-ring: ${darkAccent};`);
      lines.push("}");
      lines.push("");
    }
  }

  if (config.appearance === "light") {
    lines.push("");
    lines.push("html { color-scheme: light; }");
  } else if (config.appearance === "dark") {
    lines.push("");
    lines.push("html { color-scheme: dark; }");
  }
  lines.push("");

  return lines.join("\n");
}

function getThemeNames(): string[] {
  return [...FUMADOCS_THEMES];
}

const THEMES = [...FUMADOCS_THEMES];

export { generateThemeCss, getThemeNames, resolveThemeName, THEMES, ThemeConfig, VeluColors, VeluStyling };
