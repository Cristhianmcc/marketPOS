/**
 * MÓDULO 18.5 + 18.7 — POST /api/sunat/emit
 * 
 * ENDPOINT PRINCIPAL: Emite un comprobante electrónico SUNAT para una venta existente.
 * 
 * FLUJO:
 * 1. Validar venta existe y no tiene FIADO
 * 2. Validar permisos (CASHIER→BOLETA, OWNER→BOLETA+FACTURA)
 * 3. Crear ElectronicDocument DRAFT
 * 4. Generar y firmar el XML UBL
 * 5. Marcar como SIGNED
 * 6. Encolar job SUNAT (worker enviará asíncronamente)
 * 
 * IMPORTANTE:
 * - NO bloquea el checkout (se llama DESPUÉS de guardar venta)
 * - Si falla, venta YA está guardada
 * - FIADO bloqueado (409 FIADO_NOT_SUPPORTED)
 * 
 * MÓDULO 18.7: Idempotencia con emitKey
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { auditSunatEmitRequested, auditSunatEmitSuccess, auditSunatEmitFailed } from '@/domain/sunat/audit';
import { validateBoletaData, isValidRuc, isValidDni } from '@/lib/sunat/validation/fiscalValidations';
import { isSuperAdmin } from '@/lib/superadmin';
import { checkRateLimit, getClientIP } from '@/lib/rateLimit'; // ✅ MÓDULO S8
import { buildPayloadFromSale } from '@/lib/sunat/buildPayloadFromSale';
import { getNextSunatNumber, generateFullNumber } from '@/domain/sunat/correlatives';
import { generateInvoiceXML } from '@/lib/sunat/ubl/invoice';
import { loadCertificate } from '@/lib/sunat/cert/loadCertificate';
import { signXml, calculateXmlHash, verifyXmlSignature } from '@/lib/sunat/sign/signXmlCrypto';
import type { CustomerDocType, SunatDocType } from '@prisma/client';
import { buildSunatQrText } from '@/lib/sunat/qr';

/**
 * Genera emitKey para idempotencia
 * Hash de: saleId + docType + customerDocNumber
 */
