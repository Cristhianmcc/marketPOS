// src/components/pos/categoryIcon.tsx
// Ícono por categoría: se usa en los chips del POS y como imagen de los
// productos que aún no tienen foto propia (las fotos se suben desde Inventario).
import {
  Apple, Baby, Beef, BrickWall, Candy, Car, Coffee, CookingPot, Croissant, CupSoda, Droplet, Egg,
  Hammer, Milk, Nut, Package, PaintRoller, Pill, Snowflake, Soup, Sparkles, SprayCan, Sprout,
  Smartphone, Store, Wheat, Wine, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

// El orden importa: los grupos más específicos van primero
const GROUPS: Array<[RegExp, LucideIcon]> = [
  [/lubricante|automotriz|\bauto\b|repuesto/, Car],
  [/celular|cargador|audifono|funda|tech/, Smartphone],
  [/medicament|analges|antibiot|antigrip|generico|vitamin|suplement|inyect|ampolla|topico|antiacid|digestiv|controlad|botica|farmacia|primeros auxilios|material medico|diagnost|salud/, Pill],
  [/bebe|infantil|panal/, Baby],
  [/cafe|bebidas calientes|infusion/, Coffee],
  [/licor|cerveza|vino/, Wine],
  [/bebida|gaseosa|jugo|agua/, CupSoda],
  [/lacteo|leche|queso|yogur/, Milk],
  [/huevo/, Egg],
  [/arroz|menestra|grano|harina|pasta|fideo/, Wheat],
  [/aceite|manteca/, Droplet],
  [/azucar|endulzante|snack|golosina|galleta|chocolate|caramelo|dulce|confiter/, Candy],
  [/conserva|enlatad/, Soup],
  [/condimento|especia|salsa/, CookingPot],
  [/\bpan|reposter|pasteler/, Croissant],
  [/fruta|verdura|hortaliza|vegetal/, Apple],
  [/carne|pollo|embutido|fiambre|pescado|marisco/, Beef],
  [/congelad|helado/, Snowflake],
  [/limpieza|detergente|desinfectant|lavander|lavado|tintorer|planchado/, SprayCan],
  [/higiene|cuidado personal|aseo|belleza|cosmetic|shampoo|jabon|desodorante|bucal/, Sparkles],
  [/pintura|esmalte|barniz|laca|brocha|rodillo|thinner|solvente|masilla/, PaintRoller],
  [/tablero|interruptor|tomacorriente/, Zap],
  [/tornill|perno|tuerca|arandela|clavo|tarugo|ancla|grapa|fijacion/, Nut],
  [/herramient|taladro|sierra|serrucho|martillo|combo|destornillador|llave|alicate|pinza|amoladora|lijadora|soldadora|cortadora|cincel|formon|ferreter|candado|cerradura|cadena|seguridad|epp|adhesivo|pegamento|sellador|senal/, Hammer],
  [/electric|cable|foco|luminaria|cinta|aislante/, Zap],
  [/plomer|tubo|pvc|griferia|valvula|manguera|conexion/, Wrench],
  [/cemento|ladrillo|arena|piedra|fierro|drywall|construccion|materiales/, BrickWall],
  [/jardin|maceta|fertiliz/, Sprout],
  [/abarrote|bodega|minimarket|express/, Store],
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Ícono que representa la categoría (o una caja genérica). */
export function categoryIconFor(name: string | null | undefined): LucideIcon {
  const key = normalize(name || '');
  for (const [pattern, icon] of GROUPS) {
    if (pattern.test(key)) return icon;
  }
  return Package;
}

export function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = categoryIconFor(name);
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />;
}
