import { CustomThemePalette, ThemeMode } from '../types/rpg';

export interface ThemeDefinition {
  id: ThemeMode;
  name: string;
  subtitle: string;
  isDark: boolean;
  defaultAccent: string;
  metaThemeColor: string;
  preview: {
    canvas: string;
    sidebar: string;
    surface: string;
    elevated: string;
    border: string;
    accent: string;
    text: string;
  };
  accentPresets: Array<{ label: string; hex: string }>;
}

export const DEFAULT_CUSTOM_LIGHT_PALETTE: CustomThemePalette = {
  canvas: '#FAFAFA',
  sidebar: '#FFFFFF',
  surface: '#FFFFFF',
  elevated: '#F4F4F5',
  border: '#D4D4D8',
  text: '#09090B',
  accent: '#18181B',
};

export const DEFAULT_CUSTOM_DARK_PALETTE: CustomThemePalette = {
  canvas: '#09090B',
  sidebar: '#0E0E11',
  surface: '#121215',
  elevated: '#1B1B1F',
  border: '#27272A',
  text: '#FAFAFA',
  accent: '#FAFAFA',
};

export const THEME_DEFINITIONS: Record<ThemeMode, ThemeDefinition> = {
  light: {
    id: 'light',
    name: 'Modo Claro (Preto & Branco)',
    subtitle: 'Padrão monocromático branco e preto com leitura nítida à luz do dia',
    isDark: false,
    defaultAccent: '#18181B',
    metaThemeColor: '#FAFAFA',
    preview: {
      canvas: '#FAFAFA',
      sidebar: '#FFFFFF',
      surface: '#FFFFFF',
      elevated: '#F4F4F5',
      border: '#D4D4D8',
      accent: '#18181B',
      text: '#09090B',
    },
    accentPresets: [
      { label: 'Preto Ônix', hex: '#18181B' },
      { label: 'Grafite', hex: '#3F3F46' },
      { label: 'Cinza Aço', hex: '#52525B' },
    ],
  },
  dark: {
    id: 'dark',
    name: 'Modo Escuro (Preto & Branco)',
    subtitle: 'Padrão monocromático escuro em preto, carvão e branco de alto contraste',
    isDark: true,
    defaultAccent: '#FAFAFA',
    metaThemeColor: '#09090B',
    preview: {
      canvas: '#09090B',
      sidebar: '#0E0E11',
      surface: '#121215',
      elevated: '#1B1B1F',
      border: '#27272A',
      accent: '#FAFAFA',
      text: '#FAFAFA',
    },
    accentPresets: [
      { label: 'Branco Puro', hex: '#FAFAFA' },
      { label: 'Prata Clara', hex: '#D4D4D8' },
      { label: 'Cinza Médio', hex: '#A1A1AA' },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Personalizado',
    subtitle: 'Defina manualmente todas as cores de fundo, cartões, bordas, textos e destaques',
    isDark: true,
    defaultAccent: '#FAFAFA',
    metaThemeColor: '#09090B',
    preview: {
      canvas: '#111114',
      sidebar: '#16161A',
      surface: '#1C1C21',
      elevated: '#24242B',
      border: '#383842',
      accent: '#FAFAFA',
      text: '#FAFAFA',
    },
    accentPresets: [
      { label: 'Branco Puro', hex: '#FAFAFA' },
      { label: 'Preto Ônix', hex: '#18181B' },
      { label: 'Cinza Prata', hex: '#A1A1AA' },
    ],
  },
};

export const THEME_LIST: ThemeDefinition[] = [
  THEME_DEFINITIONS.light,
  THEME_DEFINITIONS.dark,
  THEME_DEFINITIONS.custom,
];

/**
 * Normalizes persisted or imported theme values into one of the 3 supported ThemeMode values.
 */
export function normalizeThemeMode(raw: unknown): ThemeMode {
  if (raw === 'light' || raw === 'white_gold') return 'light';
  if (raw === 'custom') return 'custom';
  if (raw === 'dark' || raw === 'black_red' || raw === 'blue') return 'dark';
  return 'dark';
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const clean = (hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function normalizeHex(hex: unknown, fallback: string): string {
  if (typeof hex !== 'string') return fallback;
  const clean = hex.trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean.toUpperCase() : fallback;
}

export function getRelativeLuminance(hex: string): number {
  const rgb = parseHexRgb(hex);
  if (!rgb) return 0;
  const toLinear = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

export function isHexDark(hex: string): boolean {
  return getRelativeLuminance(hex) < 0.28;
}

export function mixHex(hexA: string, hexB: string, ratioB: number): string {
  const a = parseHexRgb(hexA) || [0, 0, 0];
  const b = parseHexRgb(hexB) || [255, 255, 255];
  const t = Math.min(1, Math.max(0, ratioB));
  const r = Math.round(a[0] * (1 - t) + b[0] * t);
  const g = Math.round(a[1] * (1 - t) + b[1] * t);
  const bl = Math.round(a[2] * (1 - t) + b[2] * t);
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex) || [220, 38, 38];
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

/**
 * Computes an accessible foreground text color (#FFFFFF or #0B1018) for a given hex accent color.
 */
export function getContrastTextColor(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#FFFFFF';
  return getRelativeLuminance(clean) > 0.18 ? '#0B1018' : '#FFFFFF';
}

export function paletteFromThemeMode(mode: ThemeMode): CustomThemePalette {
  const def = THEME_DEFINITIONS[mode];
  return {
    canvas: def.preview.canvas,
    sidebar: def.preview.sidebar,
    surface: def.preview.surface,
    elevated: def.preview.elevated,
    border: def.preview.border,
    text: def.preview.text,
    accent: def.defaultAccent,
  };
}

export function normalizeCustomPalette(
  raw: Partial<CustomThemePalette> | undefined,
  fallback: CustomThemePalette = DEFAULT_CUSTOM_DARK_PALETTE
): CustomThemePalette {
  return {
    canvas: normalizeHex(raw?.canvas, fallback.canvas),
    sidebar: normalizeHex(raw?.sidebar, fallback.sidebar),
    surface: normalizeHex(raw?.surface, fallback.surface),
    elevated: normalizeHex(raw?.elevated, fallback.elevated),
    border: normalizeHex(raw?.border, fallback.border),
    text: normalizeHex(raw?.text, fallback.text),
    accent: normalizeHex(raw?.accent, fallback.accent),
  };
}

export interface ComputedThemeRuntime {
  isDark: boolean;
  metaThemeColor: string;
  cssVariables: Record<string, string>;
}

/**
 * Computes a complete cohesive set of CSS custom properties for either a built-in preset
 * or a user-customized color pattern.
 */
export function computeThemeRuntime(
  themeMode: ThemeMode,
  accentColor: string,
  customPalette?: Partial<CustomThemePalette>
): ComputedThemeRuntime {
  const resolvedMode = normalizeThemeMode(themeMode);

  if (resolvedMode !== 'custom') {
    const def = THEME_DEFINITIONS[resolvedMode];
    const accent = normalizeHex(accentColor, def.defaultAccent);
    const strongAccent = def.isDark ? mixHex(accent, '#FFFFFF', 0.25) : mixHex(accent, '#000000', 0.24);
    return {
      isDark: def.isDark,
      metaThemeColor: def.metaThemeColor,
      cssVariables: {
        '--accent-color': accent,
        '--accent-strong': strongAccent,
        '--accent-contrast': getContrastTextColor(accent),
        '--accent-soft': hexToRgba(accent, 0.16),
        '--accent-border': hexToRgba(accent, 0.55),
      },
    };
  }

  const palette = normalizeCustomPalette(customPalette, DEFAULT_CUSTOM_DARK_PALETTE);
  const dark = isHexDark(palette.surface);
  const accentContrast = getContrastTextColor(palette.accent);
  const accentStrong = dark
    ? mixHex(palette.accent, '#FFFFFF', 0.24)
    : mixHex(palette.accent, '#000000', 0.24);

  const hoverBg = dark
    ? mixHex(palette.elevated, '#FFFFFF', 0.08)
    : mixHex(palette.elevated, '#000000', 0.06);
  const trackBg = dark
    ? mixHex(palette.canvas, '#000000', 0.22)
    : mixHex(palette.elevated, '#000000', 0.08);
  const borderStrong = dark
    ? mixHex(palette.border, '#FFFFFF', 0.18)
    : mixHex(palette.border, '#000000', 0.16);
  const textSecondary = mixHex(palette.text, palette.surface, 0.26);
  const textMuted = mixHex(palette.text, palette.surface, 0.46);
  const silhouetteFill = dark
    ? mixHex(palette.elevated, palette.border, 0.35)
    : mixHex(palette.elevated, palette.border, 0.45);

  return {
    isDark: dark,
    metaThemeColor: palette.canvas,
    cssVariables: {
      '--bg-canvas': palette.canvas,
      '--bg-sidebar': palette.sidebar,
      '--bg-header': hexToRgba(palette.sidebar, 0.94),
      '--bg-surface': palette.surface,
      '--bg-elevated': palette.elevated,
      '--bg-hover': hoverBg,
      '--bg-track': trackBg,
      '--border-subtle': palette.border,
      '--border-strong': borderStrong,
      '--text-primary': palette.text,
      '--text-secondary': textSecondary,
      '--text-muted': textMuted,
      '--accent-color': palette.accent,
      '--accent-strong': accentStrong,
      '--accent-contrast': accentContrast,
      '--accent-soft': hexToRgba(palette.accent, 0.16),
      '--accent-border': hexToRgba(palette.accent, 0.55),
      '--silhouette-fill': silhouetteFill,
      '--toast-info-bg': hexToRgba(palette.surface, 0.96),
      '--toast-info-border': hexToRgba(palette.accent, 0.55),
      '--toast-info-text': palette.text,
    },
  };
}
