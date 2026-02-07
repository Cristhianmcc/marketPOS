/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO B-SUNAT-UNITS — SEED UNIDADES SUNAT GLOBAL
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Catálogo completo de unidades de medida según SUNAT (UN/CEFACT).
 * Compatible con facturación electrónica Perú.
 * 
 * Ejecutar:
 *   npx ts-node scripts/seed-units-sunat.ts
 *   # o
 *   npm run seed:units
 */

import { PrismaClient, UnitKind } from '@prisma/client';

const prisma = new PrismaClient();

interface UnitSeed {
  code: string;          // Código interno del sistema
  sunatCode: string;     // Código SUNAT (UN/CEFACT)
  name: string;          // Nombre corto
  displayName: string;   // Nombre oficial SUNAT
  symbol: string;        // Símbolo comercial (para UI)
  kind: UnitKind;        // GOODS o SERVICES
  allowDecimals: boolean;
  precision: number;     // Decimales permitidos
  isBase: boolean;       // Es unidad base del sistema
  sortOrder: number;     // Orden en dropdown
}

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO COMPLETO DE UNIDADES SUNAT (Anexo N° 8)
// Fuente: UN/CEFACT (ISO 20022) - Catálogo de unidades de medida SUNAT
// ════════════════════════════════════════════════════════════════════════════

