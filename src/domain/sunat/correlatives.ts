// src/domain/sunat/correlatives.ts
// ✅ MÓDULO 18.1: Helpers para correlativos fiscales SUNAT (atómicos)

import { PrismaClient, SunatDocType } from '@prisma/client';

/**
 * Obtiene el siguiente correlativo SUNAT de forma ATÓMICA
 * para evitar colisiones en entornos concurrentes.
 * 
 * @param prisma - Cliente de Prisma (puede ser parte de una transacción)
 * @param storeId - ID de la tienda
 * @param docType - Tipo de documento SUNAT
 * @returns El número correlativo asignado
 * @throws Error si no existe SunatSettings para la tienda
 */
export async function getNextSunatNumber(
  prisma: PrismaClient | any, // PrismaClient o Transaction
  storeId: string,
  docType: SunatDocType
): Promise<number> {
  // Mapear el tipo de documento al campo de correlativo
  let field: string;
  
  switch (docType) {
    case 'FACTURA':
      field = 'nextFacturaNumber';
      break;
    case 'BOLETA':
      field = 'nextBoletaNumber';
      break;
    case 'NOTA_CREDITO':
      field = 'nextNcNumber';
      break;
    case 'NOTA_DEBITO':
      field = 'nextNdNumber';
      break;
    default:
      throw new Error(`Tipo de documento no soportado para correlativos: ${docType}`);
  }

  // Actualizar de forma atómica e incrementar
  const updated = await prisma.sunatSettings.update({
    where: { storeId },
    data: {
      [field]: { increment: 1 }
    },
    select: {
      [field]: true
    }
  });

  // Devolver el número asignado (el valor anterior al incremento)
  const newNumber = updated[field as keyof typeof updated] as number;
  return newNumber - 1;
}

/**
 * Obtiene la serie por defecto para un tipo de documento
 * 
 * @param prisma - Cliente de Prisma
 * @param storeId - ID de la tienda
 * @param docType - Tipo de documento SUNAT
 * @returns La serie por defecto (ej: "F001", "B001")
 * @throws Error si no existe SunatSettings para la tienda
 */
export async function getDefaultSeries(
  prisma: PrismaClient | any,
  storeId: string,
  docType: SunatDocType
): Promise<string> {
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
    select: {
      defaultFacturaSeries: true,
      defaultBoletaSeries: true,
      defaultNcSeries: true,
      defaultNdSeries: true,
    }
  });

  if (!settings) {
    throw new Error(`No se encontró configuración SUNAT para la tienda ${storeId}`);
  }

  switch (docType) {
    case 'FACTURA':
      return settings.defaultFacturaSeries;
    case 'BOLETA':
      return settings.defaultBoletaSeries;
    case 'NOTA_CREDITO':
      return settings.defaultNcSeries;
    case 'NOTA_DEBITO':
      return settings.defaultNdSeries;
    default:
      throw new Error(`Tipo de documento no soportado para serie: ${docType}`);
  }
}

/**
 * Formatea el número de documento SUNAT con padding de 8 dígitos
 * 
 * @param number - Número correlativo
 * @returns Número formateado (ej: "00000001")
 */
export function formatSunatNumber(number: number): string {
  return number.toString().padStart(8, '0');
}

/**
 * Genera el número completo del documento (serie-número)
 * 
 * @param series - Serie del documento (ej: "F001")
 * @param number - Número correlativo
 * @returns Número completo (ej: "F001-00000001")
 */
export function generateFullNumber(series: string, number: number): string {
  return `${series}-${formatSunatNumber(number)}`;
}
