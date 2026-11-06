/**
 * Perfumería: catálogo de fragancias y presentaciones de una sede.
 *
 * Cada sede es una tienda (Store) con su stock, caja y comprobantes. El
 * catálogo se configura una vez y se carga en cada sede con el importador
 * (mismo archivo JSON/CSV, o el exportado desde otra sede).
 */
import { Prisma, UnitType } from '@prisma/client';

export const GENDERS = ['MUJER', 'HOMBRE', 'UNISEX'] as const;
export type Gender = (typeof GENDERS)[number];

export interface CatalogFragrance {
  code: string;
  reference?: string | null;
  referenceBrand?: string | null;
  gender?: string | null;
  family?: string | null;
  aromas?: string[];
  seasons?: string[];
  occasions?: string[];
  scent?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** Stock inicial en ml (solo al crear). null/ausente = usa la opción general. */
  stockMl?: number | null;
  /** Costo por ml de la esencia (opcional). */
  costPerMl?: number | null;
}

export interface CatalogPresentation {
  name: string;
  sku?: string | null;
  essenceMl: number;
  price: number;
  listPrice?: number | null;
  isRefill?: boolean;
  /** Envase que se descuenta (null en relleno). */
  container?: { name: string; sku?: string | null } | null;
  /** Relleno: solo para clientes con compra previa de una presentación grantsRefill. */
  requiresPriorPurchase?: boolean;
  grantsRefill?: boolean;
  /** Promo "lleva promoBuy, paga promoPay" (2x1, 3x2). */
  promoBuy?: number | null;
  promoPay?: number | null;
  sortOrder?: number;
}

/** Producto de inventario por unidad (feromona, atomizador de regalo). */
export interface CatalogStockItem {
  name: string;
  sku?: string | null;
  category?: string | null;
}

export interface CatalogExtra {
  name: string;
  price: number;
  /** ml extra de la misma fragancia por frasco. */
  extraEssenceMl?: number | null;
  /** O un producto que se descuenta por frasco. */
  product?: CatalogStockItem | null;
  productQty?: number;
  sortOrder?: number;
}

export interface CatalogPack {
  name: string;
  /** Tamaño del frasco del pack; el color se elige al vender. */
  essenceMl: number;
  fragranceCount: number;
  price: number;
  listPrice?: number | null;
  gift?: CatalogStockItem | null;
  sortOrder?: number;
}

export interface PerfumeryCatalog {
  fragrances: CatalogFragrance[];
  presentations?: CatalogPresentation[];
  extras?: CatalogExtra[];
  packs?: CatalogPack[];
}

/**
 * Presentaciones iniciales tomadas de la tienda web de referencia (05/11/2026).
 * El dueño ajusta precios y ml desde Perfumería → Presentaciones.
 */
export const DEFAULT_PRESENTATIONS: CatalogPresentation[] = [
  {
    name: 'Relleno 120 ml', sku: 'BPR001', essenceMl: 120, price: 43, isRefill: true, container: null,
    requiresPriorPurchase: true, sortOrder: 1,
  },
  ...(['Azul', 'Rojo', 'Gris', 'Transparente'] as const).flatMap((color, index) => [
    {
      name: `50 ml ${color}`, sku: `PAR5000${index + 1}`, essenceMl: 50, price: 35.94, listPrice: 59.9,
      container: { name: `Envase 50 ml Perfumarte ${color}`, sku: `PAR5000${index + 1}` }, sortOrder: 10 + index,
    },
    {
      name: `100 ml ${color}`, sku: `PAR1000${index + 1}`, essenceMl: 100, price: 53.94, listPrice: 89.9,
      container: { name: `Envase 100 ml Perfumarte ${color}`, sku: `PAR1000${index + 1}` }, sortOrder: 20 + index,
    },
  ]),
  {
    name: '120 ml Black Stone', sku: 'P1018', essenceMl: 120, price: 59.9, listPrice: 99.9,
    container: { name: 'Envase 120 ml Black Stone', sku: 'P1018' }, grantsRefill: true, sortOrder: 30,
  },
  ...([['Verde', 'P0410'], ['Morado', 'P0411'], ['Azul', 'P0412'], ['Fucsia', 'P0413']] as const).map(([color, sku], index) => ({
    name: `60 ml Teens ${color}`, sku, essenceMl: 60, price: 24.9, listPrice: 64,
    container: { name: `Envase 60 ml Teens ${color}`, sku }, sortOrder: 40 + index,
  })),
];

