import { Check, Palette } from 'lucide-react';
import { CATALOG_PALETTES, catalogPaletteFor, catalogThemeStyle } from '@/lib/catalog/palettes';

interface CatalogPalettePickerProps {
  value: string;
  onChange: (key: string) => void;
}

function PalettePreview({ paletteKey }: { paletteKey: string }) {
  return (
    <div
      className="w-full max-w-[15rem] shrink-0 rounded-2xl bg-[var(--cat-bg)] p-3"
      style={catalogThemeStyle(paletteKey)}
      aria-hidden="true"
    >
      <div className="rounded-xl bg-gradient-to-br from-[var(--cat-hero-from)] to-[var(--cat-hero-to)] p-3">
        <p className="text-sm font-black uppercase leading-tight text-white">Todo lo que necesitas</p>
        <p className="text-xs font-bold italic text-[var(--cat-hero-highlight)]">a un mensaje</p>
        <span className="mt-2 inline-block rounded-full bg-[var(--cat-accent)] px-3 py-1 text-[11px] font-bold text-[var(--cat-on-accent)]">
          Pedir ahora
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-2.5">
        <div>
          <p className="text-xs font-bold text-[var(--cat-ink)]">Producto</p>
          <p className="text-sm font-black text-[var(--cat-ink)]">S/ 4.50</p>
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--cat-accent)] font-bold text-[var(--cat-on-accent)]">
          +
        </span>
      </div>
    </div>
  );
}

export function CatalogPalettePicker({ value, onChange }: CatalogPalettePickerProps) {
  const selected = catalogPaletteFor(value);

  return (
    <div className="bg-card p-6 rounded-xl border border-border space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          Colores del catálogo
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige una paleta, guarda y publica para verla en tu catálogo web.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          {CATALOG_PALETTES.map((palette) => {
            const active = palette.key === selected.key;

            return (
              <button
                key={palette.key}
                type="button"
                onClick={() => onChange(palette.key)}
                aria-pressed={active}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  active ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted'
                }`}
              >
                <span className="mb-2 flex h-6 overflow-hidden rounded-md">
                  {palette.swatches.map((color) => (
                    <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {palette.name}
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </span>
                <span className="block text-xs text-muted-foreground">{palette.mood}</span>
              </button>
            );
          })}
        </div>

        <PalettePreview paletteKey={selected.key} />
      </div>
    </div>
  );
}
