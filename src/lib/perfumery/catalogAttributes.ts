/**
 * Perfumería en el catálogo web: atributos de una fragancia (género, familia,
 * temporadas...) y precios por presentación. El escritorio los arma al
 * publicar; la nube los guarda en `StoreProduct.catalogAttributes` y la página
 * `/c/[slug]` los usa para filtrar y elegir presentación.
 */

export interface PerfumeCatalogOption {
  name: string;
  price: number;
  listPrice: number | null;
  /** Relleno: solo para clientes con compra previa. */
  note: string | null;
}

export interface PerfumeCatalogAttributes {
  kind: 'perfume';
  code: string;
  gender: string | null;
  family: string | null;
  seasons: string[];
  occasions: string[];
  aromas: string[];
  reference: string | null;
  options: PerfumeCatalogOption[];
}

interface PresentationLike {
  name: string;
  essenceMl: number;
  price: number;
  listPrice: number | null;
  isRefill: boolean;
  requiresPriorPurchase: boolean;
}

/** "50 ml Azul", "50 ml Rojo" → "50 ml" (palabras iniciales comunes). */
function commonWordPrefix(names: string[]): string {
  const split = names.map((name) => name.split(/\s+/));
  const prefix: string[] = [];
  for (let i = 0; i < split[0].length; i++) {
    const word = split[0][i];
    if (split.every((words) => words[i] === word)) prefix.push(word);
    else break;
  }
  return prefix.join(' ');
}

/**
 * Opciones del catálogo: agrupa colores del mismo tamaño y precio ("50 ml" en
 * vez de cuatro colores); el color se acuerda por WhatsApp.
 */
export function buildCatalogOptions(presentations: PresentationLike[]): PerfumeCatalogOption[] {
  const groups = new Map<string, PresentationLike[]>();
  for (const p of presentations) {
    const key = `${p.essenceMl}|${p.price}|${p.isRefill}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      const name = group.length > 1 ? commonWordPrefix(group.map((p) => p.name)) || first.name : first.name;
      return {
        name,
        price: first.price,
        listPrice: first.listPrice,
        note: group.some((p) => p.requiresPriorPurchase) ? 'Solo con compra previa' : null,
        _refill: first.isRefill,
        _ml: first.essenceMl,
      };
    })
    .sort((a, b) => Number(a._refill) - Number(b._refill) || a._ml - b._ml || a.price - b.price)
    .map(({ name, price, listPrice, note }) => ({ name, price, listPrice, note }));
}

/** Precio "desde": la opción más barata que no es relleno. */
export function catalogFromPrice(options: PerfumeCatalogOption[]): number | null {
  const regular = options.filter((o) => !o.note);
  const list = regular.length ? regular : options;
  return list.length ? Math.min(...list.map((o) => o.price)) : null;
}

const text = (value: unknown, max: number) => {
  const s = typeof value === 'string' ? value.trim() : '';
  return s ? s.slice(0, max) : null;
};
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map((v) => v.slice(0, 60)).slice(0, 20) : [];

/** Sanea lo que llega a la nube (dato de un instalador: no confiar). */
export function sanitizePerfumeAttributes(value: unknown): PerfumeCatalogAttributes | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'perfume') return null;
  const code = text(raw.code, 20);
  if (!code) return null;
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : null))
        .filter((o): o is Record<string, unknown> => Boolean(o))
        .map((o) => ({
          name: text(o.name, 60) ?? '',
          price: Number(o.price),
          listPrice: o.listPrice === null || o.listPrice === undefined ? null : Number(o.listPrice),
          note: text(o.note, 60),
        }))
        .filter((o) => o.name && Number.isFinite(o.price) && o.price > 0 && o.price <= 100000
          && (o.listPrice === null || (Number.isFinite(o.listPrice) && o.listPrice > 0)))
        .slice(0, 30)
    : [];
  return {
    kind: 'perfume',
    code,
    gender: text(raw.gender, 20),
    family: text(raw.family, 80),
    seasons: list(raw.seasons),
    occasions: list(raw.occasions),
    aromas: list(raw.aromas),
    reference: text(raw.reference, 200),
    options,
  };
}