/** Extras de la línea tomados de la web de referencia (05/11/2026). */
export const DEFAULT_EXTRAS: CatalogExtra[] = [
  { name: 'Feromona Dama 10 g', price: 20, product: { name: 'Feromona Dama 10 g', sku: 'PTFF001', category: 'Feromonas' }, productQty: 1, sortOrder: 1 },
  { name: 'Feromona Caballero 10 g', price: 20, product: { name: 'Feromona Caballero 10 g', sku: 'PTFM001', category: 'Feromonas' }, productQty: 1, sortOrder: 2 },
  { name: '5 g adicionales', price: 10, extraEssenceMl: 5, sortOrder: 3 },
  { name: '10 g adicionales', price: 20, extraEssenceMl: 10, sortOrder: 4 },
];

/** Packs a precio cerrado de la web de referencia (05/11/2026). */
export const DEFAULT_PACKS: CatalogPack[] = [
  { name: 'Pack 2 x 50 ml', essenceMl: 50, fragranceCount: 2, price: 69.9, sortOrder: 1 },
  { name: 'Pack 3 x 50 ml', essenceMl: 50, fragranceCount: 3, price: 99.9, sortOrder: 2 },
  { name: 'Pack 2 x 100 ml', essenceMl: 100, fragranceCount: 2, price: 104.9, sortOrder: 3 },
  { name: 'Pack 3 x 100 ml', essenceMl: 100, fragranceCount: 3, price: 149.9, sortOrder: 4 },
  {
    name: 'Pack 4 x 100 ml + atomizador', essenceMl: 100, fragranceCount: 4, price: 179.9, sortOrder: 5,
    gift: { name: 'Atomizador de bolsillo 5 ml', sku: 'AT005', category: 'Accesorios' },
  },
  { name: 'Pack 3 x 120 ml Black Stone', essenceMl: 120, fragranceCount: 3, price: 179.9, sortOrder: 6 },
];

export function normalizeCode(code: unknown): string {
  return String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeGender(value: unknown, code?: string): Gender | null {
  const text = String(value ?? '').trim().toUpperCase();
  if (['MUJER', 'FEMENINO', 'DAMA', 'F', 'ELLA'].includes(text)) return 'MUJER';
  if (['HOMBRE', 'MASCULINO', 'CABALLERO', 'M', 'EL', 'ÉL'].includes(text)) return 'HOMBRE';
  if (['UNISEX', 'U'].includes(text)) return 'UNISEX';
  if (code?.startsWith('F')) return 'MUJER';
  if (code?.startsWith('M')) return 'HOMBRE';
  if (code?.startsWith('U')) return 'UNISEX';
  return null;
}

export function fragranceDisplayName(fragrance: { code: string; reference?: string | null; referenceBrand?: string | null }) {
  const reference = [fragrance.reference, fragrance.referenceBrand].filter(Boolean).join(' de ');
  return reference ? `${fragrance.code} Inspirado en ${reference}` : fragrance.code;
}

export function categoryForGender(gender: Gender | null): string {
  if (gender === 'MUJER') return 'Fragancias Mujer';
  if (gender === 'HOMBRE') return 'Fragancias Hombre';
  return 'Fragancias Unisex';
}

const cleanText = (value: unknown, max = 200): string | null => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

const cleanList = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[;,|]/);
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
};

const positiveOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export interface CatalogValidation {
  fragrances: CatalogFragrance[];
  presentations: CatalogPresentation[];
  extras: CatalogExtra[];
  packs: CatalogPack[];
  errors: string[];
}

