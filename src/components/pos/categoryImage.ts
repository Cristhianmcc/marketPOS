// src/components/pos/categoryImage.ts
// Foto ilustrativa por categoría (public/images/categories, fuente Pixabay).
// Se usa en los chips del POS y como imagen de productos sin foto.

// El orden importa: los grupos más específicos van primero
const GROUPS: Array<[RegExp, string]> = [
  [/lubricante|automotriz|\bauto\b|repuesto/, 'automotriz'],
  [/celular|cargador|audifono|funda|tech/, 'celulares'],
  [/medicament|analges|antibiot|antigrip|generico|vitamin|suplement|inyect|ampolla|topico|antiacid|digestiv|controlad|botica|farmacia|primeros auxilios|material medico|diagnost|salud/, 'farmacia'],
  [/bebe|infantil|panal/, 'bebes'],
  [/cafe|bebidas calientes|infusion/, 'cafe'],
  [/licor|cerveza|vino/, 'licores'],
  [/bebida|gaseosa|jugo|agua/, 'bebidas'],
  [/lacteo|leche|queso|yogur/, 'lacteos'],
  [/huevo/, 'huevos'],
  [/arroz|menestra|grano/, 'arroz'],
  [/aceite|manteca/, 'aceite'],
  [/azucar|endulzante/, 'azucar'],
  [/harina|pasta|fideo/, 'pastas'],
  [/conserva|enlatad/, 'conservas'],
  [/condimento|especia|salsa/, 'condimentos'],
  [/snack|golosina|galleta|chocolate|caramelo|dulce|confiter/, 'snacks'],
  [/\bpan|reposter|pasteler/, 'panaderia'],
  [/fruta|verdura|hortaliza|vegetal/, 'frutas'],
  [/carne|pollo|embutido|fiambre|pescado|marisco/, 'carnes'],
  [/congelad|helado/, 'congelados'],
  [/limpieza|detergente|desinfectant|lavander|lavado|tintorer|planchado/, 'limpieza'],
  [/higiene|cuidado personal|aseo|belleza|cosmetic|shampoo|jabon|desodorante|bucal/, 'cuidado'],
  [/pintura|esmalte|barniz|laca|brocha|rodillo|thinner|solvente|masilla/, 'pinturas'],
  [/destornillador/, 'herramientas'],
  [/tablero|interruptor|tomacorriente/, 'electricidad'],
  [/tornill|perno|tuerca|arandela|clavo|tarugo|ancla|grapa|fijacion/, 'tornilleria'],
  [/herramient|taladro|sierra|serrucho|martillo|combo|destornillador|llave|alicate|pinza|amoladora|lijadora|soldadora|cortadora|cincel|formon|ferreter|candado|cerradura|cadena|seguridad|epp|adhesivo|pegamento|sellador|senal/, 'herramientas'],
  [/electric|cable|foco|luminaria|interruptor|tomacorriente|tablero|cinta|aislante/, 'electricidad'],
  [/plomer|tubo|pvc|griferia|valvula|manguera|conexion/, 'plomeria'],
  [/cemento|ladrillo|arena|piedra|fierro|drywall|construccion|materiales/, 'construccion'],
  [/jardin|maceta|fertiliz/, 'jardineria'],
  [/abarrote|bodega|minimarket|express/, 'abarrotes'],
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Ruta de la foto que representa la categoría (o una genérica de tienda). */
export function categoryImage(name: string | null | undefined): string {
  const key = normalize(name || '');
  for (const [pattern, file] of GROUPS) {
    if (pattern.test(key)) return `/images/categories/${file}.jpg`;
  }
  return '/images/categories/otros.jpg';
}
