// src/components/pos/categoryEmoji.ts
// Emoji ilustrativo por categoría: chips del POS y relleno de productos sin foto

const KEYWORDS: Array<[RegExp, string]> = [
  [/arroz|menestra|grano/, '🍚'],
  [/aceite|manteca/, '🫒'],
  [/azucar|endulzante/, '🍯'],
  [/harina|pasta|fideo/, '🍝'],
  [/conserva|enlatad/, '🥫'],
  [/condimento|especia|salsa/, '🧂'],
  [/abarrote/, '🛒'],
  [/licor|cerveza|vino/, '🍺'],
  [/bebida|gaseosa|jugo|agua/, '🥤'],
  [/lacteo|leche|queso|yogur|huevo/, '🥛'],
  [/limpieza|detergente/, '🧽'],
  [/higiene|cuidado personal|aseo|belleza|cosmetic/, '🧴'],
  [/snack|dulce|golosina|confiter/, '🍪'],
  [/pan|reposteria|galleta/, '🍞'],
  [/fruta/, '🍎'],
  [/verdura|hortaliza|vegetal/, '🥬'],
  [/carne|pollo|embutido|fiambre/, '🥩'],
  [/pescado|marisco/, '🐟'],
  [/congelad|helado/, '🧊'],
  [/bebe|infantil|pañal/, '🍼'],
  [/mascota/, '🐾'],
  [/farmacia|medicament|botica|salud/, '💊'],
  [/ferreter|herramient/, '🔧'],
  [/libreria|papeler|utiles/, '📎'],
  [/electr|pila|foco/, '💡'],
  [/ropa|lavander|prenda/, '👕'],
  [/hogar|plastico|descartable/, '🏠'],
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Devuelve el emoji guardado en la categoría o uno según su nombre. */
export function categoryEmoji(name: string | null | undefined, storedIcon?: string | null): string {
  if (storedIcon && /[^\x00-\x7F]/.test(storedIcon)) return storedIcon;
  const key = normalize(name || '');
  for (const [pattern, emoji] of KEYWORDS) {
    if (pattern.test(key)) return emoji;
  }
  return '📦';
}