const cleanStockItem = (raw: unknown): CatalogStockItem | null => {
  const item = (raw ?? {}) as Partial<CatalogStockItem>;
  const name = cleanText(item.name, 120);
  return name ? { name, sku: cleanText(item.sku, 40), category: cleanText(item.category, 60) } : null;
};

const isBlank = (value: unknown) => value === null || value === undefined || value === '';

const promoPair = (buy: unknown, pay: unknown): { promoBuy: number | null; promoPay: number | null } | 'invalid' => {
  if (isBlank(buy) && isBlank(pay)) return { promoBuy: null, promoPay: null };
  const b = Number(buy);
  const p = Number(pay);
  return Number.isInteger(b) && Number.isInteger(p) && p >= 1 && b > p && b <= 10 ? { promoBuy: b, promoPay: p } : 'invalid';
};

/** Valida y normaliza un catálogo recibido (JSON propio o del exportador). */
export function validateCatalog(input: unknown, { maxFragrances = 2000 } = {}): CatalogValidation {
  const errors: string[] = [];
  const body = (input ?? {}) as Partial<PerfumeryCatalog>;
  const rawFragrances = Array.isArray(body.fragrances) ? body.fragrances : [];
  const rawPresentations = Array.isArray(body.presentations) ? body.presentations : [];
  const rawExtras = Array.isArray(body.extras) ? body.extras : [];
  const rawPacks = Array.isArray(body.packs) ? body.packs : [];

  if (rawFragrances.length === 0 && rawPresentations.length === 0 && rawExtras.length === 0 && rawPacks.length === 0) {
    errors.push('El archivo no tiene fragancias ni presentaciones');
  }
  if (rawFragrances.length > maxFragrances) {
    errors.push(`Máximo ${maxFragrances} fragancias por importación`);
  }

  const seen = new Set<string>();
  const fragrances: CatalogFragrance[] = [];
  rawFragrances.slice(0, maxFragrances).forEach((raw, index) => {
    const code = normalizeCode(raw?.code);
    if (!/^[A-Z0-9-]{1,20}$/.test(code)) {
      errors.push(`Fila ${index + 1}: código inválido "${raw?.code ?? ''}"`);
      return;
    }
    if (seen.has(code)) {
      errors.push(`Código repetido: ${code}`);
      return;
    }
    seen.add(code);
    fragrances.push({
      code,
      reference: cleanText(raw.reference),
      referenceBrand: cleanText(raw.referenceBrand, 100),
      gender: normalizeGender(raw.gender, code),
      family: cleanText(raw.family, 80),
      aromas: cleanList(raw.aromas),
      seasons: cleanList(raw.seasons),
      occasions: cleanList(raw.occasions),
      scent: cleanText(raw.scent),
      description: cleanText(raw.description, 4000),
      // Enlace web (https) o foto guardada en la PC por la importación ZIP.
      imageUrl: /^https:\/\/|^\/api\/desktop\/local-image\/[A-Za-z0-9_-]+$/.test(String(raw.imageUrl ?? ''))
        ? String(raw.imageUrl).slice(0, 500)
        : null,
      stockMl: positiveOrNull(raw.stockMl),
      costPerMl: positiveOrNull(raw.costPerMl),
    });
  });

  const presentationNames = new Set<string>();
  const presentations: CatalogPresentation[] = [];
  rawPresentations.forEach((raw, index) => {
    const name = cleanText(raw?.name, 80);
    const essenceMl = Number(raw?.essenceMl);
    const price = Number(raw?.price);
    if (!name) return errors.push(`Presentación ${index + 1}: falta el nombre`);
    if (presentationNames.has(name.toLowerCase())) return errors.push(`Presentación repetida: ${name}`);
    if (!(essenceMl > 0 && essenceMl <= 5000)) return errors.push(`${name}: ml de fragancia inválidos`);
    if (!(price > 0 && price <= 100000)) return errors.push(`${name}: precio inválido`);
    presentationNames.add(name.toLowerCase());
    const containerName = cleanText(raw.container?.name, 120);
    const promo = promoPair(raw.promoBuy, raw.promoPay);
    if (promo === 'invalid') return errors.push(`${name}: promo inválida (lleva más de lo que paga, ej. 2x1)`);
    presentations.push({
      ...promo,
      requiresPriorPurchase: Boolean(raw.requiresPriorPurchase),
      grantsRefill: Boolean(raw.grantsRefill),
      name,
      sku: cleanText(raw.sku, 40),
      essenceMl,
      price: Math.round(price * 100) / 100,
      listPrice: positiveOrNull(raw.listPrice),
      isRefill: Boolean(raw.isRefill),
      container: containerName ? { name: containerName, sku: cleanText(raw.container?.sku, 40) } : null,
      sortOrder: Number.isInteger(raw.sortOrder) ? raw.sortOrder : index,
    });
  });

  const extraNames = new Set<string>();
  const extras: CatalogExtra[] = [];
  rawExtras.forEach((raw, index) => {
    const name = cleanText(raw?.name, 80);
    const price = Number(raw?.price);
    const extraEssenceMl = positiveOrNull(raw?.extraEssenceMl);
    const product = cleanStockItem(raw?.product);
    const productQty = isBlank(raw?.productQty) ? 1 : Number(raw.productQty);
    if (!name) return errors.push(`Extra ${index + 1}: falta el nombre`);
    if (extraNames.has(name.toLowerCase())) return errors.push(`Extra repetido: ${name}`);
    if (!(price >= 0 && price <= 100000)) return errors.push(`${name}: precio inválido`);
    if (Boolean(extraEssenceMl) === Boolean(product)) return errors.push(`${name}: indica ml extra o un producto (uno de los dos)`);
    if (product && !(productQty > 0 && productQty <= 1000)) return errors.push(`${name}: cantidad del producto inválida`);
    extraNames.add(name.toLowerCase());
    extras.push({
      name,
      price: Math.round(price * 100) / 100,
      extraEssenceMl: extraEssenceMl || null,
      product,
      productQty: product ? productQty : 1,
      sortOrder: Number.isInteger(raw.sortOrder) ? raw.sortOrder : index,
    });
  });

  const packNames = new Set<string>();
  const packs: CatalogPack[] = [];
  rawPacks.forEach((raw, index) => {
    const name = cleanText(raw?.name, 80);
    const essenceMl = Number(raw?.essenceMl);
    const fragranceCount = Number(raw?.fragranceCount);
    const price = Number(raw?.price);
    if (!name) return errors.push(`Pack ${index + 1}: falta el nombre`);
    if (packNames.has(name.toLowerCase())) return errors.push(`Pack repetido: ${name}`);
    if (!(essenceMl > 0 && essenceMl <= 5000)) return errors.push(`${name}: ml del frasco inválidos`);
    if (!(Number.isInteger(fragranceCount) && fragranceCount >= 2 && fragranceCount <= 10)) return errors.push(`${name}: el pack lleva de 2 a 10 fragancias`);
    if (!(price > 0 && price <= 100000)) return errors.push(`${name}: precio inválido`);
    packNames.add(name.toLowerCase());
    packs.push({
      name,
      essenceMl,
      fragranceCount,
      price: Math.round(price * 100) / 100,
      listPrice: positiveOrNull(raw.listPrice),
      gift: cleanStockItem(raw.gift),
      sortOrder: Number.isInteger(raw.sortOrder) ? raw.sortOrder : index,
    });
  });

  return { fragrances, presentations, extras, packs, errors };
}