function generateEmitKey(saleId: string, docType: string, customerDocNumber: string): string {
  const data = `${saleId}:${docType}:${customerDocNumber}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

function normalizeCustomerDocType(value: string): CustomerDocType {
  const normalized = value.trim().toUpperCase();
  const mapping: Record<string, CustomerDocType> = {
    '0': 'OTHER',
    '1': 'DNI',
    '4': 'CE',
    '6': 'RUC',
    '7': 'PASSPORT',
    DNI: 'DNI',
    RUC: 'RUC',
    CE: 'CE',
    CARNET_EXTRANJERIA: 'CE',
    PASSPORT: 'PASSPORT',
    PASAPORTE: 'PASSPORT',
    OTHER: 'OTHER',
  };
  return mapping[normalized] || 'OTHER';
}

export async function POST(req: NextRequest) {
  try {
    // ✅ MÓDULO S8: Rate limit SUNAT emit
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit('sunat', clientIP);
    
    if (!rateLimitResult.allowed) {
      const waitSeconds = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intenta en ${waitSeconds}s`, code: 'TOO_MANY_REQUESTS' },
        { status: 429, headers: { 'Retry-After': String(waitSeconds) } }
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const {
      saleId,
      docType, // 'BOLETA' | 'FACTURA'
      customerDocType, // 'DNI' | 'RUC' | 'CE' | etc
      customerDocNumber: rawCustomerDocNumber,
      customerName: rawCustomerName,
      customerAddress, // Opcional
      customerEmail, // Opcional
    } = body;

    const requestedCustomerDocType = typeof customerDocType === 'string'
      ? customerDocType.trim().toUpperCase()
      : '';
    const isFinalConsumer = docType === 'BOLETA'
      && (requestedCustomerDocType === 'OTHER' || requestedCustomerDocType === '0' || !requestedCustomerDocType);
    const customerDocNumber = isFinalConsumer
      ? '-'
      : ['RUC', '6', 'DNI', '1'].includes(requestedCustomerDocType)
        ? String(rawCustomerDocNumber || '').replace(/\D/g, '')
        : String(rawCustomerDocNumber || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const customerName = isFinalConsumer
      ? 'CLIENTES VARIOS'
      : String(rawCustomerName || '').trim();
    const effectiveCustomerDocType = isFinalConsumer ? 'OTHER' : requestedCustomerDocType;

    // 1. Validar campos obligatorios
    if (!saleId || !docType || !effectiveCustomerDocType || !customerDocNumber || !customerName) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: saleId, docType, customerDocType, customerDocNumber, customerName' },
        { status: 400 }
      );
    }

    if (!['BOLETA', 'FACTURA'].includes(docType)) {
      return NextResponse.json(
        { error: 'docType debe ser BOLETA o FACTURA' },
        { status: 400 }
      );
    }

    // 1.5 MÓDULO 18.7: Validaciones fiscales MVP
    if (docType === 'FACTURA') {
      // FACTURA requiere RUC válido
      if (!isValidRuc(customerDocNumber)) {
        return NextResponse.json(
          { 
            error: `FACTURA requiere RUC válido (11 dígitos; se recibieron ${customerDocNumber.length})`,
            code: 'INVALID_RUC_FOR_FACTURA',
            hint: 'El RUC debe tener exactamente 11 dígitos y formato válido',
          },
          { status: 400 }
        );
      }
      if (effectiveCustomerDocType !== 'RUC' && effectiveCustomerDocType !== '6') {
        return NextResponse.json(
          { 
            error: 'FACTURA requiere tipo de documento RUC',
            code: 'DOC_TYPE_MUST_BE_RUC',
          },
          { status: 400 }
        );
      }
    } else if (docType === 'BOLETA') {
      // BOLETA: DNI opcional pero si se incluye debe ser válido
      if (effectiveCustomerDocType === 'DNI' || effectiveCustomerDocType === '1') {
        if (!isValidDni(customerDocNumber)) {
          return NextResponse.json(
            { 
              error: 'DNI inválido (debe tener 8 dígitos)',
              code: 'INVALID_DNI',
              hint: 'El DNI debe tener exactamente 8 dígitos',
            },
            { status: 400 }
          );
        }
      }
    }

    // 2. Verificar permisos por rol
    const isSuper = isSuperAdmin(user.email);
    if (docType === 'FACTURA' && user.role !== 'OWNER' && !isSuper) {
      await auditSunatEmitFailed(
        user.userId,
        user.storeId!,
        saleId,
        docType,
        'Rol insuficiente para emitir FACTURA',
        null,
        null
      );

      return NextResponse.json(
        { error: 'Solo OWNER o SUPERADMIN pueden emitir FACTURA' },
        { status: 403 }
      );
    }

    // 3. Buscar venta con todos los datos necesarios
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: true,
              },
            },
          },
        },
        store: {
          include: {
            sunatSettings: true,
          },
        },
        electronicDocuments: true,
      },
    });

    if (!sale) {
      return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
    }

    if (docType === 'BOLETA') {
      const validation = validateBoletaData(
        effectiveCustomerDocType,
        customerDocNumber,
        Number(sale.total)
      );
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.errors[0], code: 'INVALID_BOLETA_CUSTOMER' },
          { status: 400 }
        );
      }
    }

    // 4. Verificar permisos de tienda
    if (!isSuper && sale.storeId !== user.storeId) {
      return NextResponse.json({ error: 'No tienes acceso a esta venta' }, { status: 403 });
    }

    // 5. FIADO bloqueado
    if (sale.paymentMethod === 'FIADO') {
      await auditSunatEmitFailed(
        user.userId,
        user.storeId!,
        saleId,
        docType,
        'FIADO no soporta emisión SUNAT',
        null,
        null
      );

      return NextResponse.json(
        { error: 'No se puede emitir comprobante para ventas FIADO' },
        { status: 409 }
      );
    }

    // 6. MÓDULO 18.7: Verificación de idempotencia con emitKey
    // Genera emitKey basado en saleId + docType + customerDocNumber
    const emitKey = generateEmitKey(saleId, docType, customerDocNumber);
    
    // 6.1 Verificar si ya existe documento con esta combinación
    const sameTypeDocuments = sale.electronicDocuments
      .filter((d) => d.saleId === saleId && d.docType === docType)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const existingDoc = sameTypeDocuments.find((d) =>
      ['SIGNED', 'SENT', 'ACCEPTED', 'OBSERVED', 'DRAFT'].includes(d.status)
    ) || sameTypeDocuments[0];

    if (existingDoc) {
      // Si ya existe, devolver el existente (idempotencia)
      const isActive = ['SIGNED', 'SENT', 'ACCEPTED', 'OBSERVED'].includes(existingDoc.status);
      
      if (isActive) {
        console.log(`[SUNAT] Idempotencia: Documento existente ${existingDoc.fullNumber} para emitKey ${emitKey}`);
        
        return NextResponse.json({
          success: true,
          idempotent: true,
          message: 'Documento ya emitido previamente',
          document: {
            id: existingDoc.id,
            fullNumber: existingDoc.fullNumber,
            status: existingDoc.status,
          },
          emitKey,
        });
      } else if (existingDoc.status === 'REJECTED' || existingDoc.status === 'ERROR') {
        // Si fue rechazado/error, permitir reintento (se creará nuevo documento)
        console.log(`[SUNAT] Documento previo ${existingDoc.fullNumber} en estado ${existingDoc.status}, permitiendo reemisión`);
      } else if (existingDoc.status === 'DRAFT') {
        // Si está en DRAFT, continuar procesándolo
        console.log(`[SUNAT] Documento previo ${existingDoc.fullNumber} en DRAFT, retomando proceso`);
      }
    }

    // 7. Verificar SUNAT habilitado en tienda
    if (!sale.store.sunatSettings) {
      return NextResponse.json(
        { error: 'SUNAT no configurado para esta tienda' },
        { status: 400 }
      );
    }

    const settings = sale.store.sunatSettings;
    if (!settings.enabled) {
      return NextResponse.json(
        { error: 'SUNAT deshabilitado en esta tienda' },
        { status: 400 }
      );
    }

    // 8. Determinar serie según docType
    const normalizedCustomerDocType = normalizeCustomerDocType(effectiveCustomerDocType);
    const fiscalDocType = docType as SunatDocType;

    // Construir el snapshot fiscal definitivo de la venta. Esta función
    // distribuye descuentos y calcula base/IGV desde el total final cobrado.
    const payload = await buildPayloadFromSale(prisma, {
      saleId,
      docType: fiscalDocType,
      customer: {
        docType: normalizedCustomerDocType,
        docNumber: customerDocNumber,
        name: customerName,
        address: customerAddress,
      },
    });

    // Reusar un DRAFT interrumpido. Para uno nuevo, reservar correlativo y
    // crear el documento en una sola transacción evita colisiones entre cajas.
    const electronicDoc = existingDoc?.status === 'DRAFT'
      ? existingDoc
      : await prisma.$transaction(async (tx) => {
          const series = docType === 'BOLETA'
            ? (settings.defaultBoletaSeries || 'B001')
            : (settings.defaultFacturaSeries || 'F001');
          const number = await getNextSunatNumber(tx, sale.storeId, fiscalDocType);
          const fullNumber = generateFullNumber(series, number);

          return tx.electronicDocument.create({
            data: {
              storeId: sale.storeId,
              saleId: sale.id,
              docType: fiscalDocType,
              series,
              number,
              fullNumber,
              status: 'DRAFT',
              issueDate: sale.createdAt,
              currency: 'PEN',
              taxable: payload.totals.subtotal,
              igv: payload.totals.tax,
              exempt: payload.totals.exempt ?? 0,
              unaffected: payload.totals.unaffected ?? 0,
              icbper: payload.totals.icbper ?? 0,
              total: payload.totals.total,
              customerDocType: normalizedCustomerDocType,
              customerDocNumber,
              customerName,
              customerAddress: customerAddress || null,
            },
          });
        });

    await auditSunatEmitRequested(
      user.userId,
      user.storeId!,
      saleId,
      docType,
      electronicDoc.fullNumber,
      effectiveCustomerDocType,
      customerDocNumber
    );

    payload.metadata = {
      ...payload.metadata,
      documentId: electronicDoc.id,
      series: electronicDoc.series,
      number: electronicDoc.number,
      fullNumber: electronicDoc.fullNumber,
      issueDate: electronicDoc.issueDate,
    };

    let signedXml: string;
    let hash: string;
    try {
      const unsignedXml = generateInvoiceXML(payload, electronicDoc.id);
      const certificate = await loadCertificate(prisma, sale.storeId);
      const signed = signXml(unsignedXml, certificate, electronicDoc.id);

      if (!verifyXmlSignature(signed.signedXml, certificate)) {
        throw new Error('La firma XML generada no pudo verificarse');
      }

      signedXml = signed.signedXml;
      hash = calculateXmlHash(signedXml);
    } catch (signingError) {
      await prisma.electronicDocument.update({
        where: { id: electronicDoc.id },
        data: {
          status: 'ERROR',
          sunatMessage: signingError instanceof Error
            ? signingError.message.substring(0, 1000)
            : 'Error generando o firmando el XML',
        },
      });
      throw signingError;
    }

    const qrText = buildSunatQrText({
      issuerRuc: payload.issuer.ruc,
      docType: fiscalDocType,
      series: electronicDoc.series,
      number: electronicDoc.number,
      igv: payload.totals.tax,
      total: payload.totals.total,
      issueDate: electronicDoc.issueDate,
      customerDocType: normalizedCustomerDocType,
      customerDocNumber,
      hash,
    });

    // Guardar firma y job de forma atómica. El worker nunca verá un trabajo
    // encolado cuyo documento todavía no tenga XML firmado.
    const [, job] = await prisma.$transaction([
      prisma.electronicDocument.update({
        where: { id: electronicDoc.id },
        data: {
          xmlSigned: signedXml,
          hash,
          qrText,
          status: 'SIGNED',
          sunatMessage: null,
        },
      }),
      prisma.sunatJob.create({
        data: {
          storeId: sale.storeId,
          documentId: electronicDoc.id,
          type: 'SEND_CPE',
          status: 'QUEUED',
          attempts: 0,
          nextRunAt: new Date(),
        },
      }),
    ]);

    await auditSunatEmitSuccess(
      user.userId,
      user.storeId!,
      saleId,
      docType,
      electronicDoc.fullNumber,
      electronicDoc.id,
      job.id
    );

    return NextResponse.json({
      success: true,
      document: {
        id: electronicDoc.id,
        fullNumber: electronicDoc.fullNumber,
        status: 'SIGNED',
        queuedAt: new Date(),
      },
      job: {
        id: job.id,
        status: job.status,
      },
      message: 'Comprobante firmado y encolado para envío a SUNAT',
    });

  } catch (error: any) {
    console.error('Error en POST /api/sunat/emit:', error);

    return NextResponse.json(
      { error: error.message || 'Error al emitir comprobante' },
      { status: 500 }
    );
  }
}
