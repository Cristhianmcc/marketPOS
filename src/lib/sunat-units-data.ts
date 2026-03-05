/**
 * MÓDULO B-SUNAT-UNITS — Catálogo completo de unidades SUNAT
 * Catálogo N° 03 - Tipo de Unidad de Medida (UN/CEFACT Rec 20)
 * ~100 unidades oficiales SUNAT para todos los rubros:
 * Bodega, Ferretería, Farmacia, Construcción, Textil, Industrial, etc.
 */

import { UnitKind } from '@prisma/client';

export interface UnitSeedData {
  code: string;
  sunatCode: string;
  name: string;
  displayName: string;
  symbol: string;
  kind: UnitKind;
  allowDecimals: boolean;
  precision: number;
  isBase: boolean;
  sortOrder: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGO COMPLETO SUNAT N° 03 — Unidades de Medida (UN/CEFACT Rec 20)
// ══════════════════════════════════════════════════════════════════════════════
export const SUNAT_UNITS_DATA: UnitSeedData[] = [

  // ── UNIDADES BÁSICAS (más usadas) ──────────────────────────────────────────
  { code: 'UNIT', sunatCode: 'NIU', name: 'Unidad', displayName: 'UNIDAD (BIENES)', symbol: 'UND', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: true, sortOrder: 1 },
  { code: 'KG', sunatCode: 'KGM', name: 'Kilogramo', displayName: 'KILOGRAMO', symbol: 'kg', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 2 },
  { code: 'L', sunatCode: 'LTR', name: 'Litro', displayName: 'LITRO', symbol: 'L', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 3 },
  { code: 'M', sunatCode: 'MTR', name: 'Metro', displayName: 'METRO', symbol: 'm', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: true, sortOrder: 4 },
  { code: 'M2', sunatCode: 'MTK', name: 'Metro cuadrado', displayName: 'METRO CUADRADO', symbol: 'm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: true, sortOrder: 5 },
  { code: 'M3', sunatCode: 'MTQ', name: 'Metro cúbico', displayName: 'METRO CÚBICO', symbol: 'm³', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: true, sortOrder: 6 },
  { code: 'PC', sunatCode: 'C62', name: 'Pieza', displayName: 'PIEZA', symbol: 'PZA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: true, sortOrder: 7 },

  // ── PESO ───────────────────────────────────────────────────────────────────
  { code: 'G', sunatCode: 'GRM', name: 'Gramo', displayName: 'GRAMO', symbol: 'g', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 10 },
  { code: 'MG', sunatCode: 'MGM', name: 'Miligramo', displayName: 'MILIGRAMO', symbol: 'mg', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 11 },
  { code: 'TNE', sunatCode: 'TNE', name: 'Tonelada', displayName: 'TONELADA', symbol: 't', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 12 },
  { code: 'LB', sunatCode: 'LBR', name: 'Libra', displayName: 'LIBRA', symbol: 'lb', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 13 },
  { code: 'OZ', sunatCode: 'ONZ', name: 'Onza', displayName: 'ONZA', symbol: 'oz', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 14 },
  { code: 'QTL', sunatCode: 'DTN', name: 'Quintal métrico', displayName: 'QUINTAL MÉTRICO', symbol: 'q', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 15 },

  // ── LONGITUD ───────────────────────────────────────────────────────────────
  { code: 'CM', sunatCode: 'CMT', name: 'Centímetro', displayName: 'CENTÍMETRO', symbol: 'cm', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 20 },
  { code: 'MM', sunatCode: 'MMT', name: 'Milímetro', displayName: 'MILÍMETRO', symbol: 'mm', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 21 },
  { code: 'DM', sunatCode: 'DMT', name: 'Decímetro', displayName: 'DECÍMETRO', symbol: 'dm', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 22 },
  { code: 'KM', sunatCode: 'KMT', name: 'Kilómetro', displayName: 'KILÓMETRO', symbol: 'km', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 23 },
  { code: 'IN', sunatCode: 'INH', name: 'Pulgada', displayName: 'PULGADA', symbol: 'in', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 24 },
  { code: 'FT', sunatCode: 'FOT', name: 'Pie', displayName: 'PIE', symbol: 'ft', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 25 },
  { code: 'YD', sunatCode: 'YRD', name: 'Yarda', displayName: 'YARDA', symbol: 'yd', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 26 },

  // ── VOLUMEN LÍQUIDO ────────────────────────────────────────────────────────
  { code: 'ML', sunatCode: 'MLT', name: 'Mililitro', displayName: 'MILILITRO', symbol: 'mL', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 30 },
  { code: 'CL', sunatCode: 'CLT', name: 'Centilitro', displayName: 'CENTILITRO', symbol: 'cL', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 31 },
  { code: 'DL', sunatCode: 'DLT', name: 'Decilitro', displayName: 'DECILITRO', symbol: 'dL', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 32 },
  { code: 'HL', sunatCode: 'HLT', name: 'Hectolitro', displayName: 'HECTOLITRO', symbol: 'hL', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 33 },
  { code: 'GAL_US', sunatCode: 'GLL', name: 'Galón americano', displayName: 'GALÓN (US)', symbol: 'gal', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 34 },
  { code: 'GAL_UK', sunatCode: 'GLI', name: 'Galón imperial', displayName: 'GALÓN (UK)', symbol: 'gal', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 35 },
  { code: 'QT', sunatCode: 'QT', name: 'Cuarto de galón', displayName: 'CUARTO DE GALÓN', symbol: 'qt', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 36 },
  { code: 'PT', sunatCode: 'PT', name: 'Pinta', displayName: 'PINTA', symbol: 'pt', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 37 },
  { code: 'OZA', sunatCode: 'OZA', name: 'Onza líquida', displayName: 'ONZA LÍQUIDA', symbol: 'fl oz', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 38 },
  { code: 'BLL', sunatCode: 'BLL', name: 'Barril', displayName: 'BARRIL', symbol: 'bbl', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 39 },

  // ── SUPERFICIE ─────────────────────────────────────────────────────────────
  { code: 'CM2', sunatCode: 'CMK', name: 'Centímetro cuadrado', displayName: 'CENTÍMETRO CUADRADO', symbol: 'cm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 40 },
  { code: 'DM2', sunatCode: 'DMK', name: 'Decímetro cuadrado', displayName: 'DECÍMETRO CUADRADO', symbol: 'dm²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 41 },
  { code: 'KM2', sunatCode: 'KMK', name: 'Kilómetro cuadrado', displayName: 'KILÓMETRO CUADRADO', symbol: 'km²', kind: 'GOODS', allowDecimals: true, precision: 4, isBase: false, sortOrder: 42 },
  { code: 'IN2', sunatCode: 'INK', name: 'Pulgada cuadrada', displayName: 'PULGADA CUADRADA', symbol: 'in²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 43 },
  { code: 'FT2', sunatCode: 'FTK', name: 'Pie cuadrado', displayName: 'PIE CUADRADO', symbol: 'ft²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 44 },
  { code: 'YD2', sunatCode: 'YDK', name: 'Yarda cuadrada', displayName: 'YARDA CUADRADA', symbol: 'yd²', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 45 },
  { code: 'ACR', sunatCode: 'ACR', name: 'Acre', displayName: 'ACRE', symbol: 'ac', kind: 'GOODS', allowDecimals: true, precision: 4, isBase: false, sortOrder: 46 },
  { code: 'HA', sunatCode: 'HAR', name: 'Hectárea', displayName: 'HECTÁREA', symbol: 'ha', kind: 'GOODS', allowDecimals: true, precision: 4, isBase: false, sortOrder: 47 },

  // ── VOLUMEN SÓLIDO ─────────────────────────────────────────────────────────
  { code: 'CM3', sunatCode: 'CMQ', name: 'Centímetro cúbico', displayName: 'CENTÍMETRO CÚBICO', symbol: 'cm³', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 50 },
  { code: 'DM3', sunatCode: 'DMQ', name: 'Decímetro cúbico', displayName: 'DECÍMETRO CÚBICO', symbol: 'dm³', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 51 },
  { code: 'IN3', sunatCode: 'INQ', name: 'Pulgada cúbica', displayName: 'PULGADA CÚBICA', symbol: 'in³', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 52 },
  { code: 'FT3', sunatCode: 'FTQ', name: 'Pie cúbico', displayName: 'PIE CÚBICO', symbol: 'ft³', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 53 },

  // ── EMPAQUES Y CONTENEDORES ────────────────────────────────────────────────
  { code: 'BOX', sunatCode: 'BX', name: 'Caja', displayName: 'CAJA', symbol: 'CAJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 60 },
  { code: 'PACK', sunatCode: 'PK', name: 'Paquete', displayName: 'PAQUETE', symbol: 'PAQ', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 61 },
  { code: 'BAG', sunatCode: 'BG', name: 'Bolsa', displayName: 'BOLSA', symbol: 'BOLSA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 62 },
  { code: 'SACK', sunatCode: 'SA', name: 'Saco', displayName: 'SACO', symbol: 'SACO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 63 },
  { code: 'CAN', sunatCode: 'CA', name: 'Lata', displayName: 'LATA', symbol: 'LATA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 64 },
  { code: 'BTL', sunatCode: 'BO', name: 'Botella', displayName: 'BOTELLA', symbol: 'BOT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 65 },
  { code: 'JAR', sunatCode: 'JR', name: 'Frasco', displayName: 'FRASCO', symbol: 'FRASCO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 66 },
  { code: 'TUBE', sunatCode: 'TU', name: 'Tubo', displayName: 'TUBO', symbol: 'TUBO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 67 },
  { code: 'ROLL', sunatCode: 'RL', name: 'Rollo/Carrete', displayName: 'ROLLO', symbol: 'ROLLO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 68 },
  { code: 'BALE', sunatCode: 'BE', name: 'Fardo', displayName: 'FARDO', symbol: 'FARDO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 69 },
  { code: 'CARTON', sunatCode: 'CT', name: 'Cartón', displayName: 'CARTÓN', symbol: 'CARTÓN', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 70 },
  { code: 'DRUM', sunatCode: 'DR', name: 'Tambor/Bidón', displayName: 'TAMBOR', symbol: 'TAMBOR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 71 },
  { code: 'CYL', sunatCode: 'CY', name: 'Cilindro', displayName: 'CILINDRO', symbol: 'CIL', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 72 },
  { code: 'BUCKET', sunatCode: 'BJ', name: 'Balde', displayName: 'BALDE', symbol: 'BALDE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 73 },
  { code: 'CASE', sunatCode: 'CS', name: 'Estuche', displayName: 'ESTUCHE', symbol: 'ESTUCHE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 74 },
  { code: 'ENVELOPE', sunatCode: 'EN', name: 'Sobre', displayName: 'SOBRE', symbol: 'SOBRE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 75 },
  { code: 'PALLET', sunatCode: 'PX', name: 'Paleta', displayName: 'PALETA (PALLET)', symbol: 'PALLET', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 76 },
  { code: 'CONTAINER', sunatCode: 'CR', name: 'Contenedor', displayName: 'CONTENEDOR', symbol: 'CONT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 77 },
  { code: 'SHEET', sunatCode: 'ST', name: 'Hoja/Pliego', displayName: 'HOJA/PLIEGO', symbol: 'HOJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 78 },
  { code: 'PLATE', sunatCode: 'PG', name: 'Placa', displayName: 'PLACA', symbol: 'PLACA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 79 },
  { code: 'TABLET', sunatCode: 'U2', name: 'Tableta', displayName: 'TABLETA', symbol: 'TAB', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 80 },
  { code: 'BUNDLE', sunatCode: 'BH', name: 'Atado/Manojo', displayName: 'ATADO/MANOJO', symbol: 'ATADO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 81 },
  { code: 'BOTTLE_CRATE', sunatCode: 'BC', name: 'Caja de botellas', displayName: 'CAJA DE BOTELLAS', symbol: 'C/BOT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 82 },
  { code: 'GARRAFA', sunatCode: 'DJ', name: 'Damajuana/Garrafa', displayName: 'DAMAJUANA', symbol: 'DMJ', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 83 },

  // ── CONTEO / AGRUPACIONES ──────────────────────────────────────────────────
  { code: 'SET', sunatCode: 'SET', name: 'Juego', displayName: 'JUEGO', symbol: 'JUEGO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 90 },
  { code: 'DOZEN', sunatCode: 'DZN', name: 'Docena', displayName: 'DOCENA', symbol: 'DOC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 91 },
  { code: 'PAR', sunatCode: 'PR', name: 'Par', displayName: 'PAR', symbol: 'PAR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 92 },
  { code: 'GROSS', sunatCode: 'GRO', name: 'Gruesa (144)', displayName: 'GRUESA (144 UND)', symbol: 'GRUESA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 93 },
  { code: 'HUNDRED', sunatCode: 'CEN', name: 'Ciento', displayName: 'CIENTO (100 UND)', symbol: 'CIENTO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 94 },
  { code: 'THOUSAND', sunatCode: 'MIL', name: 'Millar', displayName: 'MILLAR (1000 UND)', symbol: 'MILLAR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 95 },
  { code: 'DPC', sunatCode: 'DPC', name: 'Docena de piezas', displayName: 'DOCENA DE PIEZAS', symbol: 'DPC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 96 },
  { code: 'DZP', sunatCode: 'DZP', name: 'Docena de paquetes', displayName: 'DOCENA DE PAQUETES', symbol: 'DZP', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 97 },

  // ── ENERGÍA ────────────────────────────────────────────────────────────────
  { code: 'KWH', sunatCode: 'KWH', name: 'Kilovatio hora', displayName: 'KILOVATIO HORA', symbol: 'kWh', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 100 },
  { code: 'MWH', sunatCode: 'MWH', name: 'Megavatio hora', displayName: 'MEGAVATIO HORA', symbol: 'MWh', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 101 },
  { code: 'KWT', sunatCode: 'KWT', name: 'Kilovatio', displayName: 'KILOVATIO', symbol: 'kW', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 102 },

  // ── TEMPERATURA ────────────────────────────────────────────────────────────
  { code: 'CEL', sunatCode: 'CEL', name: 'Grado Celsius', displayName: 'GRADO CELSIUS', symbol: '°C', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 110 },
  { code: 'FAH', sunatCode: 'FAH', name: 'Grado Fahrenheit', displayName: 'GRADO FAHRENHEIT', symbol: '°F', kind: 'GOODS', allowDecimals: true, precision: 1, isBase: false, sortOrder: 111 },

  // ── FARMACIA / SALUD ───────────────────────────────────────────────────────
  { code: 'AMPOLLA', sunatCode: 'AM', name: 'Ampolla', displayName: 'AMPOLLA', symbol: 'AMP', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 120 },
  { code: 'BLISTER', sunatCode: 'BP', name: 'Blíster', displayName: 'BLÍSTER', symbol: 'BLÍSTER', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 121 },
  { code: 'CAPSULA', sunatCode: 'CA2', name: 'Cápsula', displayName: 'CÁPSULA', symbol: 'CÁP', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 122 },
  { code: 'GOTA', sunatCode: 'GO', name: 'Gota', displayName: 'GOTA', symbol: 'GOTA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 123 },
  { code: 'DOSIS', sunatCode: 'E4', name: 'Dosis', displayName: 'DOSIS', symbol: 'DOSIS', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 124 },
  { code: 'COMPRIMIDO', sunatCode: 'KD', name: 'Comprimido', displayName: 'COMPRIMIDO', symbol: 'COMP', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 125 },
  { code: 'SUPOSITORIO', sunatCode: 'SU', name: 'Supositorio', displayName: 'SUPOSITORIO', symbol: 'SUP', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 126 },
  { code: 'JERINGA', sunatCode: 'SY', name: 'Jeringa', displayName: 'JERINGA', symbol: 'JER', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 127 },

  // ── MADERA / CONSTRUCCIÓN ──────────────────────────────────────────────────
  { code: 'FBM', sunatCode: 'FBM', name: 'Pie tablar', displayName: 'PIE TABLAR', symbol: 'PT', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 130 },
  { code: 'PLANCHA', sunatCode: 'OA', name: 'Plancha', displayName: 'PLANCHA', symbol: 'PLANCHA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 131 },
  { code: 'VARILLA', sunatCode: 'BR', name: 'Varilla/Barra', displayName: 'VARILLA/BARRA', symbol: 'VAR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 132 },
  { code: 'BLOCK', sunatCode: 'D64', name: 'Bloque', displayName: 'BLOQUE', symbol: 'BLOQUE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 133 },
  { code: 'VIGA', sunatCode: 'VI', name: 'Viga', displayName: 'VIGA', symbol: 'VIGA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 134 },

  // ── TEXTIL / PAPELERÍA ─────────────────────────────────────────────────────
  { code: 'BOBINA', sunatCode: '4A', name: 'Bobina', displayName: 'BOBINA', symbol: 'BOBINA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 140 },
  { code: 'RESMA', sunatCode: 'RM', name: 'Resma', displayName: 'RESMA', symbol: 'RESMA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 141 },
  { code: 'MADEJA', sunatCode: 'HP', name: 'Madeja', displayName: 'MADEJA', symbol: 'MADEJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 142 },
  { code: 'PIEZA_TEXTIL', sunatCode: 'TH', name: 'Pieza textil', displayName: 'PIEZA TEXTIL', symbol: 'PIEZA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 143 },

  // ── FERRETERÍA / INDUSTRIAL ────────────────────────────────────────────────
  { code: 'TROZO', sunatCode: 'NPR', name: 'Trozo/Pedazo', displayName: 'TROZO/PEDAZO', symbol: 'TROZO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 150 },
  { code: 'TIRA', sunatCode: 'SR', name: 'Tira', displayName: 'TIRA', symbol: 'TIRA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 151 },
  { code: 'BOLSA_GDE', sunatCode: 'BG2', name: 'Bolsa grande', displayName: 'BOLSA GRANDE', symbol: 'BOLSA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 152 },
  { code: 'LOTE', sunatCode: 'LO', name: 'Lote', displayName: 'LOTE', symbol: 'LOTE', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 153 },
  { code: 'PULGADA2', sunatCode: 'G2', name: 'Galón US líquido', displayName: 'GALÓN US LÍQUIDO', symbol: 'gal liq', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 154 },

  // ── CONCENTRACIÓN / DENSIDAD ───────────────────────────────────────────────
  { code: 'KG_M3', sunatCode: 'KMQ', name: 'Kilogramo por metro cúbico', displayName: 'KG POR METRO CÚBICO', symbol: 'kg/m³', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 160 },
  { code: 'G_L', sunatCode: 'GL', name: 'Gramo por litro', displayName: 'GRAMO POR LITRO', symbol: 'g/L', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 161 },

  // ── VELOCIDAD / PRESIÓN / FUERZA ───────────────────────────────────────────
  { code: 'KMH', sunatCode: 'KMH', name: 'Kilómetro por hora', displayName: 'KILÓMETRO POR HORA', symbol: 'km/h', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 170 },
  { code: 'MPS', sunatCode: 'MTS', name: 'Metro por segundo', displayName: 'METRO POR SEGUNDO', symbol: 'm/s', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 171 },
  { code: 'BAR', sunatCode: 'BAR', name: 'Bar', displayName: 'BAR (PRESIÓN)', symbol: 'bar', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 172 },
  { code: 'PSI', sunatCode: 'PS', name: 'Libra por pulgada cuadrada', displayName: 'PSI', symbol: 'psi', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 173 },
  { code: 'NEWTON', sunatCode: 'NEW', name: 'Newton', displayName: 'NEWTON', symbol: 'N', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 174 },

  // ── ELECTRICIDAD ───────────────────────────────────────────────────────────
  { code: 'AMP', sunatCode: 'AMP', name: 'Amperio', displayName: 'AMPERIO', symbol: 'A', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 180 },
  { code: 'VOLT', sunatCode: 'VLT', name: 'Voltio', displayName: 'VOLTIO', symbol: 'V', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 181 },
  { code: 'WATT', sunatCode: 'WTT', name: 'Vatio', displayName: 'VATIO', symbol: 'W', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 182 },
  { code: 'OHM', sunatCode: 'OHM', name: 'Ohmio', displayName: 'OHMIO', symbol: 'Ω', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 183 },
  { code: 'HERTZ', sunatCode: 'HTZ', name: 'Hercio', displayName: 'HERCIO', symbol: 'Hz', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 184 },

  // ── PORCENTAJE / OTROS ─────────────────────────────────────────────────────
  { code: 'PERCENT', sunatCode: 'P1', name: 'Porcentaje', displayName: 'PORCENTAJE', symbol: '%', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 190 },
  { code: 'EACH', sunatCode: 'EA', name: 'Cada uno', displayName: 'CADA UNO', symbol: 'c/u', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 191 },
  { code: 'UNSPEC', sunatCode: 'XUN', name: 'Unidad no especificada', displayName: 'UNIDAD NO ESPECIFICADA', symbol: 'UNE', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 192 },

  // ── SERVICIOS Y TIEMPO ─────────────────────────────────────────────────────
  { code: 'SERVICE', sunatCode: 'ZZ', name: 'Servicio', displayName: 'UNIDAD (SERVICIOS)', symbol: 'SRV', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: true, sortOrder: 200 },
  { code: 'HOUR', sunatCode: 'HUR', name: 'Hora', displayName: 'HORA', symbol: 'h', kind: 'SERVICES', allowDecimals: true, precision: 2, isBase: true, sortOrder: 201 },
  { code: 'MINUTE', sunatCode: 'MIN', name: 'Minuto', displayName: 'MINUTO', symbol: 'min', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 202 },
  { code: 'SECOND', sunatCode: 'SEC', name: 'Segundo', displayName: 'SEGUNDO', symbol: 's', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 203 },
  { code: 'DAY', sunatCode: 'DAY', name: 'Día', displayName: 'DÍA', symbol: 'día', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 204 },
  { code: 'WEEK', sunatCode: 'WEE', name: 'Semana', displayName: 'SEMANA', symbol: 'sem', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 205 },
  { code: 'MONTH', sunatCode: 'MON', name: 'Mes', displayName: 'MES', symbol: 'mes', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 206 },
  { code: 'YEAR', sunatCode: 'ANN', name: 'Año', displayName: 'AÑO', symbol: 'año', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: false, sortOrder: 207 },
];
