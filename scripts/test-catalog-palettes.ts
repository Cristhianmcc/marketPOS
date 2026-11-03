/**
 * Paletas del catálogo: cada una debe dejar legibles los textos y botones, y una
 * clave desconocida o ausente debe caer en la paleta por defecto. No usa base de datos.
 *
 * Uso: npx tsx scripts/test-catalog-palettes.ts
 */
import {
  CATALOG_PALETTES,
  catalogPaletteFor,
  catalogThemeColors,
  catalogThemeStyle,
  contrastRatio,
  DEFAULT_CATALOG_PALETTE,
  isCatalogPalette,
} from '../src/lib/catalog/palettes';

const TEXT = 4.5;
const LARGE = 3;

const failures: string[] = [];
const check = (label: string, ok: boolean) => {
  if (!ok) failures.push(label);
};

for (const palette of CATALOG_PALETTES) {
  const c = catalogThemeColors(palette.key);
  const pair = (label: string, a: string, b: string, min: number) => {
    const ratio = contrastRatio(a, b);
    check(`${palette.name}: ${label} ${ratio.toFixed(2)} < ${min}`, ratio >= min);
  };
  pair('texto sobre fondo', c.ink, c.bg, TEXT);
  pair('texto sobre tarjeta suave', c.ink, c.soft, TEXT);
  pair('color principal sobre blanco', c.primary, '#ffffff', TEXT);
  pair('color principal sobre fondo', c.primary, c.bg, TEXT);
  pair('blanco sobre color principal', '#ffffff', c.primary, TEXT);
  pair('blanco sobre portada', '#ffffff', c.heroFrom, TEXT);
  pair('blanco sobre portada oscura', '#ffffff', c.heroTo, TEXT);
  pair('frase resaltada en portada', c.heroHighlight, c.heroFrom, TEXT);
  pair('ícono sobre botón de acento', c.onAccent, c.accent, LARGE);
  pair('ícono sobre botón al pasar el mouse', c.onAccent, c.accentHover, LARGE);
  pair('categoría activa sobre fondo', c.accentText, c.bg, TEXT);
  pair('ícono sobre categoría activa', c.primary, c.active, LARGE);
  check(`${palette.name}: seis tonos`, palette.swatches.length === 6);
}

check('claves únicas', new Set(CATALOG_PALETTES.map((p) => p.key)).size === CATALOG_PALETTES.length);
check('diez paletas', CATALOG_PALETTES.length === 10);
check('la clave por defecto existe', isCatalogPalette(DEFAULT_CATALOG_PALETTE));
check('clave desconocida rechazada', !isCatalogPalette('inventada'));
check('clave desconocida usa la paleta por defecto', catalogPaletteFor('inventada').key === DEFAULT_CATALOG_PALETTE);
check('sin clave usa la paleta por defecto', catalogPaletteFor(null).key === DEFAULT_CATALOG_PALETTE);
check('el estilo define las variables', Boolean((catalogThemeStyle('neon-pop') as Record<string, string>)['--cat-primary']));

failures.forEach((failure) => console.log(`FAIL ${failure}`));
console.log(`\nPaletas: ${CATALOG_PALETTES.length} revisadas; defectos: ${failures.length}.`);
if (failures.length > 0) process.exitCode = 1;