/**
 * CSV de fragancias. Columnas reconocidas (encabezado obligatorio, separador
 * coma o punto y coma): codigo, perfume, marca, genero, familia, aromas,
 * temporadas, ocasiones, olor, stock_ml, costo_ml.
 */
export function parseFragranceCsv(text: string): CatalogFragrance[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const split = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted;
      } else if (char === separator && !quoted) { cells.push(current); current = ''; } else current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  };
  const normalize = (header: string) => header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z_]/g, '');
  const headers = split(lines[0]).map(normalize);
  const column = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const idx = {
    code: column('codigo', 'code', 'cod'),
    reference: column('perfume', 'referencia', 'inspiradoen', 'nombre', 'reference'),
    brand: column('marca', 'brand', 'referencebrand'),
    gender: column('genero', 'gender', 'sexo'),
    family: column('familia', 'family', 'familiaolfativa'),
    aromas: column('aromas', 'aroma'),
    seasons: column('temporadas', 'temporada', 'seasons'),
    occasions: column('ocasiones', 'ocasion', 'occasions'),
    scent: column('olor', 'scent', 'notas'),
    stock: column('stock_ml', 'stockml', 'stock', 'ml'),
    cost: column('costo_ml', 'costoml', 'costo', 'costpm'),
  };
  if (idx.code < 0) return [];
  const get = (cells: string[], index: number) => (index >= 0 ? cells[index] ?? '' : '');
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return {
      code: get(cells, idx.code),
      reference: get(cells, idx.reference) || null,
      referenceBrand: get(cells, idx.brand) || null,
      gender: get(cells, idx.gender) || null,
      family: get(cells, idx.family) || null,
      aromas: cleanList(get(cells, idx.aromas)),
      seasons: cleanList(get(cells, idx.seasons)),
      occasions: cleanList(get(cells, idx.occasions)),
      scent: get(cells, idx.scent) || null,
      stockMl: positiveOrNull(get(cells, idx.stock).replace(',', '.')),
      costPerMl: positiveOrNull(get(cells, idx.cost).replace(',', '.')),
    };
  });
}