const SUNAT_UNITS: UnitSeed[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES BÁSICAS (más usadas - sortOrder 1-10)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'UNIT', sunatCode: 'NIU', name: 'Unidad', displayName: 'UNIDAD (BIENES)', symbol: 'UND', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: true, sortOrder: 1 },
  { code: 'KG', sunatCode: 'KGM', name: 'Kilogramo', displayName: 'KILOGRAMO', symbol: 'kg', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 2 },
  { code: 'L', sunatCode: 'LTR', name: 'Litro', displayName: 'LITRO', symbol: 'L', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 3 },
  { code: 'M', sunatCode: 'MTR', name: 'Metro', displayName: 'METRO', symbol: 'm', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: true, sortOrder: 4 },
  { code: 'M2', sunatCode: 'MTK', name: 'Metro cuadrado', displayName: 'METRO CUADRADO', symbol: 'm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: true, sortOrder: 5 },
  { code: 'M3', sunatCode: 'MTQ', name: 'Metro cúbico', displayName: 'METRO CÚBICO', symbol: 'm³', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 6 },
  { code: 'PC', sunatCode: 'C62', name: 'Pieza', displayName: 'PIEZA', symbol: 'PZA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: true, sortOrder: 7 },
  { code: 'G', sunatCode: 'GRM', name: 'Gramo', displayName: 'GRAMO', symbol: 'g', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 8 },
  { code: 'ML', sunatCode: 'MLT', name: 'Mililitro', displayName: 'MILILITRO', symbol: 'mL', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 9 },
  { code: 'CM', sunatCode: 'CMT', name: 'Centímetro', displayName: 'CENTÍMETRO', symbol: 'cm', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 10 },

  // ─────────────────────────────────────────────────────────────────────────
  // EMPAQUES Y CONTENEDORES (sortOrder 20-60)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'BOX', sunatCode: 'BX', name: 'Caja', displayName: 'CAJA', symbol: 'CAJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 20 },
  { code: 'PACK', sunatCode: 'PK', name: 'Paquete', displayName: 'PAQUETE', symbol: 'PAQ', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 21 },
  { code: 'BAG', sunatCode: 'BG', name: 'Bolsa', displayName: 'BOLSA', symbol: 'BOLSA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 22 },
  { code: 'SACK', sunatCode: 'SA', name: 'Saco', displayName: 'SACO', symbol: 'SACO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 23 },
  { code: 'BALE', sunatCode: 'BE', name: 'Fardo', displayName: 'FARDO', symbol: 'FARDO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 24 },
  { code: 'ROLL', sunatCode: 'RL', name: 'Carrete', displayName: 'CARRETE', symbol: 'CRR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 25 },
  { code: 'SET', sunatCode: 'SET', name: 'Juego', displayName: 'JUEGO', symbol: 'JUEGO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 26 },
  { code: 'DOZEN', sunatCode: 'DZN', name: 'Docena', displayName: 'DOCENA', symbol: 'DOC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 27 },
  { code: 'PAR', sunatCode: 'PR', name: 'Par', displayName: 'PAR', symbol: 'PAR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 28 },
  { code: 'KIT', sunatCode: 'KT', name: 'Kit', displayName: 'KIT', symbol: 'KIT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 29 },
  { code: 'CAN', sunatCode: 'CA', name: 'Lata', displayName: 'LATA', symbol: 'LATA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 30 },
  { code: 'BTL', sunatCode: 'BO', name: 'Botella', displayName: 'BOTELLA', symbol: 'BOT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 31 },
  { code: 'BOLT', sunatCode: 'BT', name: 'Tornillo', displayName: 'TORNILLO', symbol: 'TORN', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 32 },
  { code: 'BARREL', sunatCode: 'BLL', name: 'Barril', displayName: 'BARRIL', symbol: 'BARRIL', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 33 },
  { code: 'BUCKET', sunatCode: 'BJ', name: 'Balde', displayName: 'BALDE', symbol: 'BALDE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 34 },
  { code: 'CARTON', sunatCode: 'CT', name: 'Cartón', displayName: 'CARTÓN', symbol: 'CARTON', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 35 },
  { code: 'CYLINDER', sunatCode: 'CY', name: 'Cilindro', displayName: 'CILINDRO', symbol: 'CIL', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 36 },
  { code: 'CONE', sunatCode: 'CJ', name: 'Conos', displayName: 'CONOS', symbol: 'CN', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 37 },
  { code: 'CONTAINER', sunatCode: 'CH', name: 'Envase', displayName: 'ENVASE', symbol: 'ENV', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 38 },
  { code: 'CAPSULE', sunatCode: 'AV', name: 'Cápsula', displayName: 'CÁPSULA', symbol: 'CAPS', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 39 },
  { code: 'JAR', sunatCode: 'JR', name: 'Frasco', displayName: 'FRASCO', symbol: 'FRASCO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 40 },
  { code: 'TUBE', sunatCode: 'TU', name: 'Tubo', displayName: 'TUBO', symbol: 'TUBO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 41 },
  { code: 'DRUM', sunatCode: 'DR', name: 'Tambor', displayName: 'TAMBOR', symbol: 'TAMBOR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 42 },
  { code: 'JUG', sunatCode: 'JG', name: 'Jarra', displayName: 'JARRA', symbol: 'JARR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 43 },
  { code: 'DZP', sunatCode: 'DZP', name: 'Docena por millón', displayName: 'DOCENA POR 10**6', symbol: 'DOC2', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 44 },
  { code: 'REAM', sunatCode: 'RM', name: 'Resma', displayName: 'RESMA', symbol: 'RESMA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 45 },
  { code: 'SHEET', sunatCode: 'ST', name: 'Pliego', displayName: 'PLIEGO', symbol: 'PLGO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 46 },
  { code: 'PLATE', sunatCode: 'PG', name: 'Placas', displayName: 'PLACAS', symbol: 'PLAC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 47 },
  { code: 'LEAF', sunatCode: 'LEF', name: 'Hoja', displayName: 'HOJA', symbol: 'HOJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 48 },
  { code: 'QUARTER_DOZEN', sunatCode: 'QD', name: 'Cuarto de docena', displayName: 'CUARTO DE DOCENA', symbol: '1/4 DOC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 49 },
  { code: 'PALLET', sunatCode: 'PF', name: 'Paletas', displayName: 'PALETAS', symbol: 'PAL', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 50 },
  { code: 'HALF_DOZEN', sunatCode: 'HD', name: 'Media docena', displayName: 'MEDIA DOCENA', symbol: '1/2 DOC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 51 },
  { code: 'HALF_HOUR', sunatCode: 'HT', name: 'Media hora', displayName: 'MEDIA HORA', symbol: '1/2 H', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 52 },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES DE LONGITUD (sortOrder 60-69)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'MM', sunatCode: 'MMT', name: 'Milímetro', displayName: 'MILÍMETRO', symbol: 'mm', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 60 },
  { code: 'PIE', sunatCode: 'FOT', name: 'Pie', displayName: 'PIE', symbol: 'ft', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 61 },
  { code: 'PULG', sunatCode: 'INH', name: 'Pulgada', displayName: 'PULGADA', symbol: 'in', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 62 },
  { code: 'YD', sunatCode: 'YRD', name: 'Yarda', displayName: 'YARDA', symbol: 'yd', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 63 },
  { code: 'ROD', sunatCode: 'RD', name: 'Varilla', displayName: 'VARILLA', symbol: 'VAR', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 64 },
  { code: 'KTM', sunatCode: 'KTM', name: 'Kilómetro', displayName: 'KILÓMETRO', symbol: 'km', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 65 },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES DE ÁREA (sortOrder 70-79)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'CM2', sunatCode: 'CMK', name: 'Centímetro cuadrado', displayName: 'CENTÍMETRO CUADRADO', symbol: 'cm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 70 },
  { code: 'MM2', sunatCode: 'MMK', name: 'Milímetro cuadrado', displayName: 'MILÍMETRO CUADRADO', symbol: 'mm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 71 },
  { code: 'PIE2', sunatCode: 'FTK', name: 'Pie cuadrado', displayName: 'PIE CUADRADO', symbol: 'ft²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 72 },
  { code: 'YD2', sunatCode: 'YDK', name: 'Yarda cuadrada', displayName: 'YARDA CUADRADA', symbol: 'yd²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 73 },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES DE VOLUMEN (sortOrder 80-89)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'CM3', sunatCode: 'CMQ', name: 'Centímetro cúbico', displayName: 'CENTÍMETRO CÚBICO', symbol: 'cm³', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 80 },
  { code: 'MM3', sunatCode: 'MMQ', name: 'Milímetro cúbico', displayName: 'MILÍMETRO CÚBICO', symbol: 'mm³', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 81 },
  { code: 'PIE3', sunatCode: 'FTQ', name: 'Pie cúbico', displayName: 'PIE CÚBICO', symbol: 'ft³', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 82 },
  { code: 'US_GAL', sunatCode: 'GLL', name: 'Galón US', displayName: 'US GALLON (3,7843L)', symbol: 'GL', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 83 },
  { code: 'HLT', sunatCode: 'HLT', name: 'Hectolitro', displayName: 'HECTOLITRO', symbol: 'hL', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 84 },
  { code: 'IMP_GAL', sunatCode: 'GLI', name: 'Galón inglés', displayName: 'GALÓN INGLÉS (4,545956L)', symbol: 'GL', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 85 },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES DE PESO (sortOrder 90-99)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'MG', sunatCode: 'MGM', name: 'Miligramo', displayName: 'MILIGRAMO', symbol: 'mg', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 90 },
  { code: 'LB', sunatCode: 'LBR', name: 'Libra', displayName: 'LIBRA', symbol: 'lb', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 91 },
  { code: 'OZ', sunatCode: 'ONZ', name: 'Onza', displayName: 'ONZA', symbol: 'oz', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 92 },
  { code: 'TON', sunatCode: 'TNE', name: 'Tonelada', displayName: 'TONELADA', symbol: 't', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 93 },
  { code: 'STON', sunatCode: 'STN', name: 'Tonelada corta', displayName: 'TONELADA CORTA', symbol: 'ston', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 94 },
  { code: 'LTON', sunatCode: 'LTN', name: 'Tonelada larga', displayName: 'TONELADA LARGA', symbol: 'lton', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 95 },

  // ─────────────────────────────────────────────────────────────────────────
  // UNIDADES ESPECIALES/CANTIDADES (sortOrder 100-109)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'CIENTO', sunatCode: 'CEN', name: 'Ciento', displayName: 'CIENTO', symbol: 'CTO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 100 },
  { code: 'GRUESA', sunatCode: 'GRO', name: 'Gruesa', displayName: 'GRUESA (144)', symbol: 'GRUESA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 101 },
  { code: 'MILLAR', sunatCode: 'MLL', name: 'Millar', displayName: 'MILLAR', symbol: 'MILL', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 102 },
  { code: 'UM', sunatCode: 'UM', name: 'Millón unidades', displayName: 'MILLÓN DE UNIDADES', symbol: 'MM', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 103 },
  { code: 'BLISTER', sunatCode: 'U2', name: 'Tableta/Blister', displayName: 'TABLETA O BLISTER', symbol: 'BLIS', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 104 },
  { code: '4A', sunatCode: '4A', name: 'Bobina', displayName: 'BOBINA', symbol: 'BOBINA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 105 },

  // ─────────────────────────────────────────────────────────────────────────
  // ENERGÍA (sortOrder 110-115)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'KWH', sunatCode: 'KWH', name: 'Kilovatio hora', displayName: 'KILOVATIO HORA', symbol: 'kWh', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 110 },
  { code: 'MWH', sunatCode: 'MWH', name: 'Megavatio hora', displayName: 'MEGAVATIO HORA', symbol: 'MWh', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 111 },

  // ─────────────────────────────────────────────────────────────────────────
  // SERVICIOS (sortOrder 200+)
  // ─────────────────────────────────────────────────────────────────────────
  { code: 'SERVICE', sunatCode: 'ZZ', name: 'Servicio', displayName: 'UNIDAD (SERVICIOS)', symbol: 'SRV', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: true, sortOrder: 200 },
  { code: 'HOUR', sunatCode: 'HUR', name: 'Hora', displayName: 'HORA', symbol: 'h', kind: 'SERVICES', allowDecimals: true, precision: 2, isBase: true, sortOrder: 201 },
  { code: 'SEC', sunatCode: 'SEC', name: 'Segundo', displayName: 'SEGUNDO', symbol: 's', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 202 },
];

// ════════════════════════════════════════════════════════════════════════════
// TOP UNITS POR RUBRO (UX - Dropdown ordenado)
// ════════════════════════════════════════════════════════════════════════════

export const TOP_UNITS_BODEGA = ['NIU', 'KGM', 'LTR', 'MLT', 'DZN', 'BX', 'PK', 'C62', 'SA', 'BE', 'GRM', 'BO'];
export const TOP_UNITS_FERRETERIA = ['NIU', 'KGM', 'GRM', 'MTR', 'CMT', 'MMT', 'MTK', 'LTR', 'MLT', 'BX', 'PK', 'SA', 'BE', 'C62', 'RL', 'ST'];
export const TOP_UNITS_GENERAL = ['NIU', 'KGM', 'LTR', 'MTR', 'C62'];

// ════════════════════════════════════════════════════════════════════════════
// FUNCIONES
// ════════════════════════════════════════════════════════════════════════════

async function seedUnitsSunat() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('MÓDULO B-SUNAT-UNITS — Seed Unidades SUNAT Global');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let created = 0;
  let updated = 0;

  for (const unit of SUNAT_UNITS) {
    try {
      // Buscar por sunatCode (es la fuente de verdad)
      const existing = await prisma.unit.findFirst({
        where: {
          OR: [
            { sunatCode: unit.sunatCode },
            { code: unit.code },
          ],
        },
      });

      if (existing) {
        // Actualizar con datos SUNAT
        await prisma.unit.update({
          where: { id: existing.id },
          data: {
            code: unit.code,
            sunatCode: unit.sunatCode,
            name: unit.name,
            displayName: unit.displayName,
            symbol: unit.symbol,
            kind: unit.kind,
            allowDecimals: unit.allowDecimals,
            precision: unit.precision,
            isBase: unit.isBase,
            sortOrder: unit.sortOrder,
            active: true,
          },
        });
        updated++;
      } else {
        // Crear nueva
        await prisma.unit.create({
          data: {
            code: unit.code,
            sunatCode: unit.sunatCode,
            name: unit.name,
            displayName: unit.displayName,
            symbol: unit.symbol,
            kind: unit.kind,
            allowDecimals: unit.allowDecimals,
            precision: unit.precision,
            isBase: unit.isBase,
            sortOrder: unit.sortOrder,
            active: true,
          },
        });
        created++;
      }
    } catch (error) {
      console.error(`  ❌ Error con ${unit.sunatCode}:`, error);
    }
  }

  console.log(`  ✅ Creadas: ${created}`);
  console.log(`  📝 Actualizadas: ${updated}`);
  console.log(`  📦 Total unidades: ${SUNAT_UNITS.length}\n`);
}

async function backfillProductMaster() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Backfill ProductMaster.baseUnitId');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Obtener unidades de referencia
  const unitNIU = await prisma.unit.findFirst({ where: { sunatCode: 'NIU' } });
  const unitKGM = await prisma.unit.findFirst({ where: { sunatCode: 'KGM' } });

  if (!unitNIU || !unitKGM) {
    console.log('  ❌ Unidades NIU/KGM no encontradas. Ejecutar seed primero.');
    return;
  }

  // Productos con unitType UNIT sin baseUnitId
  const updatedUNIT = await prisma.productMaster.updateMany({
    where: {
      unitType: 'UNIT',
      baseUnitId: null,
    },
    data: {
      baseUnitId: unitNIU.id,
    },
  });
  console.log(`  ✅ ${updatedUNIT.count} productos UNIT → NIU`);

  // Productos con unitType KG sin baseUnitId
  const updatedKG = await prisma.productMaster.updateMany({
    where: {
      unitType: 'KG',
      baseUnitId: null,
    },
    data: {
      baseUnitId: unitKGM.id,
    },
  });
  console.log(`  ✅ ${updatedKG.count} productos KG → KGM\n`);
}

async function showStats() {
  const unitCount = await prisma.unit.count({ where: { active: true } });
  const goodsCount = await prisma.unit.count({ where: { active: true, kind: 'GOODS' } });
  const servicesCount = await prisma.unit.count({ where: { active: true, kind: 'SERVICES' } });
  const productsWithUnit = await prisma.productMaster.count({ where: { baseUnitId: { not: null } } });
  const productsWithoutUnit = await prisma.productMaster.count({ where: { baseUnitId: null } });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('RESUMEN FINAL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  📦 Unidades activas: ${unitCount}`);
  console.log(`     • Bienes (GOODS): ${goodsCount}`);
  console.log(`     • Servicios (SERVICES): ${servicesCount}`);
  console.log(`  📋 Productos con baseUnitId: ${productsWithUnit}`);
  console.log(`  ⚠️  Productos sin baseUnitId: ${productsWithoutUnit}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    await seedUnitsSunat();
    await backfillProductMaster();
    await showStats();
    console.log('✅ MÓDULO B-SUNAT-UNITS completado exitosamente.\n');
  } catch (error) {
    console.error('❌ Error en seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
