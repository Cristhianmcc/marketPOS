// src/lib/sunat/buildPayloadFromSale.ts
// ✅ MÓDULO 18.2: Construcción de payload fiscal desde Sale
// NO recalcula totales, NO modifica checkout, solo lee y normaliza datos

import { PrismaClient, SunatDocType } from '@prisma/client';
import {
  SunatDocumentPayload,
  SunatIssuer,
  SunatCustomer,
  SunatLineItem,
  SunatTotals,
  SunatError,
  SunatErrorCodes,
} from './types';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface BuildPayloadInput {
  saleId: string;
  docType: SunatDocType;
  /** Si se pasa, se usa este customer. Si no, se intenta obtener de Sale */
  customer?: {
    docType: string;
    docNumber: string;
    name: string;
    address?: string;
  };
}

/**
 * Construye el payload fiscal a partir de una venta existente
 * 
 * Validaciones:
 * - Feature flag ENABLE_SUNAT debe estar activo
 * - Store no debe estar ARCHIVED
 * - SunatSettings debe existir y estar completo
 * - FACTURA requiere customer con RUC válido
 * - Sale debe existir con sus ítems
 * 
 * @throws SunatError con códigos específicos
 */
export async function buildPayloadFromSale(
  prisma: PrismaClient,
  input: BuildPayloadInput
): Promise<SunatDocumentPayload> {
  const { saleId, docType, customer: inputCustomer } = input;

  // 1. Leer Sale con relaciones necesarias
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      customer: {
        select: {
          name: true,
          dni: true,
          phone: true,
        },
      },
      items: {
        include: {
          storeProduct: {
            include: {
              product: {
                select: {
                  name: true,
                  content: true,
                  internalSku: true,
                  barcode: true,
                },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!sale) {
    throw new SunatError(
      SunatErrorCodes.SALE_NOT_FOUND,
      `Venta ${saleId} no encontrada`,
      404
    );
  }

  // 2. Validar que la tienda no esté archivada
  if (sale.store.status === 'ARCHIVED') {
    throw new SunatError(
      SunatErrorCodes.STORE_ARCHIVED,
      'La tienda está archivada',
      403
    );
  }

  const storeId = sale.store.id;

  // 3. Verificar feature flag ENABLE_SUNAT
  const sunatEnabled = await isFeatureEnabled(storeId, 'ENABLE_SUNAT');
  if (!sunatEnabled) {
    throw new SunatError(
      SunatErrorCodes.FEATURE_DISABLED,
      'La funcionalidad SUNAT está deshabilitada para esta tienda',
      403
    );
  }

  // 4. Leer SunatSettings
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
  });

  if (!settings) {
    throw new SunatError(
      SunatErrorCodes.SUNAT_SETTINGS_REQUIRED,
      'Configuración SUNAT no encontrada. Inicializa primero con /api/sunat/initialize',
      409
    );
  }

  if (!settings.enabled) {
    throw new SunatError(
      SunatErrorCodes.SUNAT_NOT_ENABLED,
      'SUNAT está deshabilitado en la configuración. Habilítalo en sunat_settings.enabled',
      409
    );
  }

  // 5. Validar que settings esté completo (RUC, credenciales mínimas)
  if (!settings.ruc || !settings.razonSocial) {
    throw new SunatError(
      SunatErrorCodes.SUNAT_SETTINGS_INCOMPLETE,
      'Configuración SUNAT incompleta. Falta RUC o razón social',
      409
    );
  }

  // Para ambiente PROD, requerir credenciales SOL
  if (settings.env === 'PROD' && (!settings.solUser || !settings.solPass)) {
    throw new SunatError(
      SunatErrorCodes.SUNAT_SETTINGS_INCOMPLETE,
      'Configuración SUNAT incompleta para ambiente PROD. Faltan credenciales SOL',
      409
    );
  }

  // 6. Construir issuer desde SunatSettings
  const issuer: SunatIssuer = {
    ruc: settings.ruc,
    razonSocial: settings.razonSocial,
    address: settings.address,
    ubigeo: settings.ubigeo,
    env: settings.env,
  };

  // 7. Construir customer
  let customer: SunatCustomer;

  if (inputCustomer) {
    // Customer proporcionado explícitamente
    customer = {
      docType: inputCustomer.docType as any,
      docNumber: inputCustomer.docNumber,
      name: inputCustomer.name,
      address: inputCustomer.address,
    };
  } else if (sale.customer) {
    // Obtener de la relación Customer en Sale
    // Customer solo tiene dni (no docType/docNumber separados)
    customer = {
      docType: 'DNI' as any,
      docNumber: sale.customer.dni || '00000000',
      name: sale.customer.name,
      address: null,
    };
  } else {
    // Cliente anónimo (BOLETA sin datos)
    customer = {
      docType: 'DNI',
      docNumber: '00000000',
      name: 'CLIENTE VARIOS',
      address: null,
    };
  }

  // 8. Validar customer según docType
  if (docType === 'FACTURA') {
    // FACTURA requiere RUC
    if (customer.docType !== 'RUC') {
      throw new SunatError(
        SunatErrorCodes.INVALID_CUSTOMER_RUC,
        'Las facturas requieren un cliente con RUC',
        400
      );
    }

    // Validar formato de RUC (11 dígitos)
    if (!/^\d{11}$/.test(customer.docNumber)) {
      throw new SunatError(
        SunatErrorCodes.INVALID_CUSTOMER_RUC,
        'El RUC debe tener 11 dígitos',
        400
      );
    }

    // FACTURA debe tener razón social y dirección
    if (!customer.name || customer.name.trim() === '') {
      throw new SunatError(
        SunatErrorCodes.INVALID_CUSTOMER_DATA,
        'La factura requiere razón social del cliente',
        400
      );
    }
  } else if (docType === 'BOLETA') {
    // BOLETA permite DNI, RUC o sin documento
    // Validar formato si es DNI
    if (customer.docType === 'DNI' && customer.docNumber !== '00000000') {
      if (!/^\d{8}$/.test(customer.docNumber)) {
        throw new SunatError(
          SunatErrorCodes.INVALID_CUSTOMER_DATA,
          'El DNI debe tener 8 dígitos',
          400
        );
      }
    }
  }

  // 9. Construir items desde SaleItem snapshot
  const items: SunatLineItem[] = sale.items.map((item, index) => {
    // Descripción: nombre del producto + contenido (si existe)
    let description = item.productName;
    if (item.productContent) {
      description += ` ${item.productContent}`;
    }

    return {
      lineNumber: index + 1,
      description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      lineSubtotal: Number(item.subtotal),
      discountsApplied: Number(item.discountAmount || 0),
      internalSku: item.storeProduct?.product?.internalSku,
      barcode: item.storeProduct?.product?.barcode,
    };
  });

  if (items.length === 0) {
    throw new SunatError(
      SunatErrorCodes.SALE_NOT_FOUND,
      'La venta no tiene ítems',
      400
    );
  }

  // 10. Construir totals desde Sale (NO recalcular)
  const totals: SunatTotals = {
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax || 0), // Si tax es null, usar 0
    total: Number(sale.total),
    currency: 'PEN',
  };

  // 11. Determinar series y número (NO asignar correlativo aquí)
  // Esto es responsabilidad del servicio que crea el ElectronicDocument
  let series: string;
  let number: number;
  let fullNumber: string;

  // Valores temporales (se sobrescriben al crear ElectronicDocument)
  switch (docType) {
    case 'FACTURA':
      series = settings.defaultFacturaSeries;
      number = settings.nextFacturaNumber;
      break;
    case 'BOLETA':
      series = settings.defaultBoletaSeries;
      number = settings.nextBoletaNumber;
      break;
    case 'NOTA_CREDITO':
      series = settings.defaultNcSeries;
      number = settings.nextNcNumber;
      break;
    case 'NOTA_DEBITO':
      series = settings.defaultNdSeries;
      number = settings.nextNdNumber;
      break;
    default:
      series = 'XXX';
      number = 0;
  }

  fullNumber = `${series}-${number.toString().padStart(8, '0')}`;

  // 12. Construir payload completo
  const payload: SunatDocumentPayload = {
    issuer,
    customer,
    items,
    totals,
    metadata: {
      docType,
      series,
      number,
      fullNumber,
      issueDate: sale.createdAt, // Fecha de la venta
      saleId: sale.id,
    },
  };

  return payload;
}