type Tx = Prisma.TransactionClient;

async function ensureUnit(tx: Tx, code: 'ML' | 'NIU') {
  if (code === 'ML') {
    const existing = await tx.unit.findFirst({ where: { OR: [{ code: 'ML' }, { sunatCode: 'MLT' }] } });
    if (existing) return existing;
    return tx.unit.create({
      data: { code: 'ML', sunatCode: 'MLT', name: 'Mililitro', displayName: 'MILILITRO', symbol: 'ml', allowDecimals: true, precision: 1, isBase: false },
    });
  }
  const existing = await tx.unit.findFirst({ where: { sunatCode: 'NIU' } });
  if (existing) return existing;
  return tx.unit.create({
    data: { code: 'UNIT', sunatCode: 'NIU', name: 'Unidad', displayName: 'UNIDAD', symbol: 'und', allowDecimals: false, precision: 0, isBase: true },
  });
}

export interface ImportOptions {
  storeId: string;
  /** Stock inicial (ml) de fragancias nuevas sin stockMl propio. null = sin control. */
  initialStockMl: number | null;
  /** Stock inicial de envases nuevos. null = sin control. */
  initialContainerStock: number | null;
  /** Actualiza datos descriptivos de fragancias existentes (nunca su stock). */
  updateExisting: boolean;
}

export interface ImportResult {
  fragrancesCreated: number;
  fragrancesUpdated: number;
  fragrancesSkipped: number;
  presentationsCreated: number;
  presentationsUpdated: number;
  containersCreated: number;
  extrasCreated: number;
  extrasUpdated: number;
  packsCreated: number;
  packsUpdated: number;
  stockItemsCreated: number;
}

