/**
 * MÓDULO B-SUNAT-UNITS — Datos de unidades SUNAT para seed
 * Catálogo básico de unidades de medida según SUNAT (UN/CEFACT)
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

// Unidades SUNAT esenciales para bodega/minimarket
export const SUNAT_UNITS_DATA: UnitSeedData[] = [
  // UNIDADES BÁSICAS (más usadas)
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

  // EMPAQUES Y CONTENEDORES
  { code: 'BOX', sunatCode: 'BX', name: 'Caja', displayName: 'CAJA', symbol: 'CAJA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 20 },
  { code: 'PACK', sunatCode: 'PK', name: 'Paquete', displayName: 'PAQUETE', symbol: 'PAQ', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 21 },
  { code: 'BAG', sunatCode: 'BG', name: 'Bolsa', displayName: 'BOLSA', symbol: 'BOLSA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 22 },
  { code: 'SACK', sunatCode: 'SA', name: 'Saco', displayName: 'SACO', symbol: 'SACO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 23 },
  { code: 'SET', sunatCode: 'SET', name: 'Juego', displayName: 'JUEGO', symbol: 'JUEGO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 26 },
  { code: 'DOZEN', sunatCode: 'DZN', name: 'Docena', displayName: 'DOCENA', symbol: 'DOC', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 27 },
  { code: 'PAR', sunatCode: 'PR', name: 'Par', displayName: 'PAR', symbol: 'PAR', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 28 },
  { code: 'CAN', sunatCode: 'CA', name: 'Lata', displayName: 'LATA', symbol: 'LATA', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 30 },
  { code: 'BTL', sunatCode: 'BO', name: 'Botella', displayName: 'BOTELLA', symbol: 'BOT', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 31 },
  { code: 'JAR', sunatCode: 'JR', name: 'Frasco', displayName: 'FRASCO', symbol: 'FRASCO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 40 },
  { code: 'TUBE', sunatCode: 'TU', name: 'Tubo', displayName: 'TUBO', symbol: 'TUBO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 41 },
  { code: 'ROLL', sunatCode: 'RL', name: 'Carrete', displayName: 'CARRETE', symbol: 'ROLLO', kind: 'GOODS', allowDecimals: false, precision: 0, isBase: false, sortOrder: 25 },

  // PESO
  { code: 'LB', sunatCode: 'LBR', name: 'Libra', displayName: 'LIBRA', symbol: 'lb', kind: 'GOODS', allowDecimals: true, precision: 3, isBase: false, sortOrder: 91 },
  { code: 'OZ', sunatCode: 'ONZ', name: 'Onza', displayName: 'ONZA', symbol: 'oz', kind: 'GOODS', allowDecimals: true, precision: 2, isBase: false, sortOrder: 92 },

  // SERVICIOS
  { code: 'SERVICE', sunatCode: 'ZZ', name: 'Servicio', displayName: 'UNIDAD (SERVICIOS)', symbol: 'SRV', kind: 'SERVICES', allowDecimals: false, precision: 0, isBase: true, sortOrder: 200 },
  { code: 'HOUR', sunatCode: 'HUR', name: 'Hora', displayName: 'HORA', symbol: 'h', kind: 'SERVICES', allowDecimals: true, precision: 2, isBase: true, sortOrder: 201 },
];
