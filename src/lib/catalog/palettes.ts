// Paletas del catálogo web. La tienda elige una en Configuración → Catálogo Web
// y viaja a la nube al publicar. Los colores de texto y de contraste se derivan
// aquí para que ninguna paleta deje textos ilegibles.
import type { CSSProperties } from 'react';

export interface CatalogPalette {
  key: string;
  name: string;
  mood: string;
  /** Los seis tonos de la paleta, para mostrarlos en el selector. */
  swatches: string[];
  ink: string;
  primary: string;
  heroFrom: string;
  heroTo: string;
  accent: string;
  bg: string;
  soft: string;
}

export const DEFAULT_CATALOG_PALETTE = 'crema';

export const CATALOG_PALETTES: CatalogPalette[] = [
  {
    key: 'crema',
    name: 'Crema',
    mood: 'Cálida y clásica',
    swatches: ['#2f0f4d', '#4b1d73', '#5b2488', '#f59e4b', '#fbeedd', '#fdf4ea'],
    ink: '#2a1538',
    primary: '#4b1d73',
    heroFrom: '#5b2488',
    heroTo: '#2f0f4d',
    accent: '#f59e4b',
    bg: '#fdf4ea',
    soft: '#fbeedd',
  },
  {
    key: 'purple-haze',
    name: 'Purple Haze',
    mood: 'Futurista y elegante',
    swatches: ['#0e0b1d', '#2a1e4d', '#5a3b8c', '#8b7cc7', '#c9c2e3', '#3a3a52'],
    ink: '#0e0b1d',
    primary: '#5a3b8c',
    heroFrom: '#5a3b8c',
    heroTo: '#2a1e4d',
    accent: '#8b7cc7',
    bg: '#f5f3fb',
    soft: '#e4e0f1',
  },
  {
    key: 'forest-glow',
    name: 'Forest Glow',
    mood: 'Fresca y natural',
    swatches: ['#0f1f17', '#1e3a2e', '#3e5a3f', '#6b7f67', '#c7cbb8', '#3d4337'],
    ink: '#0f1f17',
    primary: '#3e5a3f',
    heroFrom: '#3e5a3f',
    heroTo: '#1e3a2e',
    accent: '#6b7f67',
    bg: '#f3f4ee',
    soft: '#e3e5db',
  },
  {
    key: 'sunset-fusion',
    name: 'Sunset Fusion',
    mood: 'Vibrante y enérgica',
    swatches: ['#1a1a1f', '#2d2b55', '#6a5acd', '#a678b9', '#f0d9b5', '#f4a62a'],
    ink: '#1a1a1f',
    primary: '#6a5acd',
    heroFrom: '#6a5acd',
    heroTo: '#2d2b55',
    accent: '#f4a62a',
    bg: '#fdf6ea',
    soft: '#f7e8d0',
  },
  {
    key: 'rose-blush',
    name: 'Rose Blush',
    mood: 'Atrevida y alegre',
    swatches: ['#1a0f2e', '#3b1b4f', '#7a2e6f', '#d6598f', '#f4d7d4', '#ff6b6b'],
    ink: '#1a0f2e',
    primary: '#7a2e6f',
    heroFrom: '#7a2e6f',
    heroTo: '#3b1b4f',
    accent: '#ff6b6b',
    bg: '#fdf3f2',
    soft: '#f9e3e1',
  },
  {
    key: 'arctic-blue',
    name: 'Arctic Blue',
    mood: 'Fresca y profesional',
    swatches: ['#0b132b', '#1c2541', '#3a506b', '#5bc0de', '#f4d6b0', '#d97706'],
    ink: '#0b132b',
    primary: '#3a506b',
    heroFrom: '#3a506b',
    heroTo: '#1c2541',
    accent: '#5bc0de',
    bg: '#f0f8fb',
    soft: '#d6ecf5',
  },
  {
    key: 'ocean-teal',
    name: 'Ocean Teal',
    mood: 'Tranquila y moderna',
    swatches: ['#0a0f14', '#0f3d3e', '#2e6f73', '#7fb3b8', '#eadcc8', '#c6601f'],
    ink: '#0a0f14',
    primary: '#2e6f73',
    heroFrom: '#2e6f73',
    heroTo: '#0f3d3e',
    accent: '#c6601f',
    bg: '#f8f3ea',
    soft: '#eadcc8',
  },
  {
    key: 'neon-pop',
    name: 'Neon Pop',
    mood: 'Llamativa y moderna',
    swatches: ['#121212', '#1f2937', '#334155', '#64748b', '#f1f5f9', '#ec4899'],
    ink: '#121212',
    primary: '#334155',
    heroFrom: '#334155',
    heroTo: '#1f2937',
    accent: '#ec4899',
    bg: '#f6f8fb',
    soft: '#e7ecf3',
  },
  {
    key: 'olive-luxe',
    name: 'Olive Luxe',
    mood: 'Natural y sofisticada',
    swatches: ['#0b0f0d', '#1f2a1f', '#3e5a3f', '#8ca98c', '#d9c7a3', '#b08d57'],
    ink: '#0b0f0d',
    primary: '#3e5a3f',
    heroFrom: '#3e5a3f',
    heroTo: '#1f2a1f',
    accent: '#b08d57',
    bg: '#f8f4ea',
    soft: '#ece3d1',
  },
  {
    key: 'mocha-earth',
    name: 'Mocha Earth',
    mood: 'Cálida y atemporal',
    swatches: ['#1a120e', '#3a2418', '#6b4a2e', '#a88462', '#d5c4ae', '#4a4a46'],
    ink: '#1a120e',
    primary: '#6b4a2e',
    heroFrom: '#6b4a2e',
    heroTo: '#3a2418',
    accent: '#a88462',
    bg: '#f8f3ec',
    soft: '#ece2d6',
  },
];

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla `color` con `target`; amount 0 deja el color y 1 da el destino. */
function mix(color: string, target: string, amount: number): string {
  const end = toRgb(target);
  return toHex(toRgb(color).map((v, i) => v + (end[i] - v) * amount));
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Acerca `color` a `target` lo justo para que se lea sobre `background`. */
function readableOn(color: string, background: string, target: string, ratio = 4.5): string {
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = mix(color, target, amount);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return target;
}

export function isCatalogPalette(key: unknown): key is string {
  return CATALOG_PALETTES.some((palette) => palette.key === key);
}

export function catalogPaletteFor(key: string | null | undefined): CatalogPalette {
  return (
    CATALOG_PALETTES.find((palette) => palette.key === key) ??
    CATALOG_PALETTES.find((palette) => palette.key === DEFAULT_CATALOG_PALETTE)!
  );
}

/** Colores derivados de la paleta, también usados por las comprobaciones de contraste. */
export function catalogThemeColors(key: string | null | undefined) {
  const palette = catalogPaletteFor(key);
  const onAccent =
    contrastRatio('#ffffff', palette.accent) >= contrastRatio(palette.ink, palette.accent)
      ? '#ffffff'
      : palette.ink;
  return {
    bg: palette.bg,
    soft: palette.soft,
    ink: palette.ink,
    primary: palette.primary,
    heroFrom: palette.heroFrom,
    heroTo: palette.heroTo,
    accent: palette.accent,
    onAccent,
    accentHover: mix(palette.accent, onAccent === '#ffffff' ? '#000000' : '#ffffff', 0.18),
    accentText: readableOn(palette.accent, palette.bg, '#000000'),
    active: mix(palette.accent, '#ffffff', 0.6),
    heroHighlight: readableOn(palette.accent, palette.heroFrom, '#ffffff'),
  };
}

export function catalogThemeStyle(key: string | null | undefined): CSSProperties {
  const colors = catalogThemeColors(key);
  return {
    '--cat-bg': colors.bg,
    '--cat-soft': colors.soft,
    '--cat-ink': colors.ink,
    '--cat-primary': colors.primary,
    '--cat-hero-from': colors.heroFrom,
    '--cat-hero-to': colors.heroTo,
    '--cat-hero-highlight': colors.heroHighlight,
    '--cat-accent': colors.accent,
    '--cat-on-accent': colors.onAccent,
    '--cat-accent-hover': colors.accentHover,
    '--cat-accent-text': colors.accentText,
    '--cat-active': colors.active,
    '--cat-shadow': '0 6px 20px rgba(0, 0, 0, 0.08)',
  } as CSSProperties;
}