const skuSafe = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Busca o crea el producto por unidad de la sede (feromona, atomizador). */
async function ensureStockItem(
  tx: Tx,
  storeId: string,
  item: CatalogStockItem,
  price: number,
  initialStock: number | null
): Promise<{ id: string; created: boolean }> {
  const unitNiu = await ensureUnit(tx, 'NIU');
  const internalSku = `PERF-ITEM-${storeId}-${skuSafe(item.sku || item.name)}`;
  let master = await tx.productMaster.findUnique({ where: { internalSku } });
  if (!master) {
    master = await tx.productMaster.create({
      data: {
        internalSku,
        name: item.name,
        category: item.category || 'Accesorios',
        unitType: UnitType.UNIT,
        baseUnitId: unitNiu.id,
        createdByStoreId: storeId,
      },
    });
  }
  const existing = await tx.storeProduct.findUnique({
    where: { storeId_productId: { storeId, productId: master.id } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const created = await tx.storeProduct.create({
    data: {
      storeId,
      productId: master.id,
      price: new Prisma.Decimal(Math.max(0.01, price)),
      stock: initialStock != null ? new Prisma.Decimal(initialStock) : null,
      minStock: initialStock != null ? new Prisma.Decimal(5) : null,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export async function importPerfumeryCatalog(
  tx: Tx,
  catalog: { fragrances: CatalogFragrance[]; presentations: CatalogPresentation[]; extras?: CatalogExtra[]; packs?: CatalogPack[] },
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = {
    fragrancesCreated: 0, fragrancesUpdated: 0, fragrancesSkipped: 0,
    presentationsCreated: 0, presentationsUpdated: 0, containersCreated: 0,
    extrasCreated: 0, extrasUpdated: 0, packsCreated: 0, packsUpdated: 0, stockItemsCreated: 0,
  };
  const { storeId } = options;

  const mlUnit = catalog.fragrances.length ? await ensureUnit(tx, 'ML') : null;
  const refill = catalog.presentations.find((p) => p.isRefill)
    ?? (await tx.perfumePresentation.findFirst({ where: { storeId, isRefill: true, active: true } })
      .then((p) => (p ? { price: Number(p.price), essenceMl: Number(p.essenceMl) } : null)));
  // Precio por ml de referencia (venta suelta de esencia desde el POS normal).
  const pricePerMl = refill ? Math.max(0.01, Math.round((refill.price / refill.essenceMl) * 100) / 100) : 0.01;

  for (const fragrance of catalog.fragrances) {
    const gender = normalizeGender(fragrance.gender, fragrance.code);
    const name = fragranceDisplayName(fragrance);
    const existing = await tx.fragrance.findUnique({
      where: { storeId_code: { storeId, code: fragrance.code } },
      include: { storeProduct: { select: { productId: true } } },
    });
    const descriptive = {
      reference: fragrance.reference ?? null,
      referenceBrand: fragrance.referenceBrand ?? null,
      gender,
      family: fragrance.family ?? null,
      aromas: fragrance.aromas ?? [],
      seasons: fragrance.seasons ?? [],
      occasions: fragrance.occasions ?? [],
      scent: fragrance.scent ?? null,
      description: fragrance.description ?? null,
      imageUrl: fragrance.imageUrl ?? null,
    };

    if (existing) {
      if (!options.updateExisting) { result.fragrancesSkipped++; continue; }
      await tx.fragrance.update({ where: { id: existing.id }, data: { ...descriptive, active: true } });
      await tx.productMaster.update({
        where: { id: existing.storeProduct.productId },
        data: { name, category: categoryForGender(gender), imageUrl: fragrance.imageUrl ?? undefined },
      });
      result.fragrancesUpdated++;
      continue;
    }

    const stockMl = fragrance.stockMl ?? options.initialStockMl;
    const master = await tx.productMaster.create({
      data: {
        internalSku: `PERF-${storeId}-${fragrance.code}`,
        name,
        content: 'Esencia (ml)',
        category: categoryForGender(gender),
        unitType: UnitType.UNIT,
        baseUnitId: mlUnit!.id,
        imageUrl: fragrance.imageUrl ?? null,
        createdByStoreId: storeId,
      },
    });
    const storeProduct = await tx.storeProduct.create({
      data: {
        storeId,
        productId: master.id,
        price: new Prisma.Decimal(pricePerMl),
        costPrice: fragrance.costPerMl != null ? new Prisma.Decimal(fragrance.costPerMl) : null,
        stock: stockMl != null ? new Prisma.Decimal(stockMl) : null,
        minStock: stockMl != null ? new Prisma.Decimal(250) : null,
      },
    });
    await tx.fragrance.create({
      data: { storeId, storeProductId: storeProduct.id, code: fragrance.code, ...descriptive },
    });
    result.fragrancesCreated++;
  }

  if (catalog.presentations.length) {
    const unitNiu = await ensureUnit(tx, 'NIU');
    for (const presentation of catalog.presentations) {
      let containerStoreProductId: string | null = null;
      if (presentation.container) {
        const internalSku = `PERF-ENV-${storeId}-${skuSafe(presentation.container.sku || presentation.container.name)}`;
        let master = await tx.productMaster.findUnique({ where: { internalSku } });
        if (!master) {
          master = await tx.productMaster.create({
            data: {
              internalSku,
              name: presentation.container.name,
              category: 'Envases',
              unitType: UnitType.UNIT,
              baseUnitId: unitNiu.id,
              createdByStoreId: storeId,
            },
          });
        }
        let storeProduct = await tx.storeProduct.findUnique({
          where: { storeId_productId: { storeId, productId: master.id } },
          select: { id: true },
        });
        if (!storeProduct) {
          storeProduct = await tx.storeProduct.create({
            data: {
              storeId,
              productId: master.id,
              price: new Prisma.Decimal(presentation.price),
              stock: options.initialContainerStock != null ? new Prisma.Decimal(options.initialContainerStock) : null,
              minStock: options.initialContainerStock != null ? new Prisma.Decimal(10) : null,
            },
            select: { id: true },
          });
          result.containersCreated++;
        }
        containerStoreProductId = storeProduct.id;
      }

      const data = {
        sku: presentation.sku ?? null,
        essenceMl: new Prisma.Decimal(presentation.essenceMl),
        price: new Prisma.Decimal(presentation.price),
        listPrice: presentation.listPrice != null ? new Prisma.Decimal(presentation.listPrice) : null,
        containerStoreProductId,
        isRefill: Boolean(presentation.isRefill),
        requiresPriorPurchase: Boolean(presentation.requiresPriorPurchase),
        grantsRefill: Boolean(presentation.grantsRefill),
        promoBuy: presentation.promoBuy ?? null,
        promoPay: presentation.promoPay ?? null,
        sortOrder: presentation.sortOrder ?? 0,
        active: true,
      };
      const existing = await tx.perfumePresentation.findUnique({
        where: { storeId_name: { storeId, name: presentation.name } },
        select: { id: true },
      });
      if (existing) {
        if (!options.updateExisting) continue;
        await tx.perfumePresentation.update({ where: { id: existing.id }, data });
        result.presentationsUpdated++;
      } else {
        await tx.perfumePresentation.create({ data: { storeId, name: presentation.name, ...data } });
        result.presentationsCreated++;
      }
    }
  }

  for (const extra of catalog.extras ?? []) {
    const existing = await tx.perfumeExtra.findUnique({
      where: { storeId_name: { storeId, name: extra.name } },
      select: { id: true },
    });
    if (existing && !options.updateExisting) continue;
    let storeProductId: string | null = null;
    if (extra.product) {
      const item = await ensureStockItem(tx, storeId, extra.product, extra.price, options.initialContainerStock);
      if (item.created) result.stockItemsCreated++;
      storeProductId = item.id;
    }
    const data = {
      price: new Prisma.Decimal(extra.price),
      storeProductId,
      productQty: new Prisma.Decimal(extra.productQty ?? 1),
      extraEssenceMl: extra.extraEssenceMl ? new Prisma.Decimal(extra.extraEssenceMl) : null,
      sortOrder: extra.sortOrder ?? 0,
      active: true,
    };
    if (existing) {
      await tx.perfumeExtra.update({ where: { id: existing.id }, data });
      result.extrasUpdated++;
    } else {
      await tx.perfumeExtra.create({ data: { storeId, name: extra.name, ...data } });
      result.extrasCreated++;
    }
  }

  for (const pack of catalog.packs ?? []) {
    const existing = await tx.perfumePack.findUnique({
      where: { storeId_name: { storeId, name: pack.name } },
      select: { id: true },
    });
    if (existing && !options.updateExisting) continue;
    let giftStoreProductId: string | null = null;
    if (pack.gift) {
      const item = await ensureStockItem(tx, storeId, pack.gift, 0.01, options.initialContainerStock);
      if (item.created) result.stockItemsCreated++;
      giftStoreProductId = item.id;
    }
    const data = {
      essenceMl: new Prisma.Decimal(pack.essenceMl),
      fragranceCount: pack.fragranceCount,
      price: new Prisma.Decimal(pack.price),
      listPrice: pack.listPrice != null ? new Prisma.Decimal(pack.listPrice) : null,
      giftStoreProductId,
      sortOrder: pack.sortOrder ?? 0,
      active: true,
    };
    if (existing) {
      await tx.perfumePack.update({ where: { id: existing.id }, data });
      result.packsUpdated++;
    } else {
      await tx.perfumePack.create({ data: { storeId, name: pack.name, ...data } });
      result.packsCreated++;
    }
  }

  return result;
}

/** Exporta el catálogo de la sede en el formato que acepta el importador. */
export async function exportPerfumeryCatalog(
  tx: Pick<Tx, 'fragrance' | 'perfumePresentation' | 'perfumeExtra' | 'perfumePack'>,
  storeId: string
): Promise<PerfumeryCatalog> {
  const stockItemSelect = { select: { product: { select: { name: true, internalSku: true, category: true } } } };
  const [fragrances, presentations, extras, packs] = await Promise.all([
    tx.fragrance.findMany({
      where: { storeId, active: true },
      include: { storeProduct: { select: { costPrice: true } } },
      orderBy: { code: 'asc' },
    }),
    tx.perfumePresentation.findMany({
      where: { storeId, active: true },
      include: { container: { select: { product: { select: { name: true, internalSku: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    tx.perfumeExtra.findMany({
      where: { storeId, active: true },
      include: { storeProduct: stockItemSelect },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    tx.perfumePack.findMany({
      where: { storeId, active: true },
      include: { gift: stockItemSelect },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);
  // El SKU interno es PERF-ITEM-<sede>-<sku>: se exporta solo la parte del sku.
  const itemPrefix = `PERF-ITEM-${storeId}-`;
  const exportItem = (sp: { product: { name: string; internalSku: string; category: string | null } } | null) =>
    sp
      ? {
          name: sp.product.name,
          sku: sp.product.internalSku.startsWith(itemPrefix) ? sp.product.internalSku.slice(itemPrefix.length) : null,
          category: sp.product.category,
        }
      : null;
  return {
    fragrances: fragrances.map((f) => ({
      code: f.code,
      reference: f.reference,
      referenceBrand: f.referenceBrand,
      gender: f.gender,
      family: f.family,
      aromas: f.aromas,
      seasons: f.seasons,
      occasions: f.occasions,
      scent: f.scent,
      description: f.description,
      // Las fotos guardadas en esta PC no sirven en otra sede: solo se exportan enlaces web.
      imageUrl: f.imageUrl?.startsWith('https://') ? f.imageUrl : null,
      costPerMl: f.storeProduct.costPrice?.toNumber() ?? null,
    })),
    presentations: presentations.map((p) => ({
      name: p.name,
      sku: p.sku,
      essenceMl: p.essenceMl.toNumber(),
      price: p.price.toNumber(),
      listPrice: p.listPrice?.toNumber() ?? null,
      isRefill: p.isRefill,
      requiresPriorPurchase: p.requiresPriorPurchase,
      grantsRefill: p.grantsRefill,
      promoBuy: p.promoBuy,
      promoPay: p.promoPay,
      sortOrder: p.sortOrder,
      container: p.container ? { name: p.container.product.name, sku: p.sku } : null,
    })),
    extras: extras.map((e) => ({
      name: e.name,
      price: e.price.toNumber(),
      extraEssenceMl: e.extraEssenceMl?.toNumber() ?? null,
      product: exportItem(e.storeProduct),
      productQty: e.productQty.toNumber(),
      sortOrder: e.sortOrder,
    })),
    packs: packs.map((p) => ({
      name: p.name,
      essenceMl: p.essenceMl.toNumber(),
      fragranceCount: p.fragranceCount,
      price: p.price.toNumber(),
      listPrice: p.listPrice?.toNumber() ?? null,
      gift: exportItem(p.gift),
      sortOrder: p.sortOrder,
    })),
  };
}
