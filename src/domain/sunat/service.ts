// src/domain/sunat/service.ts
// ✅ MÓDULO 18.1: Servicio para crear documentos electrónicos SUNAT

import { PrismaClient, Prisma } from '@prisma/client';
import {
  CreateElectronicDocumentInput,
  ElectronicDocumentDraft,
} from './types';
import {
  getNextSunatNumber,
  getDefaultSeries,
  generateFullNumber,
} from './correlatives';

/**
 * Crea un documento electrónico en estado DRAFT
 * 
 * Este servicio NO genera XML, NO firma, NO envía a SUNAT.
 * Solo crea el registro en base de datos con correlativo asignado.
 * 
 * @param prisma - Cliente de Prisma
 * @param input - Datos del documento a crear
 * @returns Documento electrónico creado en estado DRAFT
 * @throws Error si no existe SunatSettings o si los datos son inválidos
 */
export async function createElectronicDocumentDraft(
  prisma: PrismaClient,
  input: CreateElectronicDocumentInput
): Promise<ElectronicDocumentDraft> {
  // Validar que existe configuración SUNAT para la tienda
  const sunatSettings = await prisma.sunatSettings.findUnique({
    where: { storeId: input.storeId },
  });

  if (!sunatSettings) {
    throw new Error(
      `No existe configuración SUNAT para la tienda ${input.storeId}. ` +
      `Por favor, configure SUNAT antes de crear documentos electrónicos.`
    );
  }

  // Usar transacción para asegurar atomicidad del correlativo
  const document = await prisma.$transaction(async (tx) => {
    // Obtener serie por defecto
    const series = await getDefaultSeries(tx, input.storeId, input.docType);

    // Obtener siguiente número de forma atómica
    const number = await getNextSunatNumber(tx, input.storeId, input.docType);

    // Generar número completo
    const fullNumber = generateFullNumber(series, number);

    // Crear documento electrónico
    const doc = await tx.electronicDocument.create({
      data: {
        storeId: input.storeId,
        saleId: input.saleId,
        docType: input.docType,
        series,
        number,
        fullNumber,
        issueDate: input.issueDate || new Date(),
        currency: 'PEN',
        
        // Cliente (snapshot)
        customerDocType: input.customer.docType,
        customerDocNumber: input.customer.docNumber,
        customerName: input.customer.name,
        customerAddress: input.customer.address,
        
        // Totales (snapshot)
        taxable: new Prisma.Decimal(input.totals.taxable),
        igv: new Prisma.Decimal(input.totals.igv),
        total: new Prisma.Decimal(input.totals.total),
        
        // Estado inicial
        status: 'DRAFT',
      },
    });

    return doc;
  });

  // Convertir a tipo de salida
  return {
    id: document.id,
    storeId: document.storeId,
    saleId: document.saleId || undefined,
    docType: document.docType,
    series: document.series,
    number: document.number,
    fullNumber: document.fullNumber,
    issueDate: document.issueDate,
    currency: document.currency,
    customerDocType: document.customerDocType,
    customerDocNumber: document.customerDocNumber,
    customerName: document.customerName,
    customerAddress: document.customerAddress || undefined,
    taxable: document.taxable.toNumber(),
    igv: document.igv.toNumber(),
    total: document.total.toNumber(),
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/**
 * Verifica si SUNAT está habilitado para una tienda
 * 
 * @param prisma - Cliente de Prisma
 * @param storeId - ID de la tienda
 * @returns true si SUNAT está habilitado, false en caso contrario
 */
export async function isSunatEnabled(
  prisma: PrismaClient,
  storeId: string
): Promise<boolean> {
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
    select: { enabled: true },
  });

  return settings?.enabled ?? false;
}

/**
 * Inicializa la configuración SUNAT para una tienda
 * (Solo si no existe)
 * 
 * @param prisma - Cliente de Prisma
 * @param storeId - ID de la tienda
 * @param env - Entorno SUNAT (BETA o PROD)
 * @returns Configuración SUNAT creada o existente
 */
export async function initializeSunatSettings(
  prisma: PrismaClient,
  storeId: string,
  env: 'BETA' | 'PROD' = 'BETA'
) {
  return await prisma.sunatSettings.upsert({
    where: { storeId },
    update: {}, // No actualizar si ya existe
    create: {
      storeId,
      env,
      enabled: false,
      defaultFacturaSeries: 'F001',
      defaultBoletaSeries: 'B001',
      defaultNcSeries: 'FC01',
      defaultNdSeries: 'FD01',
      nextFacturaNumber: 1,
      nextBoletaNumber: 1,
      nextNcNumber: 1,
      nextNdNumber: 1,
    },
  });
}
